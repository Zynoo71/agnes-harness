/**
 * Where everything in the restaurant stands, in the floor map's frame: x east, y north, metres from
 * the room's south-west corner. The room is 22 × 15 m: the door in the middle of the south wall
 * opens on a foyer with a waiting area and the cashier; the dining room fills the middle; a low wall
 * with the dish return, the pass and the drinks bar's counter in it divides off the kitchen and the
 * bar in the north. The street runs along the south wall outside. Plain data, without three.js, so
 * the map can be tested on its own.
 */
import type { Footprint } from './live/map.js'

export const ROOM = { w: 22, d: 15 } as const
/** The low wall between the dining room and the kitchen and bar. */
export const BACK_OF_HOUSE_Y = 10.5
/** The wall between the kitchen and the drinks bar. */
export const BAR_X = 16.5
/** The door in the south wall, from x0 to x1. */
export const DOOR = { x0: 10, x1: 12 } as const
/**
 * The private room at the dining room's east end, from x0 to the east wall and from y0 to y1: its
 * walls are cut low like the near ones, and a sliding door in its west wall opens on the dining room.
 */
export const PRIVATE_ROOM = { x0: 16.55, x1: 22, y0: 3.9, y1: 8.8, door: { y0: 5.65, y1: 7.05 } } as const
/**
 * The children's play area in the south-west corner, behind a low fence with a gap in its east
 * side toward the door: a slide, a ball pit and a soft mat for building blocks.
 */
export const PLAY_AREA = { x0: 0, x1: 3.9, y0: 0, y1: 3.1, gate: { y0: 0.9, y1: 2.0 } } as const
/** Where things stand in the play area: the slide's ladder and the foot of its chute, the ball pit, the mat. */
export const PLAY = {
  slide: { ladder: { x: 0.75, y: 2.45 }, top: { x: 1.05, y: 2.45 }, foot: { x: 2.35, y: 2.45 } },
  pit: { x: 3.05, y: 2.35, r: 0.5 },
  mat: { x: 1.4, y: 1.1 },
} as const
/** The private room's speaker, on its north wall near the east end. */
export const PRIVATE_SPEAKER = { x: PRIVATE_ROOM.x1 - 0.7, y: PRIVATE_ROOM.y1 } as const
/** How far the street reaches south of the room. */
export const STREET_D = 4.5

/** A box on the floor plan: centre, width along x, depth along y. */
export interface Box {
  x: number
  y: number
  w: number
  d: number
}

/** A circle on the floor plan. */
export interface Round {
  x: number
  y: number
  r: number
}

export interface Seat {
  x: number
  y: number
  /** Map yaw the seated guest faces, degrees counter-clockwise from east. */
  yaw: number
}

export interface Table {
  id: string
  name: { en: string; zh: string }
  x: number
  y: number
  kind: 'square' | 'long' | 'round'
  /** The top: a box, or a circle for a round table. */
  top: Box | Round
  seats: Seat[]
  window: boolean
  /** Where a robot stands to serve it, beside the table on the aisle side. */
  serve: { x: number; y: number; yaw: number }
  /** The table with its chairs or benches, which robots go round. */
  footprint: Box | Round
}

const towards = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.round(((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360)

/** A rectangular table at (x, y) with chairs north and south, served from `side`. */
function rectTable(
  id: string,
  name: Table['name'],
  x: number,
  y: number,
  kind: 'square' | 'long',
  side: 'east' | 'west',
  window = false,
): Table {
  const w = kind === 'square' ? 0.8 : 1.4
  const d = 0.8
  const across = kind === 'square' ? [0] : [-0.35, 0.35]
  const seats = across.flatMap((dx) => [
    { x: x + dx, y: y + 0.62, yaw: 270 },
    { x: x + dx, y: y - 0.62, yaw: 90 },
  ])
  const reach = 0.95
  const sx = side === 'east' ? x + w / 2 + 0.65 : x - w / 2 - 0.65
  return {
    id,
    name,
    x,
    y,
    kind,
    top: { x, y, w, d },
    seats,
    window,
    serve: { x: sx, y, yaw: side === 'east' ? 180 : 0 },
    footprint: { x, y, w: w + 0.2, d: 2 * reach },
  }
}

/** A round table for `n` at (x, y), its top `r` in radius, served from the west. */
function roundTable(id: string, name: Table['name'], x: number, y: number, n: number, r: number): Table {
  const seats = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + Math.PI / n
    const seat = { x: x + Math.cos(a) * (r + 0.3), y: y + Math.sin(a) * (r + 0.3) }
    return { ...seat, yaw: towards(seat, { x, y }) }
  })
  return {
    id,
    name,
    x,
    y,
    kind: 'round',
    top: { x, y, r },
    seats,
    window: false,
    serve: { x: x - r - 1.3, y, yaw: 0 },
    footprint: { x, y, r: r + 0.65 },
  }
}

export const TABLES: Table[] = [
  rectTable('t1', { en: 'Table 1, by the window', zh: '1 号桌（靠窗）' }, 1.5, 4.6, 'square', 'east', true),
  rectTable('t2', { en: 'Table 2, by the window', zh: '2 号桌（靠窗）' }, 1.5, 7.8, 'square', 'east', true),
  rectTable('t3', { en: 'Table 3', zh: '3 号桌' }, 6.2, 5.0, 'long', 'east'),
  rectTable('t4', { en: 'Table 4', zh: '4 号桌' }, 6.2, 8.2, 'long', 'east'),
  roundTable('t5', { en: 'Table 5, the round table', zh: '5 号桌（圆桌）' }, 12.2, 6.6, 6, 0.8),
  roundTable('t6', { en: 'Table 6, the private room', zh: '6 号桌（包间）' }, 19.35, 6.35, 8, 0.85),
]

/** Fixed things robots go to or work at, and the furniture that stands in their way. */
export const FIXTURES = {
  /** Under the pass's heat lamps the arm sets finished dishes for the runner. */
  pass: { x: 11, y: BACK_OF_HOUSE_Y, w: 4, d: 0.6 },
  /** The window in the low wall where the runner leaves used dishes; the dishwasher is behind it. */
  dishReturn: { x: 5.6, y: BACK_OF_HOUSE_Y, w: 1.2, d: 0.6 },
  /** The drinks bar's counter, open to the dining room. */
  bar: { x: 19.3, y: BACK_OF_HOUSE_Y, w: 4.6, d: 0.6 },
  /** Napkins, chopsticks, bowls, spoons, takeaway boxes and a baby chair, against the low wall. */
  supplies: { x: 15, y: BACK_OF_HOUSE_Y - 0.55, w: 1.8, d: 0.5 },
  /** The cashier's counter east of the door. */
  cashier: { x: 14.6, y: 1.1, w: 2.4, d: 0.7 },
  /** The waiting area west of the door: a sofa against the wall, a tea table, two stools. */
  sofa: { x: 7, y: 0.6, w: 2.3, d: 1 },
  teaTable: { x: 7, y: 1.75, w: 0.85, d: 0.85 },
  stoolWest: { x: 5.5, y: 1.75, w: 0.6, d: 0.5 },
  stoolEast: { x: 8.5, y: 1.75, w: 0.6, d: 0.5 },
  /** Carved screens between the waiting area and the dining room. */
  screens: { x: 6.2, y: 2.85, w: 3.9, d: 0.4 },
  /** The menu board by the door. */
  menuBoard: { x: 9.1, y: 0.75, w: 0.9, d: 0.75 },
  /** A fish tank on a cabinet east of the cashier. */
  fishTank: { x: 17.6, y: 0.45, w: 1.8, d: 0.55 },
  /** A tall display cabinet against the west wall. */
  cabinet: { x: 0.3, y: 9.6, w: 0.55, d: 1.3 },
  // The kitchen, along its back wall.
  coldStore: { x: 1.1, y: 14.45, w: 1.8, d: 0.9 },
  shelves: { x: 3.6, y: 14.6, w: 2.3, d: 0.55 },
  prep: { x: 6.6, y: 14.45, w: 3, d: 0.7 },
  wok: { x: 10, y: 14.45, w: 1.6, d: 0.7 },
  stove: { x: 12.2, y: 14.45, w: 1.8, d: 0.7 },
  sink: { x: 14.8, y: 14.45, w: 2.2, d: 0.7 },
  dishwasher: { x: 5.6, y: 11.35, w: 1.1, d: 0.7 },
  /** A prep island in the middle of the kitchen's west half. */
  island: { x: 3.4, y: 12.6, w: 2.4, d: 0.9 },
  // The bar's back shelves.
  barShelves: { x: 19.3, y: 14.7, w: 4.6, d: 0.5 },
} satisfies Record<string, Box>

/** Where the kitchen arm is fixed: it reaches the wok, the stove and the pass. */
export const ARM_BASE = { x: 11.1, y: 12.5 } as const

/** Where each robot rests when it has nothing to do: by the door, on its charging pad, at the bar. */
export const HOMES = {
  host: { x: 11, y: 2.1, yaw: 270 },
  runner: { x: 21.2, y: 3.4, yaw: 180 },
  cleaner: { x: 21.2, y: 1.8, yaw: 180 },
  prep: { x: 5.2, y: 13.55, yaw: 90 },
  play: { x: 3.2, y: 0.75, yaw: 180 },
} as const

/** Where the prep robot stands to work, facing the back counters. */
export const PREP_STOPS = {
  coldStore: { x: FIXTURES.coldStore.x + 0.2, y: 13.55, yaw: 90 },
  board: { x: FIXTURES.prep.x, y: 13.6, yaw: 90 },
  wok: { x: FIXTURES.wok.x - 0.55, y: 13.6, yaw: 90 },
  stove: { x: FIXTURES.stove.x + 0.55, y: 13.6, yaw: 90 },
} as const

/** Where the bar's robot works, behind the counter. */
export const BARTENDER = { x: 19.3, y: 11.5, yaw: 270 } as const

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
/** A landmark in front of a fixture on the dining room side, facing it. */
const before = (b: Box, gap = 0.45) => ({ x: b.x, y: b.y - b.d / 2 - gap, yaw: 90 })

export const PLACES: Place[] = [
  {
    id: 'door',
    name: { en: 'Door', zh: '门口' },
    kind: 'landmark',
    x: (DOOR.x0 + DOOR.x1) / 2,
    y: 0.8,
    yaw: 270,
    description: 'The way in and out; guests are met here',
  },
  {
    id: 'waiting-area',
    name: { en: 'Waiting area', zh: '等位区' },
    kind: 'landmark',
    x: F.screens.x + F.screens.w / 2 + 0.5,
    y: F.teaTable.y + 0.6,
    yaw: 180,
    description: 'A sofa and a tea table where guests wait for a table',
  },
  {
    id: 'pass',
    name: { en: 'Pass', zh: '出餐口' },
    kind: 'landmark',
    ...before(F.pass),
    description: 'Finished dishes wait here for the runner',
  },
  {
    id: 'bar',
    name: { en: 'Drinks bar', zh: '饮品台' },
    kind: 'landmark',
    ...before(F.bar),
    description: 'Drinks and tea wait here for the runner',
  },
  {
    id: 'supplies',
    name: { en: 'Supplies cabinet', zh: '备品柜' },
    kind: 'landmark',
    ...before(F.supplies),
    description: 'Napkins, chopsticks, bowls, spoons, takeaway boxes, a baby chair',
  },
  {
    id: 'dish-return',
    name: { en: 'Dish return', zh: '回收口' },
    kind: 'landmark',
    ...before(F.dishReturn),
    description: 'Used dishes go back to the kitchen here',
  },
  {
    id: 'cashier',
    name: { en: 'Cashier', zh: '收银台' },
    kind: 'landmark',
    x: F.cashier.x,
    y: F.cashier.y + F.cashier.d / 2 + 0.55,
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
      yaw: t.serve.yaw,
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
    id: 'private-room',
    name: { en: 'Private room', zh: '包间' },
    kind: 'zone',
    x: (PRIVATE_ROOM.x0 + PRIVATE_ROOM.x1) / 2,
    y: (PRIVATE_ROOM.y0 + PRIVATE_ROOM.y1) / 2,
    w: PRIVATE_ROOM.x1 - PRIVATE_ROOM.x0,
    d: PRIVATE_ROOM.y1 - PRIVATE_ROOM.y0,
    description:
      'A room of its own for eight at table 6, with its own lights, music and air; a sliding door to the dining room',
  },
  {
    id: 'play-area',
    name: { en: 'Play area', zh: '儿童游乐区' },
    kind: 'zone',
    x: (PLAY_AREA.x0 + PLAY_AREA.x1) / 2,
    y: (PLAY_AREA.y0 + PLAY_AREA.y1) / 2,
    w: PLAY_AREA.x1 - PLAY_AREA.x0,
    d: PLAY_AREA.y1 - PLAY_AREA.y0,
    description:
      'A fenced corner for small children: a slide, a ball pit and a mat; play-01 plays with them here',
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

/** A box or circle on the plan as a footprint in world coordinates (z = −y). */
const foot = (b: Box | Round): Footprint =>
  'r' in b ? { x: b.x, z: -b.y, r: b.r } : { x: b.x, z: -b.y, w: b.w, d: b.d }

/** The play area's fence as boxes: the north side, and the east side either side of its gap. */
export function playFence(): Box[] {
  const { x0, x1, y0, y1, gate } = PLAY_AREA
  const t = 0.08
  return [
    { x: (x0 + x1) / 2, y: y1, w: x1 - x0, d: t },
    { x: x1, y: (y0 + gate.y0) / 2, w: t, d: gate.y0 - y0 },
    { x: x1, y: (gate.y1 + y1) / 2, w: t, d: y1 - gate.y1 },
  ]
}

/** The private room's walls as boxes: the south and north ones, and the west one either side of its door. */
export function privateWalls(): Box[] {
  const { x0, x1, y0, y1, door } = PRIVATE_ROOM
  const t = 0.1
  return [
    { x: (x0 + x1) / 2, y: y0, w: x1 - x0, d: t },
    { x: (x0 + x1) / 2, y: y1, w: x1 - x0, d: t },
    { x: x0, y: (y0 + door.y0) / 2, w: t, d: door.y0 - y0 },
    { x: x0, y: (door.y1 + y1) / 2, w: t, d: y1 - door.y1 },
  ]
}

/** Plants and other small things that stand on the floor, which robots go round. */
export const PLANTS: Round[] = [
  { x: 9.35, y: 2.05, r: 0.35 },
  { x: 12.7, y: 0.5, r: 0.35 },
  { x: 21.45, y: 9.8, r: 0.35 },
  { x: 3.6, y: 9.9, r: 0.3 },
]

/**
 * What blocks a robot on the floor: the walls, the low wall with its counters, the dining room's
 * furniture and the tables with their chairs. The kitchen and the bar are walled off from the
 * dining room, so robots of the dining room never plan through them.
 */
export const FOOTPRINTS: Footprint[] = [
  // The outer walls, the south one on either side of the door.
  foot({ x: DOOR.x0 / 2, y: -0.1, w: DOOR.x0 + 0.4, d: 0.2 }),
  foot({ x: (DOOR.x1 + ROOM.w) / 2, y: -0.1, w: ROOM.w - DOOR.x1 + 0.4, d: 0.2 }),
  foot({ x: ROOM.w / 2, y: ROOM.d + 0.1, w: ROOM.w + 0.4, d: 0.2 }),
  foot({ x: -0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }),
  foot({ x: ROOM.w + 0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }),
  // The private room's walls, the west one either side of its door, and the play area's fence,
  // slide and ball pit.
  ...privateWalls().map(foot),
  ...playFence().map(foot),
  foot({ x: (PLAY.slide.ladder.x + PLAY.slide.foot.x) / 2 - 0.1, y: PLAY.slide.top.y, w: 1.75, d: 0.5 }),
  foot(PLAY.pit),
  // The low wall with the pass, the dish return and the bar counter in it, and the bar's side wall.
  foot({ x: ROOM.w / 2, y: BACK_OF_HOUSE_Y, w: ROOM.w, d: 0.6 }),
  foot({ x: BAR_X, y: (BACK_OF_HOUSE_Y + ROOM.d) / 2, w: 0.15, d: ROOM.d - BACK_OF_HOUSE_Y }),
  ...Object.values(FIXTURES).map(foot),
  ...TABLES.map((t) => foot(t.footprint)),
  ...PLANTS.map(foot),
]

/** The seat the guest takes at a table: the one facing most toward the view, so they are seen. */
export function guestSeat(t: Table): Seat {
  const toView = (s: Seat) => Math.cos(((s.yaw - 315) * Math.PI) / 180)
  return t.seats.reduce((best, s) => (toView(s) > toView(best) ? s : best))
}

/** Where things are set down on a table: points on its top, nearest the guest's seat first. */
export function tableSlots(t: Table): { x: number; y: number }[] {
  const seat = guestSeat(t)
  const step = 0.26
  const margin = 0.14
  const points: { x: number; y: number }[] = []
  const r = 'r' in t.top ? t.top.r : Math.max(t.top.w, t.top.d)
  for (let dx = -r; dx <= r; dx += step)
    for (let dy = -r; dy <= r; dy += step) {
      const inside =
        'r' in t.top
          ? Math.hypot(dx, dy) <= t.top.r - margin && Math.hypot(dx, dy) > 0.2
          : Math.abs(dx) <= t.top.w / 2 - margin && Math.abs(dy) <= t.top.d / 2 - margin
      if (inside) points.push({ x: t.x + dx, y: t.y + dy })
    }
  return points.sort(
    (a, b) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y),
  )
}

/** Where the guest steps in from to sit: a little behind the seat, away from the table. */
export function besideSeat(t: Table, s: Seat): { x: number; y: number } {
  const dx = s.x - t.x
  const dy = s.y - t.y
  const n = Math.hypot(dx, dy) || 1
  return { x: s.x + (dx / n) * 0.75, y: s.y + (dy / n) * 0.75 }
}

/** Where a baby chair stands for a child beside the guest's seat `s`: just behind it, toward the table's near end. */
export function babyChairSpot(t: Table, s: Seat): { x: number; y: number } {
  const by = besideSeat(t, s)
  const side = s.x >= t.x ? 1 : -1
  return { x: (s.x + by.x) / 2 + side * 0.55, y: (s.y + by.y) / 2 }
}

/** The tables' surface height, and the counters dishes are set on. */
export const TABLE_H = 0.75
export const COUNTER_H = {
  wok: 0.9,
  stove: 0.9,
  pass: 0.95,
  bar: 1.095,
  supplies: 1.14,
  dishReturn: 0.9,
} as const
