import { type Action, buildOptions, type Candidate, type DeviceEntry, idsIn } from './dm-options.js'
import type { HubEvent, North } from './north.js'

/**
 * The decision model (DM): a small model that picks one fixed device action, so a step of the
 * Agnes loop can go without the LLM. It knows the devices and the run-time ids from AgnesHub; the
 * plugin asks it at the steps the DM may take (plugin/dm.ts). Independent of Agnes.
 */

type Json = Record<string, unknown>

/** A System One request: the state in words and one Choice question. */
export type Ask = (body: { state: string; questions: Json }) => Promise<{
  answers?: { q?: { probabilities?: Record<string, number>; confidence?: number } }
  error?: unknown
}>

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
  /** The chosen option: an action's id, `nothing` or `ask_llm`. */
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

/** Cloudflare's clef, the DM's model: a 27B decision model on Workers AI. */
export function clef(account: string, token: string, model = 'clef'): Ask {
  return async (body) => {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/${model}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, ...body }),
      },
    )
    const json = (await res.json()) as { result?: Awaited<ReturnType<Ask>>; errors?: unknown }
    return res.ok && json.result ? json.result : { error: json.errors ?? json }
  }
}

/** What the DM did stays in its state this long. */
const DONE_MS = 600_000
const DONE_KEPT = 10
const KEEP_CANDIDATES = 12
const TEXT_MAX = 800

export class DecisionModel {
  private readonly candidates = new Map<string, Candidate[]>()
  /** Per conversation, what the DM did, newest last. */
  private readonly done = new Map<string, { time: number; text: string }[]>()

  constructor(
    private readonly north: North,
    private readonly scene: string,
    private readonly ask: Ask,
  ) {
    north.on('event', (event: HubEvent) => this.onEvent(event))
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
    const answer = await this.ask({
      state,
      questions: { q: { type: 'choice', instructions: 'Pick the one action to take right now.', criteria } },
    })
    const q = answer.answers?.q
    if (!q?.probabilities) throw new Error(JSON.stringify(answer.error ?? answer).slice(0, 200))
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

  /** Run-time ids from anyone's results become options for parameters of the same name. */
  private onEvent(event: HubEvent): void {
    if (event.type !== 'job' || event.data.state !== 'ended' || event.data.status !== 'done') return
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
