import { seeded } from '../assets.js'
import { CATALOG, type EventKind, HEADLINES, type Headline, type Params } from './events.js'
import { every, type World, type WorldDevice } from './world.js'

/** Real minutes before the first event, and between events. */
const FIRST = [2.5, 4] as const
const GAP = [5, 8] as const
/** Real minutes that must pass between two severe events. */
const SEVERE_GAP = 3
/** Seconds the model gets to answer before the seeded director steps in. */
const MODEL_TIMEOUT_S = 40

/** How the next event is picked: by a model through the page's /director, or from the seed. */
export type DirectorMode = 'llm' | 'seeded'

/**
 * Picks an event every few minutes and starts it. A model (through the dev server's /director,
 * when it is set up) reads a summary of the base and picks what and when; code keeps the pick to
 * the catalog and the rules, and the seeded director picks instead when the model's answer does
 * not pass or does not come.
 */
export class Director {
  mode: DirectorMode
  /** The model behind /director, once it answered. */
  model: string | undefined
  /** performance.now() when the next event is due; undefined when nothing is scheduled. */
  nextAt: number | undefined
  /** Why the last pick was made, in the director's words. */
  lastReason = ''
  thinking = false
  private random: () => number
  private lastSevere = Number.NEGATIVE_INFINITY

  constructor(
    private readonly world: World,
    private readonly devices: WorldDevice[],
    options: { auto: boolean; mode: DirectorMode; seed: number },
    private readonly log: (line: string) => void,
  ) {
    this.mode = options.mode
    this.random = seeded(options.seed)
    const events = world.events
    events?.listeners.push((h, phase) => {
      if (phase === 'start' && CATALOG[h.kind].severe) this.lastSevere = h.start
    })
    // Whether the page's server has a model set up, and which.
    if (this.mode === 'llm')
      fetch('director')
        .then(async (res) => {
          if (res.ok) this.model = ((await res.json()) as { model?: string }).model
          else this.mode = 'seeded'
        })
        .catch(() => {
          this.mode = 'seeded'
        })
    if (!options.auto) return
    this.schedule(FIRST)
    world.onReset(() => {
      this.random = seeded(options.seed)
      this.lastSevere = Number.NEGATIVE_INFINITY
      this.schedule(FIRST)
    })
    every(
      1000,
      () => {
        if (this.nextAt !== undefined && performance.now() >= this.nextAt && !this.thinking) void this.next()
      },
      log,
    )
  }

  /** Picks and starts the next event now. */
  async next(): Promise<void> {
    this.thinking = true
    try {
      const pick = (this.mode === 'llm' && (await this.ask())) || this.pickSeeded()
      if (pick) {
        this.world.events?.start(pick.kind, pick.params, pick.headline, pick.by)
        this.lastReason = pick.reason
      }
    } finally {
      this.thinking = false
      this.schedule(GAP)
    }
  }

  /** Starts `kind` now for a person on the page, with parameters from the seed; or says why not. */
  start(kind: EventKind): string | undefined {
    const params = this.clamp(kind)
    const started = this.world.events?.start(kind, params, HEADLINES[kind](params), 'person')
    return typeof started === 'string' ? started : undefined
  }

  private schedule([lo, hi]: readonly [number, number]): void {
    this.nextAt = performance.now() + (lo + this.random() * (hi - lo)) * 60_000
  }

  /** Whether `kind` may start now under the rules. */
  private allowed(kind: EventKind): boolean {
    const events = this.world.events
    if (!events || events.active.some((h) => h.kind === kind)) return false
    if (kind === 'suit_leak' && !['working', 'standing'].includes(this.world.astronaut)) return false
    if (!CATALOG[kind].severe) return true
    const severeNow = events.active.some((h) => CATALOG[h.kind].severe)
    return !severeNow && performance.now() - this.lastSevere > SEVERE_GAP * 60_000
  }

  /** Parameters kept to their ranges; a missing or wrong one picked at random. */
  private clamp(kind: EventKind, given: Record<string, unknown> = {}): Params {
    const out: Params = {}
    for (const [name, range] of Object.entries(CATALOG[kind].params) as [
      string,
      readonly (number | string)[],
    ][]) {
      const value = given[name]
      if (typeof range[0] === 'number') {
        const [lo, hi] = range as readonly number[] as [number, number]
        const n = typeof value === 'number' && Number.isFinite(value) ? value : lo + this.random() * (hi - lo)
        out[name] = Math.round(Math.min(hi, Math.max(lo, n)) * 100) / 100
      } else
        out[name] = range.includes(value as string)
          ? (value as string)
          : (range[Math.floor(this.random() * range.length)] as string)
    }
    return out
  }

  private pickSeeded(): Pick | undefined {
    const weights: [EventKind, number][] = [
      ['dust_storm', 3],
      ['meteorite', 3],
      ['dust_devil', 3],
      ['suit_leak', 2],
    ]
    const open = weights.filter(([k]) => this.allowed(k))
    const total = open.reduce((n, [, w]) => n + w, 0)
    let r = this.random() * total
    for (const [kind, w] of open) {
      r -= w
      if (r > 0) continue
      const params = this.clamp(kind)
      return { kind, params, headline: HEADLINES[kind](params), reason: 'seeded', by: 'seeded director' }
    }
    return undefined
  }

  /** Asks the model behind /director; undefined when it is not there or its answer does not pass. */
  private async ask(): Promise<Pick | undefined> {
    try {
      const res = await fetch('director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: this.prompt() }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_S * 1000),
      })
      if (!res.ok) {
        if (res.status === 404) this.mode = 'seeded'
        return undefined
      }
      const { text, model } = (await res.json()) as { text: string; model?: string }
      this.model = model
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const answer = JSON.parse(json) as {
        event?: string
        params?: Record<string, unknown>
        headline?: Partial<Headline>
        reason?: string
      }
      if (answer.event === 'none') return undefined
      const kind = answer.event as EventKind
      if (!(kind in CATALOG) || !this.allowed(kind)) {
        this.log(`director: the model picked ${answer.event}, which may not happen now`)
        return undefined
      }
      const params = this.clamp(kind, answer.params)
      const fallback = HEADLINES[kind](params)
      const line = (s: unknown, or: string, max = 80) =>
        typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : or
      return {
        kind,
        params,
        headline: { en: line(answer.headline?.en, fallback.en), zh: line(answer.headline?.zh, fallback.zh) },
        reason: line(answer.reason, '', 240),
        by: `LLM director${model ? ` (${model})` : ''}`,
      }
    } catch (e) {
      this.log(`director: no answer from the model (${String(e)})`)
      return undefined
    }
  }

  /** What the model reads: the base now, what happened, and what it may pick. */
  private prompt(): { role: string; content: string }[] {
    const world = this.world
    const events = world.events
    const now = performance.now()
    const states = this.devices.map((d) => `- ${d.id}: ${JSON.stringify(d.state)}`).join('\n')
    const active = events?.active.length
      ? events.active.map((h) => `- ${h.kind} ${JSON.stringify(h.params)} since ${h.at}`).join('\n')
      : '- none'
    const past = events?.past.length
      ? events.past.map((h) => `- ${h.kind} ${JSON.stringify(h.params)} at ${h.at}`).join('\n')
      : '- none yet'
    const catalog = Object.entries(CATALOG)
      .map(
        ([k, c]) =>
          `- ${k}${c.severe ? ' (severe)' : ''}: ${c.about}. params: ${JSON.stringify(c.params)}; may start now: ${this.allowed(k as EventKind) ? 'yes' : 'no'}`,
      )
      .join('\n')
    const minutes = (ms: number) => Math.round(ms / 6000) / 10
    return [
      {
        role: 'system',
        content: `You direct what happens on its own at Agnes Base, a small Mars base whose devices an AI agent (the brain) runs through tools. The base is a test bed for that agent: pick the next event so that it is plausible for the place and the time, varied, and a fair test of whether the agent notices it and acts well. Do not pile up trouble faster than it can be handled. Answer with one JSON object and nothing else:
{"event": "<an event that may start now, or none>", "params": {...}, "headline": {"en": "<banner line, under 60 characters>", "zh": "<the same in Chinese>"}, "reason": "<one sentence: why this, why now>"}`,
      },
      {
        role: 'user',
        content: `Mars time: ${world.clock.label()} (the sun rises at 06:00, sets at 18:00; a sol takes ${world.clock.solMinutes} real minutes).
Weather: wind ${world.weather.wind} m/s, dust tau ${world.weather.dust}, storm warning ${world.weather.storm}.
Astronaut: ${world.astronaut}.
Last severe event: ${Number.isFinite(this.lastSevere) ? `${minutes(now - this.lastSevere)} minutes ago` : 'none yet'}.

Devices (state):
${states}

Events going on:
${active}

Events so far (newest first):
${past}

Events you can pick:
${catalog}`,
      },
    ]
  }
}

interface Pick {
  kind: EventKind
  params: Params
  headline: Headline
  reason: string
  by: string
}
