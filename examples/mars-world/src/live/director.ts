import { seeded } from '../assets.js'
import { CATALOG, type EventKind, HEADLINES, type Params } from './events.js'
import { every, type World } from './world.js'

/** Real minutes before the first event, and between events. */
const FIRST = [2.5, 4] as const
const GAP = [5, 8] as const
/** Real minutes that must pass between two severe events. */
const SEVERE_GAP = 3

/**
 * Starts events: for a person on the page, with the parameters they chose, and, with `?events=auto`,
 * one every few minutes picked from the seed, under the rules (one severe event at a time, three
 * minutes between severe events).
 */
export class Director {
  /** performance.now() when the next event is due; undefined when nothing is scheduled. */
  nextAt: number | undefined
  private random: () => number
  private lastSevere = Number.NEGATIVE_INFINITY

  constructor(
    private readonly world: World,
    options: { auto: boolean; seed: number },
    log: (line: string) => void,
  ) {
    this.random = seeded(options.seed)
    world.events?.listeners.push((h, phase) => {
      if (phase === 'start' && CATALOG[h.kind].severe) this.lastSevere = h.start
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
        if (this.nextAt !== undefined && performance.now() >= this.nextAt) this.next()
      },
      log,
    )
  }

  /** Picks and starts the next event now. */
  next(): void {
    const kind = this.pick()
    if (kind) {
      const params = this.clamp(kind)
      this.world.events?.start(kind, params, HEADLINES[kind](params), 'seeded director')
    }
    this.schedule(GAP)
  }

  /** Starts `kind` now for a person on the page, with their parameters kept to range; or says why not. */
  start(kind: EventKind, given: Record<string, unknown> = {}): string | undefined {
    const params = this.clamp(kind, given)
    const started = this.world.events?.start(kind, params, HEADLINES[kind](params), 'person')
    return typeof started === 'string' ? started : undefined
  }

  private schedule([lo, hi]: readonly [number, number]): void {
    this.nextAt = performance.now() + (lo + this.random() * (hi - lo)) * 60_000
  }

  /** Whether `kind` may start now on its own, under the rules. */
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

  private pick(): EventKind | undefined {
    const weights: [EventKind, number][] = [
      ['dust_storm', 3],
      ['meteorite', 3],
      ['dust_devil', 3],
      ['suit_leak', 2],
    ]
    const open = weights.filter(([k]) => this.allowed(k))
    let r = this.random() * open.reduce((n, [, w]) => n + w, 0)
    for (const [kind, w] of open) {
      r -= w
      if (r <= 0) return kind
    }
    return undefined
  }
}
