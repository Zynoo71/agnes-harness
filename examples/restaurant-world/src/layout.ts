/**
 * Where everything in the restaurant stands, in the floor map's frame: x east, y north, metres from
 * the room's south-west corner. The room is 14 × 10 m: the dining room in the south (y 0–7) with
 * the door in the south wall, the kitchen and the drinks bar behind a low wall in the north. Plain
 * data, without three.js, so the map can be tested on its own.
 */
import type { Footprint } from './live/map.js'

export const ROOM = { w: 14, d: 10 } as const
/** The low wall between the dining room and the kitchen and bar. */
export const BACK_OF_HOUSE_Y = 7
/** The wall between the kitchen and the drinks bar. */
export const BAR_X = 10.6
/** The door in the south wall, from x0 to x1. */
export const DOOR = { x0: 6, x1: 7.6 } as const

/** A box on the floor plan: centre, width along x, depth along y. */
export interface Box {
  x: number
  y: number
  w: number
  d: number
}

export interface Seat {
  x: number
  y: number
  /** Map yaw the seated guest faces, degrees counter-clockwise from east. */
  yaw: number
}

export interface Table extends Box {
  id: string
  name: { en: string; zh: string }
  seats: Seat[]
  window: boolean
  booth: boolean
  /** Where a robot stands to serve it, beside the table on the aisle side. */
  serve: { x: number; y: number }
  /** The table with its chairs or benches, which robots go round. */
  footprint: Box
}

/** A table for `n` (2 or 4) at (x, y), chairs or benches north and south, served from `side`. */
function table(
  id: string,
  name: Table['name'],
  x: number,
  y: number,
  n: 2 | 4,
  side: 'east' | 'west',
  options: { window?: boolean; booth?: boolean } = {},
): Table {
  const w = n === 2 ? 0.8 : 1.4
  const d = 0.8
  const across = n === 2 ? [0] : [-0.35, 0.35]
  const seats = across.flatMap((dx) => [
    { x: x + dx, y: y + 0.62, yaw: 270 },
    { x: x + dx, y: y - 0.62, yaw: 90 },
  ])
  const reach = options.booth ? 1.05 : 0.95
  return {
    id,
    name,
    x,
    y,
    w,
    d,
    seats,
    window: options.window ?? false,
    booth: options.booth ?? false,
    serve: { x: side === 'east' ? x + w / 2 + 0.6 : x - w / 2 - 0.6, y },
    footprint: { x, y, w: w + 0.2, d: 2 * reach },
  }
}

export const TABLES: Table[] = [
  table('t1', { en: 'Table 1, by the window', zh: '1 号桌（靠窗）' }, 1.3, 3.0, 2, 'east', { window: true }),
  table('t2', { en: 'Table 2', zh: '2 号桌' }, 4.2, 3.0, 2, 'east'),
  table('t3', { en: 'Table 3', zh: '3 号桌' }, 10.0, 2.6, 4, 'west'),
  table('t4', { en: 'Table 4, a booth', zh: '4 号桌（卡座）' }, 10.0, 4.9, 4, 'west', { booth: true }),
]

/** Fixed things robots go to or work at, each a box on the plan. */
export const FIXTURES = {
  /** Under the pass's heat lamps the arm sets finished dishes for the runners. */
  pass: { x: 7.8, y: 7, w: 3.6, d: 0.6 },
  /** The window in the low wall where runners leave used dishes; the dishwasher is behind it. */
  dishReturn: { x: 3.1, y: 7, w: 1, d: 0.6 },
  /** Napkins, chopsticks, bowls, spoons, takeaway boxes and a baby chair, against the low wall. */
  supplies: { x: 1.3, y: 6.7, w: 2, d: 0.5 },
  /** The drinks bar's counter, open to the dining room. */
  bar: { x: 12.3, y: 7, w: 3.4, d: 0.6 },
  /** The cashier's counter beside the door. */
  cashier: { x: 2.2, y: 0.6, w: 1.8, d: 0.6 },
  /** The kitchen's cold store, which keeps the stock. */
  coldStore: { x: 0.9, y: 9.5, w: 1.4, d: 0.8 },
  /** The wok station and the steam-and-boil station along the kitchen's back wall. */
  wok: { x: 6.4, y: 9.55, w: 1.4, d: 0.7 },
  stove: { x: 9.2, y: 9.55, w: 1.6, d: 0.7 },
  /** A prep counter between the cold store and the wok. */
  prep: { x: 3.6, y: 9.55, w: 3.2, d: 0.7 },
  dishwasher: { x: 3.1, y: 7.9, w: 0.9, d: 0.7 },
  /** The bar's back shelves. */
  barShelves: { x: 12.3, y: 9.7, w: 3.2, d: 0.4 },
} satisfies Record<string, Box>

/** Where the kitchen arm is fixed: it reaches the wok, the stove and the pass. */
export const ARM_BASE = { x: 7.8, y: 8.35 } as const

/** Where each moving robot rests when it has nothing to do: by the door, or on its charging pad. */
export const HOMES = {
  host: { x: 6.8, y: 1.3, yaw: 90 },
  runner1: { x: 13.3, y: 2.6, yaw: 180 },
  runner2: { x: 13.3, y: 3.8, yaw: 180 },
  cleaner: { x: 13.3, y: 1.2, yaw: 180 },
} as const

/** A named point or area of the floor map, as the hub lists it for the brain. */
export interface Place {
  id: string
  name: { en: string; zh: string }
  kind: 'landmark' | 'zone'
  x: number
  y: number
  /** A landmark's facing (map yaw, degrees); a zone's size. */
  yaw?: number
  w?: number
  d?: number
  description: string
}

const F = FIXTURES
export const PLACES: Place[] = [
  {
    id: 'door',
    name: { en: 'Door', zh: '门口' },
    kind: 'landmark',
    x: 6.8,
    y: 0.6,
    yaw: 90,
    description: 'The way in; guests are met here',
  },
  {
    id: 'pass',
    name: { en: 'Pass', zh: '出餐口' },
    kind: 'landmark',
    x: F.pass.x,
    y: F.pass.y - 0.75,
    yaw: 90,
    description: 'Finished dishes wait here for a runner',
  },
  {
    id: 'bar',
    name: { en: 'Drinks bar', zh: '饮品台' },
    kind: 'landmark',
    x: F.bar.x,
    y: F.bar.y - 0.75,
    yaw: 90,
    description: 'Drinks and tea wait here for a runner',
  },
  {
    id: 'supplies',
    name: { en: 'Supplies cabinet', zh: '备品柜' },
    kind: 'landmark',
    x: F.supplies.x,
    y: F.supplies.y - 0.65,
    yaw: 90,
    description: 'Napkins, chopsticks, bowls, spoons, takeaway boxes, a baby chair',
  },
  {
    id: 'dish-return',
    name: { en: 'Dish return', zh: '回收口' },
    kind: 'landmark',
    x: F.dishReturn.x,
    y: F.dishReturn.y - 0.75,
    yaw: 90,
    description: 'Used dishes go back to the kitchen here',
  },
  {
    id: 'cashier',
    name: { en: 'Cashier', zh: '收银台' },
    kind: 'landmark',
    x: F.cashier.x,
    y: F.cashier.y + 0.75,
    yaw: 270,
    description: 'Where the bill is paid',
  },
  ...TABLES.map(
    (t): Place => ({
      id: t.id,
      name: t.name,
      kind: 'landmark',
      x: t.serve.x,
      y: t.serve.y,
      yaw: t.serve.x > t.x ? 180 : 0,
      description: `Where a robot stands to serve ${t.name.en.toLowerCase()}, for ${t.seats.length}`,
    }),
  ),
  {
    id: 'dining-room',
    name: { en: 'Dining room', zh: '前厅' },
    kind: 'zone',
    x: ROOM.w / 2,
    y: BACK_OF_HOUSE_Y / 2,
    w: ROOM.w,
    d: BACK_OF_HOUSE_Y,
    description: 'Where the guests sit',
  },
  {
    id: 'kitchen',
    name: { en: 'Kitchen', zh: '后厨' },
    kind: 'zone',
    x: BAR_X / 2,
    y: (BACK_OF_HOUSE_Y + ROOM.d) / 2,
    w: BAR_X,
    d: ROOM.d - BACK_OF_HOUSE_Y,
    description: 'Robots only: the wok, the stove, the arm, the cold store',
  },
]

/** A box on the plan as a footprint in world coordinates (z = −y). */
const foot = (b: Box): Footprint => ({ x: b.x, z: -b.y, w: b.w, d: b.d })

/**
 * What blocks a robot on the floor: the walls, the low wall with its counters, the dining room's
 * fixtures and the tables with their chairs. The kitchen and the bar are walled off from the dining
 * room, so robots of the dining room never plan through them.
 */
export const FOOTPRINTS: Footprint[] = [
  // The outer walls, the south one on either side of the door.
  foot({ x: DOOR.x0 / 2, y: -0.1, w: DOOR.x0 + 0.4, d: 0.2 }),
  foot({ x: (DOOR.x1 + ROOM.w) / 2, y: -0.1, w: ROOM.w - DOOR.x1 + 0.4, d: 0.2 }),
  foot({ x: ROOM.w / 2, y: ROOM.d + 0.1, w: ROOM.w + 0.4, d: 0.2 }),
  foot({ x: -0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }),
  foot({ x: ROOM.w + 0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }),
  // The low wall with the pass, the dish return and the bar counter in it, and the bar's side wall.
  foot({ x: ROOM.w / 2, y: BACK_OF_HOUSE_Y, w: ROOM.w, d: 0.6 }),
  foot({ x: BAR_X, y: (BACK_OF_HOUSE_Y + ROOM.d) / 2, w: 0.15, d: ROOM.d - BACK_OF_HOUSE_Y }),
  ...[F.supplies, F.cashier, F.coldStore, F.wok, F.stove, F.prep, F.dishwasher, F.barShelves].map(foot),
  ...TABLES.map((t) => foot(t.footprint)),
]
