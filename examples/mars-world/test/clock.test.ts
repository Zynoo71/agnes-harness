import { describe, expect, it } from 'vitest'
import { MarsClock, START_HOURS, sunAt } from '../src/clock.js'

describe('Mars clock', () => {
  it('runs a sol in the given real minutes, into the next sol', () => {
    const clock = new MarsClock(START_HOURS.morning, 40)
    const start = performance.now()
    clock.reset()
    expect(clock.hour(start)).toBeCloseTo(7.6, 1)
    // 10 real minutes are a quarter of a 40-minute sol: six local hours.
    expect(clock.hour(start + 10 * 60_000)).toBeCloseTo(13.6, 1)
    expect(clock.sol(start + 30 * 60_000)).toBe(2)
    expect(clock.label(start + 30 * 60_000)).toMatch(/^Sol 2 · 01:3\d LMST$/)
  })

  it('stands still at its start hour when a sol takes 0 minutes', () => {
    const clock = new MarsClock(START_HOURS.night, 0)
    expect(clock.hour(performance.now() + 3_600_000)).toBe(22)
    expect(clock.secondsUntil(6)).toBe(Number.POSITIVE_INFINITY)
  })

  it('says how long until a local hour comes round', () => {
    const clock = new MarsClock(18, 40)
    const now = performance.now()
    clock.reset()
    // Twelve hours to sunrise are half of a 40-minute sol.
    expect(clock.secondsUntil(6, now)).toBeCloseTo(20 * 60, 0)
  })
})

describe('the sun', () => {
  it('rises in the east, stands in the south at noon and sets in the west', () => {
    expect(sunAt(6).elevation).toBeCloseTo(0)
    expect(sunAt(6).azimuth).toBeCloseTo(90)
    expect(sunAt(12)).toEqual({ elevation: 60, azimuth: 180 })
    expect(sunAt(18).azimuth).toBeCloseTo(270)
    expect(sunAt(0).elevation).toBeLessThan(-50)
  })

  it('keeps the looks the old time presets had', () => {
    expect(sunAt(START_HOURS.morning).elevation).toBeCloseTo(24, 0)
    expect(sunAt(START_HOURS.sunset).elevation).toBeCloseTo(3.5, 0)
  })
})
