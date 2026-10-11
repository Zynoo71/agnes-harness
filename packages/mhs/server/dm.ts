import type { DecisionModel } from './dm-models.js'
import { type Action, buildOptions, type Candidate, type DeviceEntry, idsIn } from './dm-options.js'
import type { HubEvent, North } from './north.js'

/**
 * The DM: a decision model (dm-models.ts) that picks one fixed device action, so a step of the
 * Agnes loop can go without the LLM. It knows the devices and the run-time ids from AgnesHub; the
 * plugin asks it at the steps the DM may take (plugin/dm.ts). Independent of Agnes.
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

/** State changes this soon after a job on the device ended count as the job's doing. */
const AFTER_JOB_MS = 3000
/** What devices report within this window is told as one. */
const MERGE_MS = 1000
/** What the DM did stays in its state this long. */
const DONE_MS = 600_000
const DONE_KEPT = 10
const KEEP_CANDIDATES = 12
const TEXT_MAX = 800

export class Dm {
  private readonly candidates = new Map<string, Candidate[]>()
  /** Per conversation, what the DM did, newest last. */
  private readonly done = new Map<string, { time: number; text: string }[]>()
  /** Per device: a job is running (Infinity), or the time its last job ended plus AFTER_JOB_MS. */
  private readonly quietUntil = new Map<string, number>()
  /** Per device, the state values last seen. */
  private readonly seen = new Map<string, Json>()
  private reported: string[] = []
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly north: North,
    private readonly scene: string,
    readonly model: DecisionModel,
    /** Gets what devices report by themselves (an alert, a state that changed with no job), merged. */
    private readonly notice: (lines: string[]) => void = () => undefined,
  ) {
    north.on('event', (event: HubEvent) => this.onEvent(event))
    north.on('state', (device: string, values: Json) => this.onState(device, values))
  }

  stop(): void {
    clearTimeout(this.timer)
  }

  /** Asks the model once for one step of a conversation. Throws when the model cannot answer. */
  async decide(conversation: string, moment: Moment): Promise<Choice> {
    const devices = this.north.devices() as unknown as DeviceEntry[]
    const { criteria, actions } = buildOptions(devices, this.candidates)
    const now = Date.now()
    const done = (this.done.get(conversation) ?? [])
      .filter((d) => now - d.time < DONE_MS)
      .map((d) => `- ${Math.round((now - d.time) / 60_000)} min ago: ${d.text}`)
    const state = [
      this.scene,
      moment.instruction && `The person asked: ${clip(moment.instruction)}`,
      moment.said && `The LLM operator said: ${clip(moment.said)}`,
      `What just happened:\n${clip(moment.happened)}${nowText(devices, moment.happened)}`,
      done.length && `What you already did:\n${done.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const t = performance.now()
    const q = await this.model.rank(state, criteria, 'Pick the one action to take right now.')
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

  /** An enum field a device changed by itself: no job of its running or just ended. */
  private onState(id: string, values: Json): void {
    const d = this.north.devices().find((e) => e.id === id)
    const before = this.seen.get(id) ?? {}
    this.seen.set(id, { ...before, ...values })
    if (!d || performance.now() < (this.quietUntil.get(id) ?? 0)) return
    for (const [name, value] of Object.entries(values)) {
      const field = d.state.fields[name] as { enum?: unknown[]; writable?: boolean; description?: string }
      if (!field?.enum || field.writable || before[name] === undefined || before[name] === value) continue
      this.report(
        `${id}: ${name} changed from ${before[name]} to ${value}${field.description ? ` (${field.description})` : ''}`,
      )
    }
  }

  private report(line: string): void {
    this.reported.push(line)
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      const lines = this.reported
      this.reported = []
      this.notice(lines)
    }, MERGE_MS)
    this.timer.unref?.()
  }

  /** Alerts are reported; jobs keep their device's state changes quiet; results give run-time ids. */
  private onEvent(event: HubEvent): void {
    if (event.type === 'alert' && (event.data.alert === 'warn' || event.data.alert === 'bad'))
      this.report(event.text)
    if (event.type !== 'job' || !event.device) return
    if (event.data.state === 'running') this.quietUntil.set(event.device, Number.POSITIVE_INFINITY)
    else if (event.data.state === 'ended') this.quietUntil.set(event.device, performance.now() + AFTER_JOB_MS)
    if (event.data.state !== 'ended' || event.data.status !== 'done') return
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
