import type { DecisionModel } from './dm-models.js'
import {
  type Action,
  ASK_LLM,
  actionId,
  buildOptions,
  type Candidate,
  type DeviceEntry,
  idsIn,
} from './dm-options.js'
import type { HubEvent, North } from './north.js'

/**
 * The DM: a decision model (dm-models.ts) that picks one fixed device action, so a step of the
 * Agnes loop can go without the LLM. It knows the devices and the run-time ids from AgnesHub; the
 * plugin asks it at the steps the DM may take (plugin/dm.ts). While the LLM's plan has steps left,
 * it only judges whether the next one is right to take now. Independent of Agnes.
 */

type Json = Record<string, unknown>

/** What the DM is told about the step it decides. */
export interface Moment {
  /** What the person asked for in this conversation, if they asked. */
  instruction?: string
  /** What the LLM said last, its plan as far as it told it. */
  said?: string
  /** The tool results or the wake-up this step answers. */
  happened: string
  /** The steps the LLM said it takes next and has not taken yet, the next first. */
  plan?: Action[]
  /** The device actions of this task so far with how they ended, a line each, oldest first. */
  recent?: string[]
}

export interface Choice {
  /** The chosen option: an action's id or `ask_llm`. */
  choice: string
  /** The action to take, when the choice is one. */
  action?: Action
  /** The likeliest options with their probabilities, most likely first. */
  top: [string, number][]
  /** How many options it chose among. */
  options: number
  confidence: number | undefined
  /** How long the model took. */
  ms: number
}

/** What the DM did stays in its state this long. */
const DONE_MS = 600_000
const DONE_KEPT = 10
const KEEP_CANDIDATES = 12
const TEXT_MAX = 800

export class Dm {
  private readonly candidates = new Map<string, Candidate[]>()
  /** Per conversation, what the DM did, newest last. */
  private readonly done = new Map<string, { time: number; text: string }[]>()
  constructor(
    private readonly north: North,
    private readonly scene: string,
    readonly model: DecisionModel,
  ) {
    north.on('event', (event: HubEvent) => this.onEvent(event))
  }

  /**
   * Asks the model once for one step of a conversation. With a plan, the options are its next step
   * and `ask_llm`; undefined when that step names a device or tool that is not there. Throws when
   * the model cannot answer.
   */
  async decide(conversation: string, moment: Moment): Promise<Choice | undefined> {
    const devices = this.north.devices() as unknown as DeviceEntry[]
    const next = moment.plan?.[0]
    const options = next ? planOptions(devices, next) : buildOptions(devices, this.candidates)
    if (!options) return undefined
    const { criteria, actions } = options
    const now = Date.now()
    const done = (this.done.get(conversation) ?? [])
      .filter((d) => now - d.time < DONE_MS)
      .map((d) => `- ${Math.round((now - d.time) / 60_000)} min ago: ${d.text}`)
    const state = [
      this.scene,
      moment.instruction && `The person asked: ${clip(moment.instruction)}`,
      moment.said && `The LLM operator said: ${clip(moment.said)}`,
      moment.recent?.length && `Device actions so far in this task:\n${moment.recent.join('\n')}`,
      moment.plan?.length &&
        `The LLM operator's plan, still to do:\n${moment.plan.map((a, i) => `${i + 1}. ${actionId(a)}`).join('\n')}`,
      `What just happened:\n${clip(moment.happened)}${nowText(devices, [moment.happened, ...(moment.plan ?? []).map((a) => a.device)].join('\n'))}`,
      done.length && `What you already did:\n${done.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const t = performance.now()
    const q = await this.model.rank(
      state,
      criteria,
      next
        ? "Take the plan's next step now, or hand it to the LLM?"
        : 'Pick the one action to take right now.',
    )
    const top = Object.entries(q.probabilities).sort((a, b) => b[1] - a[1])
    const choice = (top[0] as [string, number])[0]
    const action = actions.get(choice)
    return {
      choice,
      ...(action ? { action } : {}),
      top: top.slice(0, 6),
      options: Object.keys(criteria).length,
      confidence: q.confidence,
      ms: Math.round(performance.now() - t),
    }
  }

  /** Notes what the DM did, so it does not do the same again. */
  did(conversation: string, text: string): void {
    const list = this.done.get(conversation) ?? []
    list.push({ time: Date.now(), text })
    this.done.set(conversation, list.slice(-DONE_KEPT))
  }

  /** The results of finished jobs give the run-time ids the DM's actions can take. */
  private onEvent(event: HubEvent): void {
    if (event.type !== 'job' || !event.device || event.data.state !== 'ended' || event.data.status !== 'done')
      return
    let job: { tool: string; arguments?: Json; result?: { data?: Json } }
    try {
      job = this.north.job(String(event.data.job)) as typeof job
    } catch {
      return
    }
    for (const [param, value] of Object.entries(job.arguments ?? {}))
      this.candidates.set(
        param,
        (this.candidates.get(param) ?? []).filter((c) => c.value !== value),
      )
    for (const [param, value] of idsIn(job.result?.data ?? {})) {
      const list = (this.candidates.get(param) ?? []).filter((c) => c.value !== value)
      list.push({ value, from: `(from ${event.device} ${job.tool})` })
      this.candidates.set(param, list.slice(-KEEP_CANDIDATES))
    }
  }
}

/** The plan's next step and `ask_llm`; undefined when the step names a device or tool not there. */
function planOptions(devices: DeviceEntry[], next: Action) {
  const d = devices.find((x) => x.id === next.device && x.available)
  const tool = 'tool' in next ? d?.tools?.find((t) => t.name === next.tool) : undefined
  if (!d || ('tool' in next && !tool)) return undefined
  const id = actionId(next)
  const what = tool ? (tool.description.split('. ')[0] ?? tool.description) : 'set these state values'
  return {
    criteria: {
      [id]: `the plan's next step: ${what}`,
      [ASK_LLM]:
        'hand it to the LLM operator: what just happened went wrong, or makes the next step wrong now',
    },
    actions: new Map<string, Action>([[id, next]]),
  }
}

const clip = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text)

/** One line per device the text names: its state now, without times. */
function nowText(devices: DeviceEntry[], text: string): string {
  const out: string[] = []
  for (const d of devices) {
    if (!text.includes(d.id)) continue
    const values = Object.entries(d.state.values)
      .filter(([name, v]) => v !== null && typeof v !== 'object' && d.state.fields[name]?.unit !== 's')
      .map(([name, v]) => {
        const unit = d.state.fields[name]?.unit
        return `${name} ${typeof v === 'number' ? Math.round(v * 10) / 10 : v}${unit ? ` ${unit}` : ''}`
      })
    out.push(`${d.id} now: ${values.join(', ')}`)
  }
  return out.length ? `\n${out.join('\n')}` : ''
}
