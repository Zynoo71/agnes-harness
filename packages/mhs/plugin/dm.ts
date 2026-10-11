/**
 * The DM in the Agnes loop: an Operation standing in for the step's model call (core's `Inference`
 * segment). At a step that answers tool results or a wake-up from AgnesHub, the decision model
 * picks one fixed device action, and the step is that action's call_device or set_device, with no
 * LLM. Everything else, and every choice of `ask_llm`, goes to the LLM as before. A step the person
 * started always goes to the LLM: it reads what they want and makes the plan.
 */

import { createHash } from 'node:crypto'
import type { InferenceEvent, RequestBody } from '@agnes/protocol'
import type { DecisionModel, Moment } from '../server/dm.js'
import { NOTHING } from '../server/dm-options.js'

type Message = RequestBody['messages'][number]

/** The device actions whose results the DM may answer; it takes them too. */
const ACTIONS = ['call_device', 'set_device']
/** At most this many DM steps in a row; then the LLM looks again. */
const MAX_DM_STEPS = 3

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
  model: DecisionModel
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
  /** did: the step is the action; nothing: the turn ends; llm: the LLM takes the step. */
  outcome: 'did' | 'nothing' | 'llm'
  choice: string
  device?: string
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
      const dm = link()
      const conversation = request.sessionKey
      const llm = () => {
        streak.delete(conversation)
        return ctx.next()
      }
      if (!dm?.on(conversation) || !options.toolNames.includes('call_device')) return llm()
      const moment = momentOf(request.messages)
      if (!moment || (!moment.woken && (streak.get(conversation) ?? 0) >= MAX_DM_STEPS)) return llm()
      let picked: Awaited<ReturnType<DecisionModel['decide']>>
      try {
        picked = await dm.model.decide(conversation, moment)
      } catch (e) {
        const error = (e as Error).message
        dm.log(`DM could not decide: ${error}`)
        dm.report({ conversation, happened: moment.happened, outcome: 'error', error })
        return llm()
      }
      const [, p] = picked.top[0] as [string, number]
      const how = `sure ${Math.round(p * 100)}% among ${picked.options}, ${(picked.ms / 1000).toFixed(1)} s`
      const action = picked.action
      // Nothing to do after a wake-up ends the turn; within a task the LLM decides when it is done.
      const outcome = action ? 'did' : picked.choice === NOTHING && moment.woken ? 'nothing' : 'llm'
      dm.log(`DM ${picked.choice} (${how}) for ${conversation}`)
      dm.report({
        conversation: conversation,
        happened: moment.happened,
        choice: picked.choice,
        outcome,
        ...(action ? { device: action.device } : {}),
        top: picked.top,
        options: picked.options,
        confidence: picked.confidence,
        ms: picked.ms,
      })
      const target = { route: request.route, model: request.model }
      const parser = (ctx.session.d.contractForModel?.(target) ?? ctx.session.d.contract).parser_version
      if (action) {
        dm.model.did(conversation, picked.choice)
        const call =
          'values' in action
            ? { name: 'set_device', args: { device: action.device, values: action.values } }
            : { name: 'call_device', args: { device: action.device, tool: action.tool, args: action.args } }
        streak.set(conversation, (moment.woken ? 0 : (streak.get(conversation) ?? 0)) + 1)
        dmNotes.set(conversation, {
          call: callKey(call.name, call.args),
          note: { sure: p, options: picked.options, ms: picked.ms },
        })
        return step(request, parser, call)
      }
      streak.delete(conversation)
      if (outcome === 'nothing') return step(request, parser)
      return ctx.next()
    },
  }
}

/**
 * The step the DM may take, read from the request: the results of a device action, to carry the
 * task on, or a wake-up from AgnesHub. Undefined
 * when the person spoke last or the LLM was reading devices: then the LLM is making its plan.
 * `woken` is true only for a turn a wake-up started; a wake-up within a task leaves the end of the
 * task to the LLM.
 */
export function momentOf(messages: Message[]): (Moment & { woken: boolean }) | undefined {
  const results: string[] = []
  let i = messages.length - 1
  for (; i >= 0; i--) {
    const m = messages[i] as Message
    if (m.role === 'tool_result') results.unshift(textOf(m.content))
    else if (!(m.role === 'user' && isNote(textOf(m.content)))) break
  }
  const last = messages[i]
  const instruction = messages
    .slice(0, i + 1)
    .reverse()
    .find((m) => m.role === 'user' && !isNote(textOf(m.content)) && !isWake(textOf(m.content)))
  const asked = instruction ? { instruction: textOf(instruction.content) } : {}
  if (results.length && last?.role === 'assistant') {
    if (!last.toolCalls?.every((c) => ACTIONS.includes(c.name))) return undefined
    const said = textOf(last.content)
    return { ...asked, ...(said ? { said } : {}), happened: results.join('\n'), woken: false }
  }
  if (last?.role === 'user' && isWake(textOf(last.content))) {
    const before = messages
      .slice(0, i)
      .reverse()
      .find((m) => !(m.role === 'user' && isNote(textOf(m.content))))
    return { ...asked, happened: textOf(last.content), woken: before?.role !== 'tool_result' }
  }
  return undefined
}

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
  call?: { name: string; args: Record<string, unknown> },
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
  // A step without a call ends the turn, and an empty one would read as a failed answer.
  if (!call) yield { type: 'text_delta', delta: 'Nothing to do.' }
  if (call)
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
  yield { type: 'done', reason: call ? 'toolUse' : 'stop' }
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
