import type { DecisionModel } from './dm-models.js'
import { type Action, buildOptions, type Candidate, type DeviceEntry, idsIn } from './dm-options.js'
import type { HubEvent, North } from './north.js'

/**
 * The DM: a decision model (dm-models.ts) that picks one fixed device action, so a step of the
 * Agnes loop can go without the LLM. It knows the devices and the run-time ids from AgnesHub; the
 * plugin asks it at the steps the DM may take (plugin/dm.ts). It is told the task's devices with
 * their whole tool descriptions, whose preconditions show which step comes next. Independent of Agnes.
 */

type Json = Record<string, unknown>

/** What the DM is told about the step it decides. */
export interface Moment {
  /** What the person asked for in this conversation, if they asked. */
  instruction?: string
  /** The tool results this step answers. */
  happened: string
  /** The devices this task used so far; the devices `happened` names are added to them. */
  devices?: string[]
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

const KEEP_CANDIDATES = 12
const TEXT_MAX = 800

export class Dm {
  private readonly candidates = new Map<string, Candidate[]>()
  constructor(
    private readonly north: North,
    private readonly scene: string,
    readonly model: DecisionModel,
  ) {
    north.on('event', (event: HubEvent) => this.onEvent(event))
  }

  /** Asks the model once for one step of a conversation. Throws when the model cannot answer. */
  async decide(moment: Moment): Promise<Choice> {
    const devices = this.north.devices() as unknown as DeviceEntry[]
    const { criteria, actions } = buildOptions(devices, this.candidates)
    const named = new Set(moment.devices)
    const task = devices.filter((d) => named.has(d.id) || moment.happened.includes(d.id))
    const tooled = task.filter((d) => d.tools?.length)
    const state = [
      this.scene,
      moment.instruction && `The person asked: ${clip(moment.instruction)}`,
      tooled.length && `The devices in this task and their tools:\n${tooled.map(toolsText).join('\n')}`,
      moment.recent?.length && `Device actions so far in this task:\n${moment.recent.join('\n')}`,
      `What just happened:\n${clip(moment.happened)}`,
      task.length && `Now:\n${task.map(nowLine).join('\n')}`,
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

const clip = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text)

/** A device's tools with their whole descriptions. */
const toolsText = (d: DeviceEntry) =>
  `${d.id}:\n${(d.tools ?? []).map((t) => `- ${t.name}: ${t.description}`).join('\n')}`

/** A device's state now, in one line without times. */
function nowLine(d: DeviceEntry): string {
  const values = Object.entries(d.state.values)
    .filter(([name, v]) => v !== null && typeof v !== 'object' && d.state.fields[name]?.unit !== 's')
    .map(([name, v]) => {
      const unit = d.state.fields[name]?.unit
      return `${name} ${typeof v === 'number' ? Math.round(v * 10) / 10 : v}${unit ? ` ${unit}` : ''}`
    })
  return `${d.id} now: ${values.join(', ')}`
}
