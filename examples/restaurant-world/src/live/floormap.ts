import { CallError } from '@agnes/mhs/device'
import { PLACES } from '../layout.js'
import { MAP_AREA, MAP_ID } from './map.js'

/** Where a fixed device is installed on the floor map (REG-4): a plan point and its facing. */
export const placed = (x: number, y: number, yaw: number) => ({ map: MAP_ID, x, y, yaw })

/**
 * The floor map (MOS 3.5), declared by floor-01: x east, y north, metres from the room's south-west
 * corner, yaw counter-clockwise from east; its landmarks (the door, the pass, each table's serving
 * point) and zones.
 */
export const FLOOR_MAP = {
  id: MAP_ID,
  name: 'Agnes Restaurant',
  description:
    'A modern Chinese restaurant run only by its devices, with one party of guests at a time: a dining room, a private room, a play area for small children and an open kitchen. The person who talks to you is the party’s guest, already inside (host-01 says where they are); a guest at the door who asks for a table wants to sit down now. Priorities: the guests’ safety and comfort first, then getting what they asked for to their table quickly. The guests decide when to pay and leave; once they have left, their table is cleared and wiped for the next guests.',
  bounds: [MAP_AREA.x0, MAP_AREA.y0, MAP_AREA.x1, MAP_AREA.y1],
  places: PLACES.map((p) =>
    p.kind === 'landmark'
      ? { id: p.id, name: p.name.en, at: [p.x, p.y], yaw: p.yaw, description: p.description }
      : {
          id: p.id,
          name: p.name.en,
          points: [
            [p.x - (p.w ?? 0) / 2, p.y - (p.d ?? 0) / 2],
            [p.x + (p.w ?? 0) / 2, p.y - (p.d ?? 0) / 2],
            [p.x + (p.w ?? 0) / 2, p.y + (p.d ?? 0) / 2],
            [p.x - (p.w ?? 0) / 2, p.y + (p.d ?? 0) / 2],
          ],
          description: p.description,
        },
  ),
}

const LANDMARKS = PLACES.filter((p) => p.kind === 'landmark')

/** A tool parameter naming a landmark of the floor map. */
export const PLACE_PARAM = {
  type: 'string',
  enum: LANDMARKS.map((p) => p.id),
  description: 'a landmark on the floor map: the door, a table (t1 to t6), the pass, the bar, …',
}

/** A landmark's point and facing. */
export function landmark(id: unknown): { x: number; y: number; yaw: number } {
  const p = LANDMARKS.find((q) => q.id === id)
  if (!p) throw new CallError('x_no_place', `there is no place ${String(id)} on the floor map`)
  return { x: p.x, y: p.y, yaw: p.yaw ?? 90 }
}
