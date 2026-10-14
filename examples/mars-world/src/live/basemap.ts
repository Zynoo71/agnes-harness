import { CallError } from '@agnes/mhs/device'
import { LAYOUT } from '../base.js'
import { MAP_AREA } from './map.js'
import { toMap } from './route.js'

/** Where a fixed device is installed on the base map (REG-4): a world point and its body x direction. */
export const placed = ([x, z]: readonly [number, number], yaw: number) => ({
  map: 'base',
  ...toMap({ x, z }),
  yaw,
})

const at = ([x, z]: readonly [number, number]): [number, number] => {
  const p = toMap({ x, z })
  return [p.x, p.y]
}

/**
 * The base map (MOS 3.5), declared by the habitat: the frame every pose, grid and placement here
 * uses (x east, y north, metres from the habitat, yaw counter-clockwise from east), what it covers,
 * and its named places.
 */
export const BASE_MAP = {
  id: 'base',
  name: 'Agnes Base',
  description:
    'A small research base on Mars with one astronaut, who wears suit-01: a habitat with life support, a solar array and batteries, a comms dish to Earth, an airlock, robots and a lab. Priorities: the astronaut’s life first, then keeping the base powered, then science.',
  bounds: [MAP_AREA.x0, MAP_AREA.y0, MAP_AREA.x1, MAP_AREA.y1],
  places: [
    {
      id: 'airlock',
      name: 'Airlock',
      at: at(LAYOUT.airlockDoor),
      yaw: 90,
      description: 'Outer door of the habitat airlock, on its south side; one person at a time.',
    },
    {
      id: 'dock',
      name: 'Rover dock',
      at: at(LAYOUT.dock),
      yaw: 90,
      description: 'Where the rover charges, nose north, beside the lab whose arm unloads its samples.',
    },
    {
      id: 'hopper-pad',
      name: 'Hopper pad',
      at: at(LAYOUT.hopperPad),
      description: "The hopper's pad, where it lands and refuels. Keep people clear when it lands.",
    },
    {
      id: 'landing-pad',
      name: 'Landing pad',
      at: at(LAYOUT.landingPad),
      description: 'The large pad south of the base, 18 m across.',
    },
    { id: 'lab', name: 'Lab', at: at(LAYOUT.lab), description: 'The sample lab, west of the dock.' },
    {
      id: 'greenhouse',
      name: 'Greenhouse door',
      at: at(LAYOUT.greenhouseDoor),
      yaw: 180,
      description:
        "The greenhouse's east door, east of the habitat; Monolith goes in here to plant and harvest.",
    },
    {
      id: 'comms-dish',
      name: 'Comms dish',
      at: at(LAYOUT.comms),
      description: 'The high-gain dish north-west of the habitat.',
    },
    {
      id: 'outcrop',
      name: 'Rock outcrop',
      at: at(LAYOUT.field),
      description: 'Boulders in the west field where the astronaut works.',
    },
    {
      id: 'west-field',
      name: 'West field',
      points: [
        [-58, -58],
        [-24, -58],
        [-24, -20],
        [-58, -20],
      ],
      description:
        'Open ground with boulders, a big one at its centre, and the unusual rock the base wants a sample of; a hopper survey maps them.',
    },
    {
      id: 'east-dunes',
      name: 'East dunes',
      points: [
        [48, -30],
        [90, -30],
        [90, 30],
        [48, 30],
      ],
      description: 'Soft sand east of the base.',
    },
    {
      id: 'base-area',
      name: 'Base area',
      points: [
        [-28, 18],
        [36, 18],
        [36, -52],
        [-24, -52],
        [-24, -20],
        [-28, -20],
      ],
      description: 'The buildings, the dock and the pads.',
    },
  ],
}

/** A tool parameter naming a place on the base map, as an alternative to x and y. */
export const PLACE_PARAM = {
  type: 'string',
  enum: BASE_MAP.places.map((p) => p.id),
  description: 'a place on the base map, instead of x and y',
}

/** The point a move goes to: a place's point (a zone's centre), or x and y. */
export function pointOf({ place, x, y }: { place?: unknown; x?: unknown; y?: unknown }): {
  x: number
  y: number
} {
  const p = BASE_MAP.places.find((q) => q.id === place)
  if (p && 'at' in p && p.at) return { x: p.at[0], y: p.at[1] }
  if (p && 'points' in p && p.points) {
    const xs = p.points.map((q) => q[0] as number)
    const ys = p.points.map((q) => q[1] as number)
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  }
  if (typeof x === 'number' && typeof y === 'number') return { x, y }
  throw new CallError('x_no_point', 'give place, or both x and y')
}
