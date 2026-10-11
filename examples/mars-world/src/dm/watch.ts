/**
 * The DM's decisions as the page shows them. The decision model works inside Agnes's loop (the MHS
 * plugin's plugin/dm.ts) and AgnesHub sends each decision as a `dm` event; this client only
 * listens, for the DM panel.
 */

type Json = Record<string, unknown>

/** One decision, as the `dm` hub event's data carries it. */
export interface Decision {
  /** Hub time, in seconds. */
  time: number
  /** What the step answered: tool results or what devices reported, a line each. */
  trigger: string[]
  /** Whether a wake-up from AgnesHub (what devices reported) started the step. */
  woken: boolean
  choice: string
  /** did: the step was the action; llm: the LLM took the step; error: the model could not decide, so the LLM took it. */
  outcome: 'did' | 'llm' | 'error'
  error?: string
  /** The likeliest options with their probabilities, most likely first. */
  top: [string, number][]
  /** How many options it chose among. */
  options: number
  /** The model's own certainty, from the probabilities. */
  confidence: number | undefined
  /** How long the model took to choose. */
  ms: number
}

const KEEP = 20

export class DmWatch {
  readonly decisions: Decision[] = []
  /** Goes up with every decision, for pages that redraw. */
  version = 0
  private closed = false

  constructor(private readonly hub: string) {}

  start(): void {
    const ws = new WebSocket(new URL('/ws/hub', this.hub.replace(/^http/, 'ws')).href)
    ws.onopen = () => {
      const send = (id: string, method: string, params: Json) =>
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      send('1', 'hub/hello', { role: 'ui', client: { name: 'Mars world DM panel' } })
      send('2', 'hub/subscribe', { events: ['dm'] })
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Json
      if (m.method !== 'hub/event') return
      const event = (m.params as { event: { time: number; data: Json } }).event
      this.add(event.time, event.data)
    }
    // AgnesHub restarts with Agnes; the panel picks up again when it is back.
    ws.onclose = () => {
      if (!this.closed) setTimeout(() => this.start(), 2000)
    }
  }

  stop(): void {
    this.closed = true
  }

  private add(time: number, d: Json): void {
    const happened = String(d.happened ?? '')
    this.decisions.unshift({
      time,
      woken: happened.includes('[AgnesHub]'),
      trigger: happened
        .replace(/^[^]*?\[AgnesHub\]\s*/, '')
        .split('\n')
        .filter(Boolean)
        .slice(0, 4),
      choice: String(d.choice ?? ''),
      outcome: d.outcome as Decision['outcome'],
      top: (d.top as [string, number][]) ?? [],
      options: Number(d.options ?? 0),
      confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
      ms: Number(d.ms ?? 0),
      ...(typeof d.error === 'string' ? { error: d.error } : {}),
    })
    this.decisions.splice(KEEP)
    this.version++
  }
}
