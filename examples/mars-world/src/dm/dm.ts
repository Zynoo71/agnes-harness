import {
  type Action,
  ASK_LLM,
  buildOptions,
  type Candidate,
  type DeviceEntry,
  idsIn,
  NOTHING,
} from '@agnes/mhs/dm-options'

/**
 * The decision model (DM) of the DM + LLM mode (rosorin docs/dm-mode-design.md): an AgnesHub agent
 * client named DM. What devices report by themselves (an alert, an enum state that changed while
 * no job ran on the device) becomes one Choice question to the model behind POST /dm; the top
 * option is done at once, `nothing` is noted, and `ask_llm` wakes the LLM's conversation on duty
 * through hub/brief. After an action it asks again, up to three actions; the state lists what it
 * did in the last ten minutes, so it does not do the same again.
 */

type Json = Record<string, unknown>

/** One decision as it goes: asked, then acting on the choice, then done. Pages draw it live. */
export interface Decision {
  time: number
  trigger: string[]
  stage: 'deciding' | 'acting' | 'done'
  /** How many options it chose among. */
  options: number
  /** The likeliest options with their probabilities, most likely first. */
  top: [string, number][]
  /** The model's own certainty, from the probabilities. */
  confidence: number | undefined
  outcome: 'did' | 'nothing' | 'llm' | 'error' | undefined
  /** What came of it: the action's result, whether the LLM was woken, or the error. */
  detail: string
  /** How long the model took to choose. */
  ms: number
}

/** State changes this soon after a job on the device ended count as the job's doing. */
const AFTER_JOB_MS = 3000
/** Triggers within this window make one decision. */
const MERGE_MS = 1000
const MAX_ACTIONS = 3
/** What the DM did stays in its state this long. */
const DONE_MS = 600_000
const KEEP_CANDIDATES = 12
const KEEP_DECISIONS = 20
/** Options a page shows per decision. */
const SHOWN = 6

export class DM {
  readonly decisions: Decision[] = []
  /** Goes up whenever a decision changes, for pages that redraw. */
  version = 0
  private ws: WebSocket | undefined
  private next = 0
  private readonly replies = new Map<string, (m: Json) => void>()
  private readonly results = new Map<string, (r: Json) => void>()
  private readonly devices = new Map<string, DeviceEntry>()
  /** Per device: a job is running (Infinity), or the time its last job ended plus AFTER_JOB_MS. */
  private readonly quietUntil = new Map<string, number>()
  private readonly candidates = new Map<string, Candidate[]>()
  private pending: string[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private deciding = false
  private readonly done: { time: number; text: string }[] = []

  constructor(
    private readonly hub: string,
    private readonly scene: string,
    /** Without acting, decisions are only recorded: for trying the model out. */
    private readonly act: boolean,
    private readonly log: (line: string) => void,
  ) {}

  start(): void {
    const ws = new WebSocket(new URL('/ws/hub', this.hub.replace(/^http/, 'ws')).href)
    this.ws = ws
    ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as Json)
    ws.onopen = async () => {
      await this.request('hub/hello', { role: 'agent', client: { name: 'DM' } })
      const { devices } = (await this.request('hub/devices', {})) as { devices: DeviceEntry[] }
      for (const d of devices) this.devices.set(d.id, d)
      await this.request('hub/subscribe', { events: ['alert', 'job'] })
      this.log('DM connected')
    }
    ws.onclose = () => this.log('DM disconnected')
  }

  stop(): void {
    this.ws?.close()
    this.ws = undefined
    clearTimeout(this.timer)
    this.pending = []
  }

  private request(method: string, params: Json): Promise<Json> {
    const id = `dm${++this.next}`
    return new Promise((resolve, reject) => {
      this.replies.set(id, (m) =>
        m.error ? reject(new Error((m.error as { message: string }).message)) : resolve(m.result as Json),
      )
      this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  private onMessage(m: Json): void {
    if (typeof m.id === 'string') {
      this.replies.get(m.id)?.(m)
      this.replies.delete(m.id)
      return
    }
    const p = (m.params ?? {}) as Json
    if (m.method === 'hub/changed') for (const d of p.devices as DeviceEntry[]) this.devices.set(d.id, d)
    else if (m.method === 'hub/state') this.onState(String(p.device), p.values as Json)
    else if (m.method === 'hub/event') void this.onEvent(p.event as Json)
    else if (m.method === 'hub/result') {
      this.results.get(String(p.job))?.(p)
      this.results.delete(String(p.job))
    }
  }

  /** An enum field a device changed by itself: no job of its running or just ended. */
  private onState(id: string, values: Json): void {
    const d = this.devices.get(id)
    if (!d) return
    const quiet = performance.now() >= (this.quietUntil.get(id) ?? 0)
    for (const [name, value] of Object.entries(values)) {
      const field = d.state.fields[name]
      const before = d.state.values[name]
      d.state.values[name] = value
      if (!quiet || !field?.enum || field.writable || before === undefined || before === value) continue
      this.trigger(
        `${id}: ${name} changed from ${before} to ${value}${field.description ? ` (${field.description})` : ''}`,
      )
    }
  }

  private async onEvent(event: Json): Promise<void> {
    const data = (event.data ?? {}) as Json
    const device = String(event.device)
    if (event.type === 'alert' && (data.alert === 'warn' || data.alert === 'bad'))
      this.trigger(String(event.text))
    if (event.type !== 'job') return
    if (data.state === 'running') {
      this.quietUntil.set(device, Number.POSITIVE_INFINITY)
      return
    }
    this.quietUntil.set(device, performance.now() + AFTER_JOB_MS)
    if (data.status !== 'done') return
    // Run-time ids from anyone's result become options for parameters of the same name.
    const job = (await this.request('hub/job', { job: data.job }).catch(() => undefined)) as
      | { tool: string; arguments: Json; result?: { data?: Json } }
      | undefined
    if (!job) return
    for (const [param, value] of Object.entries(job.arguments))
      this.candidates.set(
        param,
        (this.candidates.get(param) ?? []).filter((c) => c.value !== value),
      )
    for (const [param, value] of idsIn(job.result?.data ?? {})) {
      const list = (this.candidates.get(param) ?? []).filter((c) => c.value !== value)
      list.push({ value, from: `(from ${device} ${job.tool})` })
      this.candidates.set(param, list.slice(-KEEP_CANDIDATES))
    }
  }

  private trigger(line: string): void {
    this.log(`DM sees: ${line}`)
    this.pending.push(line)
    if (!this.timer && !this.deciding) this.timer = setTimeout(() => void this.run(), MERGE_MS)
  }

  /** One decision for everything that came in, then again for what came in meanwhile. */
  private async run(): Promise<void> {
    this.timer = undefined
    this.deciding = true
    const lines = this.pending
    this.pending = []
    try {
      for (let i = 0; i < MAX_ACTIONS; i++) if (!(await this.decide(lines))) break
    } finally {
      this.deciding = false
      if (this.pending.length && this.ws) this.timer = setTimeout(() => void this.run(), MERGE_MS)
    }
  }

  /** Asks the model once; true when it acted, so it is asked again. */
  private async decide(lines: string[]): Promise<boolean> {
    const { criteria, actions } = buildOptions([...this.devices.values()], this.candidates)
    const now = Date.now()
    const done = this.done
      .filter((d) => now - d.time < DONE_MS)
      .map((d) => `- ${Math.round((now - d.time) / 60_000)} min ago: ${d.text}`)
    const state = `${this.scene}\n\nWhat just happened:\n${lines.join('\n')}${this.nowText(lines)}${
      done.length ? `\n\nWhat you already did:\n${done.join('\n')}` : ''
    }`
    const d: Decision = {
      time: Date.now(),
      trigger: lines,
      stage: 'deciding',
      options: Object.keys(criteria).length,
      top: [],
      confidence: undefined,
      outcome: undefined,
      detail: '',
      ms: 0,
    }
    this.decisions.unshift(d)
    this.decisions.splice(KEEP_DECISIONS)
    this.version++
    const end = (outcome: NonNullable<Decision['outcome']>, detail: string) => {
      Object.assign(d, { stage: 'done', outcome, detail })
      this.version++
      this.log(
        `DM ${outcome}: ${d.top
          .slice(0, 3)
          .map(([k, p]) => `${k} ${p.toFixed(2)}`)
          .join(' | ')} — ${detail}`,
      )
    }
    const t = performance.now()
    try {
      const res = await fetch('/dm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state,
          questions: {
            q: { type: 'choice', instructions: 'Pick the one action to take right now.', criteria },
          },
        }),
      })
      const answer = (await res.json()) as {
        answers?: { q?: { probabilities: Record<string, number>; confidence?: number } }
        error?: unknown
      }
      const q = answer.answers?.q
      if (!q?.probabilities) throw new Error(JSON.stringify(answer.error ?? answer).slice(0, 200))
      d.top = Object.entries(q.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, SHOWN)
      d.confidence = q.confidence
      d.ms = Math.round(performance.now() - t)
    } catch (e) {
      d.ms = Math.round(performance.now() - t)
      end('error', String(e))
      return false
    }
    const [choice, p] = d.top[0] as [string, number]
    const options = d.top
      .slice(0, 3)
      .map(([k, q]) => `${k} ${q.toFixed(2)}`)
      .join(', ')
    if (choice === NOTHING) {
      end('nothing', 'nothing to do')
      return false
    }
    if (choice === ASK_LLM) {
      if (!this.act) {
        end('llm', 'would hand it to the LLM')
        return false
      }
      d.stage = 'acting'
      this.version++
      const { woken } = (await this.request('hub/brief', {
        text: `${lines.join(' ')} Handed to you (DM options: ${options}).`,
        wake: true,
      }).catch(() => ({ woken: false }))) as { woken: boolean }
      end('llm', woken ? 'the LLM is woken' : 'no LLM conversation on duty')
      return false
    }
    const action = actions.get(choice) as Action
    if (!this.act) {
      end('did', 'would do it (not acting)')
      return false
    }
    d.stage = 'acting'
    this.version++
    const result = await this.perform(action)
    end('did', result)
    void this.request('hub/brief', {
      text: `did ${choice} (${p.toFixed(2)}) after: ${lines.join(' ')} Result: ${result}`,
    }).catch(() => undefined)
    this.done.push({ time: Date.now(), text: `${choice}: ${result}` })
    this.done.splice(0, this.done.length - 10)
    return true
  }

  /** One line per device the trigger names: its state now, without times. */
  private nowText(lines: string[]): string {
    const ids = new Set(lines.map((l) => l.split(':')[0] ?? ''))
    const out: string[] = []
    for (const id of ids) {
      const d = this.devices.get(id)
      if (!d) continue
      const values = Object.entries(d.state.values)
        .filter(([name, v]) => v !== null && typeof v !== 'object' && d.state.fields[name]?.unit !== 's')
        .map(([name, v]) => {
          const unit = d.state.fields[name]?.unit
          return `${name} ${typeof v === 'number' ? Math.round(v * 10) / 10 : v}${unit ? ` ${unit}` : ''}`
        })
      out.push(`${id} now: ${values.join(', ')}`)
    }
    return out.length ? `\n${out.join('\n')}` : ''
  }

  /** Calls the tool or sets the fields; returns the result's text. */
  private async perform(action: Action): Promise<string> {
    try {
      if ('values' in action) {
        const r = await this.request('hub/set', { device: action.device, values: action.values })
        return String(r.text)
      }
      const reply = await this.request('hub/call', {
        device: action.device,
        tool: action.tool,
        arguments: action.args,
      })
      if (!reply.accepted) return String(reply.text ?? reply.reason)
      const result = await new Promise<Json | undefined>((resolve) => {
        this.results.set(String(reply.job), resolve)
        setTimeout(() => resolve(undefined), 120_000)
      })
      return result ? String(result.text) : `still running as ${reply.job}`
    } catch (e) {
      return `failed: ${(e as Error).message}`
    }
  }
}
