import { describe, expect, it } from 'vitest'
import { FOOTPRINTS, HOMES, PLACES, TABLES } from '../src/layout.js'
import { occupancy } from '../src/live/map.js'
import { fromMap, planPath } from '../src/live/route.js'

/** A serving robot's half-width with a margin. */
const BODY = 0.3

describe('restaurant floor', () => {
  const grid = occupancy(FOOTPRINTS)
  const landmarks = PLACES.filter((p) => p.kind === 'landmark')

  it('names every table and its place', () => {
    expect(TABLES.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6'])
    for (const t of TABLES) expect(PLACES.some((p) => p.id === t.id)).toBe(true)
  })

  it.each(Object.entries(HOMES))('lets a robot from %s reach every landmark', (_, home) => {
    for (const p of landmarks) {
      const path = planPath(grid, fromMap(home.x, home.y), fromMap(p.x, p.y), [], BODY)
      expect(path, `${p.id}`).toBeDefined()
    }
  })

  it('keeps every seat clear of the robots’ way', () => {
    for (const t of TABLES)
      for (const s of t.seats) {
        const [x0, y0] = grid.origin
        const i = Math.floor((s.x - x0) / grid.resolution)
        const j = Math.floor((y0 + grid.h * grid.resolution - s.y) / grid.resolution)
        const blocked = grid.cells[j * grid.w + i]
        expect(blocked, `${t.id} seat at ${s.x}, ${s.y}`).toBe(0)
      }
  })
})
