import { describe, expect, it } from 'vitest'
import { MAP_AREA, occupancy } from '../src/live/map.js'
import { fromMap, planNear, planPath, toMap, yawOf } from '../src/live/route.js'

/** A table of 1.2 × 0.8 m in the middle of an empty room. */
const TABLE = { x: 12, z: -8, w: 1.2, d: 0.8 }

describe('floor map', () => {
  it('covers the room at 10 cm a cell, the table occupied', () => {
    const grid = occupancy([TABLE])
    expect(grid.id).toBe('restaurant')
    expect(grid.w).toBe((MAP_AREA.x1 - MAP_AREA.x0) * 10)
    expect(grid.h).toBe((MAP_AREA.y1 - MAP_AREA.y0) * 10)
    // Rows run from the top (largest y) down.
    const cell = (x: number, y: number) =>
      grid.cells[Math.floor((MAP_AREA.y1 - y) * 10) * grid.w + Math.floor((x - MAP_AREA.x0) * 10)]
    expect(cell(12, 8)).toBe(0)
    expect(cell(5, 5)).toBe(255)
  })

  it('maps world points to the map frame and back', () => {
    expect(toMap({ x: 3, z: -4 })).toEqual({ x: 3, y: 4 })
    expect(fromMap(3, 4)).toEqual({ x: 3, z: -4 })
    // A model facing +z (south) has yaw 270° on the map.
    expect(yawOf(0)).toBe(270)
  })
})

describe('paths', () => {
  const grid = occupancy([TABLE])

  it('go round a table', () => {
    const from = { x: 9, z: -8 }
    const to = { x: 15, z: -8 }
    const path = planPath(grid, from, to, [], 0.3)
    expect(path).toBeDefined()
    expect(path?.at(-1)).toEqual(to)
    // Some leg leaves the straight line, which runs through the table.
    expect(path?.some((p) => Math.abs(p.z + 8) > 0.5)).toBe(true)
  })

  it('end beside a point that is under the table', () => {
    const near = planNear(grid, { x: 9, z: -8 }, { x: 12, z: -8 }, [], 0.3)
    expect(near).toBeDefined()
    const end = near?.end as { x: number; z: number }
    expect(Math.hypot(end.x - 12, end.z + 8)).toBeGreaterThan(0.4)
  })
})
