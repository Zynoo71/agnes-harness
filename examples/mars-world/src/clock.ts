/**
 * Local solar time at Agnes Base. A sol is squeezed into a few minutes so a demo sees morning, dusk
 * and night; the sun rises at 06:00 and sets at 18:00. Everything that follows the time of day (the
 * light, the solar array, the air temperature) reads this one clock.
 */

/** Hours a preset of `?time=` starts the clock at; the presets keep the looks they always had. */
export const START_HOURS = { morning: 7.6, noon: 12, sunset: 17.8, night: 22 } as const

export type TimeOfDay = keyof typeof START_HOURS

/** Real minutes a sol takes by default (`?sol=` changes it). */
export const SOL_MINUTES = 40

/** Highest the sun climbs at noon, in degrees: Jezero is 18° north, so it stays in the south. */
const NOON_ELEVATION = 60

export class MarsClock {
  private startedAt = performance.now()

  constructor(
    /** Local hour (0–24) the clock starts at, and goes back to on Reset. */
    readonly startHour: number,
    /** Real minutes a sol takes; 0 stops the clock at the start hour. */
    readonly solMinutes: number,
  ) {}

  /** Hours since 00:00 of sol 1, so it keeps rising through the night into the next sol. */
  hours(now = performance.now()): number {
    if (this.solMinutes <= 0) return this.startHour
    return this.startHour + ((now - this.startedAt) / 60_000 / this.solMinutes) * 24
  }

  /** The local hour, 0–24. */
  hour(now = performance.now()): number {
    return this.hours(now) % 24
  }

  sol(now = performance.now()): number {
    return Math.floor(this.hours(now) / 24) + 1
  }

  /** `Sol 1 · 07:36 LMST` */
  label(now = performance.now()): string {
    const h = this.hour(now)
    const hh = Math.floor(h)
    const mm = Math.floor((h - hh) * 60)
    return `Sol ${this.sol(now)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LMST`
  }

  /** Real seconds until the local hour next reaches `hour`. */
  secondsUntil(hour: number, now = performance.now()): number {
    if (this.solMinutes <= 0) return Number.POSITIVE_INFINITY
    const ahead = (hour - this.hour(now) + 24) % 24
    return (ahead / 24) * this.solMinutes * 60
  }

  reset(): void {
    this.startedAt = performance.now()
  }
}

/** Where the sun is at a local hour: elevation above the horizon and azimuth from north, in degrees. */
export function sunAt(hour: number): { elevation: number; azimuth: number } {
  const angle = ((hour - 6) / 12) * Math.PI
  // East at sunrise, south at noon, west at sunset; below the horizon at night.
  return { elevation: NOON_ELEVATION * Math.sin(angle), azimuth: (90 + ((hour - 6) / 12) * 180) % 360 }
}
