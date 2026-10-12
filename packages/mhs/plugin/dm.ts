/**
 * The DM in the Agnes loop: an Operation standing in for the step's model call (core's `Inference`
 * segment). The decision model takes a step, as a call_device or set_device with no LLM, in three
 * cases: the LLM said with `then` which steps come next, and the DM judges whether the next one is
 * right now; a wake-up from AgnesHub, where it picks one fixed device action; and after its own
 * action, up to MAX_DM_STEPS in a row. Everything else, every failed result and every choice of
 * `ask_llm` goes to the LLM as before. A step the person started always goes to the LLM: it reads
 * what they want and makes the plan.
 */

import { createHash } from 'node:crypto'
import type { InferenceEvent, RequestBody } from '@agnes/protocol'
import type { Dm, Moment } from '../server/dm.js'
import { type Action, actionId } from '../server/dm-options.js'

type Message = RequestBody['messages'][number]

/** The device actions whose results the DM may answer; it takes them too. */
const ACTIONS = ['call_device', 'set_device']
/** A step that read devices is the LLM looking before it plans: the next step stays the LLM's. */
const READS = ['read_device', 'list_devices']
/** At most this many DM steps in a row; then the LLM looks again. */
const MAX_DM_STEPS = 3
/** An action the DM is less sure of than this goes to the LLM: in tests such picks were mostly wrong. */
const MIN_SURE = 0.2
/** The task's last device actions the DM is told of; its own pick may not repeat the last few. */
const RECENT = 6
const NO_REPEAT = 4

/** The parts of core's replacement context this Operation reads. */
export interface InferenceContext {
  input: { request: RequestBody; options: { toolNames: string[] } }
  next: () => Promise<AsyncIterable<InferenceEvent>>
  session: {
    d: {
      contract: { parser_version: string }
      contractForModel?: (target: { route: string; model: string }) => { parser_version: string }
    }
  }
}

export interface DmLink {
  dm: Dm
  /** Whether the DM may take steps in this conversation. */
  on(conversation: string): boolean
  /** Tells pages of a decision, as a `dm` hub event. */
  report(decision: Decision | DecisionError): void
  log(line: string): void
}

/** One decision, as the `dm` hub event's data carries it (hub-api.md section 15.5). */
export interface Decision {
  conversation: string
  /** What the step answered: tool results or a wake-up. */
  happened: string
  /** The DM judged the next step of the LLM's plan (`then`), not among every action. */
  planned: boolean
  /** did: the step is the action; llm: the LLM takes the step. */
  outcome: 'did' | 'llm'
  choice: string
  device?: string
  /** The step's tool call, when the DM took it: pages match it to the conversation's call. */
  call?: { name: string; args: Record<string, unknown> }
  top: [string, number][]
  options: number
  confidence: number | undefined
  ms: number
}

/** The model could not decide; the LLM takes the step. */
export interface DecisionError {
  conversation: string
  happened: string
  outcome: 'error'
  error: string
}

/** What a DM step's card shows; never in the conversation, where the LLM would copy it. */
export interface DmNote {
  /** The decision model: jev, clef. */
  model: string
  sure: number
  options: number
  ms: number
}

/**
 * Per conversation, the DM's call about to run and its note, for the tool to add to its result's
 * structured facts (the card's DM badge).
 */
export const dmNotes = new Map<string, { call: string; note: DmNote }>()

/** The key a call is matched by: the tool and its arguments. */
export const callKey = (name: string, args: unknown) => `${name} ${canonicalJson(args)}`

export function dmOperation(link: () => DmLink | undefined) {
  /** Per conversation, how many DM steps came in a row. */
  const streak = new Map<string, number>()
  return {
    name: 'mhs:dm',
    slot: { replace: 'Inference' as const },
    replay: 'never' as const,
    applicable: async () => 'applied' as const,
    run: async () => ({}),
    async replace(ctx: InferenceContext): Promise<AsyncIterable<InferenceEvent>> {
      const { request, options } = ctx.input
      const hub = link()
      const conversation = request.sessionKey
      const llm = () => {
        streak.delete(conversation)
        return ctx.next()
      }
      if (!hub?.on(conversation) || !options.toolNames.includes('call_device')) return llm()
      const moment = momentOf(request.messages)
      if (!moment || moment.failed) return llm()
      const chain = streak.get(conversation) ?? 0
      const planned = Boolean(moment.plan?.length)
      // After the LLM's own results the LLM goes on, unless it said what comes next.
      if (!planned && !moment.woken && (chain === 0 || chain >= MAX_DM_STEPS)) return llm()
      let picked: Awaited<ReturnType<Dm['decide']>>
      try {
        picked = await hub.dm.decide(conversation, moment)
      } catch (e) {
        const error = (e as Error).message
        hub.log(`DM could not decide: ${error}`)
        hub.report({ conversation, happened: moment.happened, outcome: 'error', error })
        return llm()
      }
      if (!picked) return llm()
      const [, p] = picked.top[0] as [string, number]
      const how = `sure ${Math.round(p * 100)}% among ${picked.options}, ${(picked.ms / 1000).toFixed(1)} s`
      // Only the LLM judges that nothing needs doing; the DM only acts, when sure enough and not
      // again what was just done, or hands over.
      const repeat = !planned && picked.action && moment.lastActions.includes(canonicalJson(picked.action))
      const action = p >= MIN_SURE && !repeat ? picked.action : undefined
      const outcome = action ? 'did' : 'llm'
      hub.log(`DM ${picked.choice} (${how}) for ${conversation}`)
      const call: Decision['call'] =
        action &&
        ('values' in action
          ? { name: 'set_device', args: { device: action.device, values: action.values } }
          : { name: 'call_device', args: { device: action.device, tool: action.tool, args: action.args } })
      hub.report({
        conversation,
        happened: moment.happened,
        planned,
        choice: picked.choice,
        outcome,
        ...(action && call ? { device: action.device, call } : {}),
        top: picked.top,
        options: picked.options,
        confidence: picked.confidence,
        ms: picked.ms,
      })
      const target = { route: request.route, model: request.model }
      const parser = (ctx.session.d.contractForModel?.(target) ?? ctx.session.d.contract).parser_version
      if (call) {
        hub.dm.did(conversation, picked.choice)
        // A step of the LLM's plan is the LLM's; only the DM's own picks count toward its limit.
        if (planned) streak.delete(conversation)
        else streak.set(conversation, (moment.woken ? 0 : chain) + 1)
        dmNotes.set(conversation, {
          call: callKey(call.name, call.args),
          note: { model: hub.dm.model.name, sure: p, options: picked.options, ms: picked.ms },
        })
        return step(request, parser, call)
      }
      streak.delete(conversation)
      return ctx.next()
    },
  }
}

/** A moment as the plugin reads it, with what it needs besides what the DM is told. */
export type StepMoment = Moment & {
  /** A wake-up started the turn. */
  woken: boolean
  /** One of the results the step answers is an error: the LLM takes it. */
  failed: boolean
  /** The task's last device actions, as canonical JSON, for the DM not to repeat them. */
  lastActions: string[]
}

/**
 * The step the DM may take, read from the request: the results of a device action, to carry the
 * task on, or a wake-up from AgnesHub. Undefined when the person spoke last or the LLM was reading
 * devices: then the LLM is making its plan. `woken` is true only for a turn a wake-up started.
 */
export function momentOf(messages: Message[]): StepMoment | undefined {
  const results: Message[] = []
  let i = messages.length - 1
  for (; i >= 0; i--) {
    const m = messages[i] as Message
    if (m.role === 'tool_result') results.unshift(m)
    else if (!(m.role === 'user' && isNote(textOf(m.content)))) break
  }
  const last = messages[i]
  const start = messages.findLastIndex(
    (m, k) => k <= i && m.role === 'user' && !isNote(textOf(m.content)) && !isWake(textOf(m.content)),
  )
  const instruction = messages[start]
  const asked = instruction ? { instruction: textOf(instruction.content) } : {}
  const task = taskOf(messages.slice(start + 1))
  if (results.length && last?.role === 'assistant') {
    const calls = last.toolCalls ?? []
    if (!calls.some((c) => ACTIONS.includes(c.name)) || calls.some((c) => READS.includes(c.name)))
      return undefined
    const said = textOf(last.content)
    return {
      ...asked,
      ...(said ? { said } : {}),
      happened: results.map((r) => textOf(r.content)).join('\n'),
      ...task,
      woken: false,
      failed: results.some((r) => r.role === 'tool_result' && r.isError),
    }
  }
  if (last?.role === 'user' && isWake(textOf(last.content))) {
    const before = messages
      .slice(0, i)
      .reverse()
      .find((m) => !(m.role === 'user' && isNote(textOf(m.content))))
    return {
      ...asked,
      happened: textOf(last.content),
      ...task,
      woken: before?.role !== 'tool_result',
      failed: false,
    }
  }
  return undefined
}

/**
 * What a task's device actions tell the DM: the steps the LLM said come next (the `then` of its
 * latest call that had one) that nobody has taken yet, and the actions so far with their results.
 * A step taken out of the plan's order ends the plan.
 */
function taskOf(messages: Message[]): { plan?: Action[]; recent?: string[]; lastActions: string[] } {
  const results = new Map<string, string>()
  for (const m of messages) if (m.role === 'tool_result') results.set(m.toolUseId, textOf(m.content))
  let plan: Action[] = []
  const done: Action[] = []
  const recent: string[] = []
  // One step's calls run together: a call beside the one that set a plan does not end it, and a
  // later step keeps the plan when one of its calls is the plan's next step.
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    let next = false
    let set = false
    for (const c of (m.toolCalls ?? []).filter((c) => ACTIONS.includes(c.name))) {
      const { then, ...args } = c.args as Record<string, unknown>
      const action = actionOf(c.name, args)
      if (!action) continue
      if (Array.isArray(then) && then.length) {
        plan = stepsOf(then)
        set = true
      } else if (!set && plan[0] && canonicalJson(plan[0]) === canonicalJson(action)) next = true
      done.push(action)
      const result = results.get(c.toolUseId)
      recent.push(`- ${actionId(action)}: ${result ? clip(result.split('. ')[0] ?? result) : 'running'}`)
    }
    if (set) continue
    if (next) plan = plan.slice(1)
    else if ((m.toolCalls ?? []).some((c) => ACTIONS.includes(c.name))) plan = []
  }
  return {
    ...(plan.length ? { plan } : {}),
    ...(recent.length ? { recent: recent.slice(-RECENT) } : {}),
    lastActions: done.slice(-NO_REPEAT).map(canonicalJson),
  }
}

/** A call_device or set_device call's arguments as the action it takes; undefined without a device. */
function actionOf(name: string, args: Record<string, unknown>): Action | undefined {
  if (typeof args.device !== 'string') return undefined
  if (name === 'set_device')
    return { device: args.device, values: (args.values ?? {}) as Record<string, unknown> }
  if (typeof args.tool !== 'string') return undefined
  return { device: args.device, tool: args.tool, args: (args.args ?? {}) as Record<string, unknown> }
}

/** The steps of a `then`, up to the first that is not a call_device or set_device argument object. */
function stepsOf(then: unknown[]): Action[] {
  const steps: Action[] = []
  for (const step of then) {
    const s = (step ?? {}) as Record<string, unknown>
    const action = actionOf('values' in s ? 'set_device' : 'call_device', s)
    if (!action) break
    steps.push(action)
  }
  return steps
}

const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 160)}…` : text)
const textOf = (content: { type: string; text?: string }[]) =>
  content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim()
const isNote = (text: string) => text.startsWith('[hook context]') || text.startsWith('[skill loaded]')
const isWake = (text: string) => text.includes('[AgnesHub]')

/** A step as a provider would stream it, so core records and runs it like any other. */
async function* step(
  request: RequestBody,
  parserVersion: string,
  call: { name: string; args: Record<string, unknown> },
): AsyncIterable<InferenceEvent> {
  yield {
    type: 'sent',
    stamp: {
      prompt_prefix_hash: null,
      tool_schema_hash: sha256(canonicalJson(request.tools).normalize('NFC')),
      parser_version: parserVersion,
      contract_id: request.contractId,
      model: { route: request.route, id: request.model },
      derived_hash: request.derivedHash,
      sent_hash: request.derivedHash,
      transforms: [{ event: 'sent_hash', ext: 'unreported' }],
    },
  }
  yield {
    type: 'toolcall_end',
    call: { toolUseId: '', name: call.name, args: call.args as never, ordinal: 0 },
    via: 'native',
  }
  yield {
    type: 'usage',
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    credits: 0,
    creditSource: 'estimated',
  }
  yield { type: 'done', reason: 'toolUse' }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** Canonical JSON as @agnes/ai hashes the tool disclosure: keys sorted, undefined dropped. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`
}
