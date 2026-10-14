import { CallError } from '@agnes/mhs/device'
import type * as THREE from 'three'
import { puddle } from '../actors.js'
import { babyChairSpot, guestSeat, HOMES, TABLE_H, TABLES, type Table, tableSlots } from '../layout.js'
import { place } from '../shapes.js'
import { landmark, PLACE_PARAM } from './floormap.js'
import { kitchenSpots } from './kitchen.js'
import { stageText } from './menu.js'
import { addPlace, face, Robot } from './motion.js'
import type { Line, Supply } from './service.js'
import { supplySpots } from './supplies.js'
import { every, everyFrame, type World, WorldDevice, wait } from './world.js'

/** Something the runner carries: an order line's dish or a supply. */
type Item = { kind: 'line'; line: Line } | { kind: 'supply'; supply: Supply }

const objectOf = (i: Item) => (i.kind === 'line' ? i.line.object : i.supply.object)
const nameOf = (i: Item) =>
  i.kind === 'line' ? `${i.line.id} ${i.line.dish.en}` : `${i.supply.id} ${i.supply.item.replace('_', ' ')}`

/** Where an item waits to be picked up: the pass, the bar counter or the supplies cabinet. */
function pickup(i: Item): 'pass' | 'bar' | 'supplies' | undefined {
  if (i.kind === 'supply') return i.supply.stage === 'ready' ? 'supplies' : undefined
  if (i.line.stage === 'at_pass') return 'pass'
  if (i.line.stage === 'ready' && i.line.dish.station === 'bar') return 'bar'
  return undefined
}

const towards = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.round(((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360)

type P = { x: number; y: number }

/** The order of pickup places (three at most) that makes the shortest straight-line trip from `from` to `to`. */
function shortestOrder(from: P, stops: string[], to: P): string[] {
  const orders = (rest: string[]): string[][] =>
    rest.length <= 1 ? [rest] : rest.flatMap((s) => orders(rest.filter((x) => x !== s)).map((o) => [s, ...o]))
  const length = (order: string[]) => {
    const points = [from, ...order.map(landmark), to]
    return points
      .slice(1)
      .reduce((sum, p, k) => sum + Math.hypot(p.x - (points[k] as P).x, p.y - (points[k] as P).y), 0)
  }
  return orders(stops).sort((a, b) => length(a) - length(b))[0] ?? stops
}

/** Puts an item on table `t` at the next free slot; a baby chair stands on the floor by the seat, a balloon beside it. */
function setOnTable(world: World, t: Table, i: Item) {
  const object = objectOf(i)
  if (!object) return
  object.position.set(0, 0, 0)
  object.rotation.set(0, 0, 0)
  if (i.kind === 'supply' && i.supply.item === 'baby_chair') {
    const seat = world.service.seat ?? guestSeat(t)
    const spot = babyChairSpot(t, seat)
    world.actors.group.add(place(object, spot.x, spot.y, 0, seat.yaw))
    i.supply.slot = -1
    return
  }
  if (i.kind === 'supply' && i.supply.item === 'balloon') {
    // Tied by the child's place, just beyond the baby chair, leaning away from the table.
    const spot = babyChairSpot(t, world.service.seat ?? guestSeat(t))
    const away = Math.atan2(spot.y - t.y, spot.x - t.x)
    const x = spot.x + Math.cos(away) * 0.22
    const y = spot.y + Math.sin(away) * 0.22
    world.actors.group.add(place(object, x, y, 0, (away * 180) / Math.PI - 90))
    i.supply.slot = -1
    return
  }
  const slot = world.service.freeSlot()
  const slots = tableSlots(t)
  const at = slots[slot % slots.length] ?? { x: t.x, y: t.y }
  world.actors.group.add(place(object, at.x, at.y, TABLE_H + Math.floor(slot / slots.length) * 0.03))
  if (i.kind === 'line') i.line.slot = slot
  else i.supply.slot = slot
}

/** The runner: carries dishes, drinks and supplies to the table on three trays, and clears tables. */
export function runner(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const { runner: model } = world.actors
  const robot = new Robot(
    world,
    model.object,
    { id: 'runner-01', label: 'runner', radius: 0.34, speed: 3.9, home: HOMES.runner, idleS: 6 },
    log,
  )
  let mode: 'docked' | 'fetching' | 'delivering' | 'clearing' | 'returning' = 'docked'
  let battery = 86
  const aboard: Item[] = []
  const dev = new WorldDevice({
    id: 'runner-01',
    kind: 'robot',
    name: 'Runner',
    model: 'Agnes Restaurant delivery robot',
    mobile: true,
    radius: 0.34,
    localization: 'self',
    profile: {
      size_m: [0.55, 0.6, 1.4],
      max_speed: 3.9,
      trays: 3,
      notes:
        'A delivery robot with three trays. deliver fetches up to three items, wherever each waits (dishes on the pass, drinks and desserts on the bar counter, supplies at the supplies cabinet), and serves them at the guest’s table. clear takes dishes and supplies from a table to the dish return. It waits on its charging pad beside the pass, and goes back there by itself when it has nothing to do.',
    },
    resources: { chassis: 'queue' },
    ui: { primary: 'pose' },
    state: {
      mode: { type: 'string', enum: ['docked', 'fetching', 'delivering', 'clearing', 'returning'] },
      carrying: { type: 'string', description: 'what is on its trays' },
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
        alert: { warn: 20, bad: 10, below: true },
      },
    },
  })
  dev.log = log
  const report = () => dev.update({ mode, carrying: aboard.map(nameOf).join(', '), battery })
  report()
  robot.onHome = (phase) => {
    mode = phase === 'leaving' ? 'returning' : 'docked'
    report()
  }
  addPlace(dev, world, robot.body, 'runner', log)
  dev.after = () => ({ pose: robot.body.pose() })
  every(
    10000,
    () => {
      battery = Math.max(5, Math.min(100, battery + (robot.atHome() ? 2 : -1)))
      report()
    },
    log,
  )
  const itemOf = (id: string): Item => {
    const line = service.line(id)
    if (line) return { kind: 'line', line }
    const supply = service.supply(id)
    if (supply) return { kind: 'supply', supply }
    throw new CallError('x_no_item', `there is no order line or supply ${id}`)
  }
  const guestTable = () => {
    const t = TABLES.find((x) => x.id === service.table)
    if (!t || service.guest !== 'seated') throw new CallError('x_not_seated', 'the guest is not at a table')
    return t
  }
  /** Puts an item on the next free tray, stacked if there are more than three. */
  const load = (i: Item) => {
    const object = objectOf(i)
    if (!object) return
    const k = aboard.length
    aboard.push(i)
    object.rotation.set(0, 0, 0)
    if (i.kind === 'supply' && i.supply.item === 'balloon') {
      // A balloon rides at the front of the top tray, floating clear of the trays and the head.
      ;(model.trays[0] as THREE.Object3D).add(object)
      object.position.set(k % 2 ? -0.13 : 0.13, 0, 0.13)
      object.scale.setScalar(0.55)
      return
    }
    const tray = model.trays[k % model.trays.length] as THREE.Object3D
    tray.add(object)
    object.position.set(((k % 2) - 0.5) * 0.12 * Math.min(1, Math.floor(k / 3)), Math.floor(k / 3) * 0.12, 0)
    object.scale.setScalar(i.kind === 'supply' && i.supply.item === 'baby_chair' ? 0.4 : 1)
  }

  dev.tool(
    {
      name: 'deliver',
      description:
        'Fetch up to three items, each from where it waits (an order line on the pass or on the bar counter, a supply at the supplies cabinet), and serve them at the guest’s table: the ones named, else up to three of whatever waits.',
      timeout: 180,
      params: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', maxLength: 8 },
          description: 'order lines (o1) and supplies (s1), three at most a trip',
        },
      },
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Deliver' },
    },
    async (call, { items }) => {
      const t = guestTable()
      const named = items as string[] | undefined
      const things = named?.length
        ? [...new Set(named)].map(itemOf)
        : [
            ...service.lines.map((line): Item => ({ kind: 'line', line })),
            ...service.supplies.map((supply): Item => ({ kind: 'supply', supply })),
          ]
            .filter((i) => pickup(i))
            .slice(0, 3)
      if (!things.length) throw new CallError('x_nothing_waiting', 'nothing waits to be served')
      for (const i of things)
        if (!pickup(i))
          throw new CallError(
            'x_not_ready',
            i.kind === 'line'
              ? `${nameOf(i)} is ${stageText(i.line)}; only dishes on the pass and drinks on the bar counter can be fetched`
              : `${nameOf(i)} is already ${i.supply.stage.replace('_', ' ')}`,
          )
      return robot.work(async () => {
        try {
          mode = 'fetching'
          report()
          // Each place once, in the order that makes the shortest trip to the table.
          for (const stop of shortestOrder(
            robot.body.pose() as { x: number; y: number },
            [...new Set(things.map((i) => pickup(i) as string))],
            t.serve,
          )) {
            await robot.goTo(call, landmark(stop))
            await wait(call, 150)
            for (const i of things.filter((x) => pickup(x) === stop)) {
              if (i.kind === 'line') {
                i.line.stage = 'on_the_way'
                kitchenSpots.delete(i.line.id)
              } else {
                i.supply.stage = 'on_the_way'
                supplySpots.delete(i.supply.id)
              }
              load(i)
              service.changed()
              report()
              await wait(call, 120)
            }
          }
          mode = 'delivering'
          report()
          await robot.goTo(call, t.serve)
          await face(call, robot.body, towards(t.serve, t))
          const served = aboard.splice(0)
          for (const i of served) {
            setOnTable(world, t, i)
            objectOf(i)?.scale.setScalar(1)
            if (i.kind === 'line') i.line.stage = 'served'
            else i.supply.stage = 'served'
            service.changed()
            report()
            await wait(call, 150)
          }
          // The table shows it: the dishes' names over it, and steam rising from the hot ones.
          const dishes = served.flatMap((i) => (i.kind === 'line' ? [i.line] : []))
          if (dishes.length)
            world.cheer({
              en: `✓ ${dishes.map((l) => l.dish.en).join(', ')} served`,
              zh: `✓ ${dishes.map((l) => l.dish.zh).join('、')} 上桌`,
              at: { x: t.x, z: -t.y },
              h: TABLE_H + 0.5,
              steam: dishes.flatMap((l) => (l.object && l.dish.station !== 'bar' ? [l.object] : [])),
            })
          // A balloon floats up by the child's place, and the child beams.
          const gift = served.find((i) => i.kind === 'supply' && i.supply.item === 'balloon')
          const kid = world.companions.some((m) => m.child)
          const at = gift && objectOf(gift)?.position
          if (at) {
            if (kid) world.happyUntil = performance.now() + 8000
            world.cheer({
              en: '🎈 A little gift',
              zh: '🎈 小礼物送到',
              at: { x: at.x, z: at.z },
              h: 1.75,
              steam: [],
            })
          }
          const left = [
            ...service.lines.map((line): Item => ({ kind: 'line', line })),
            ...service.supplies.map((supply): Item => ({ kind: 'supply', supply })),
          ].filter((i) => pickup(i))
          const more = left.length ? `; still waiting to be served: ${left.map(nameOf).join(', ')}` : ''
          const beams = gift && kid ? '; the child beams at the balloon' : ''
          return `served ${things.map(nameOf).join(', ')} at ${t.id}${beams}${more}`
        } finally {
          mode = 'docked'
          report()
        }
      })
    },
  )
  dev.tool(
    {
      name: 'clear',
      description:
        'Once the guest has left, take all dishes and supplies off a table to the dish return; while they are seated, only the items named (all of them if they want everything gone). Defaults to the guest’s table.',
      timeout: 180,
      params: {
        table: { type: 'string', enum: TABLES.map((t) => t.id) },
        items: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', maxLength: 8 },
          description: 'only these',
        },
      },
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Clear' },
    },
    async (call, args) => {
      const t = TABLES.find((x) => x.id === (args.table ?? service.table))
      if (!t) throw new CallError('x_no_table', 'which table? The guest has no table yet')
      const wanted = args.items as string[] | undefined
      const on: Item[] =
        t.id === service.table
          ? [
              ...service.lines
                .filter((l) => l.stage === 'served')
                .map((line): Item => ({ kind: 'line', line })),
              ...service.supplies
                .filter((s) => s.stage === 'served')
                .map((supply): Item => ({ kind: 'supply', supply })),
            ]
          : []
      const things = wanted
        ? on.filter((i) => wanted.includes(i.kind === 'line' ? i.line.id : i.supply.id))
        : on
      if (!things.length) return `nothing to clear on ${t.id}`
      if (!wanted && t.id === service.table && service.guest === 'seated')
        throw new CallError(
          'x_guest_seated',
          `the guest is still at ${t.id}, so clear takes only named items: call it again now with items (the ids of what to take away), or without them once the guest has left`,
        )
      return robot.work(async () => {
        try {
          mode = 'clearing'
          report()
          await robot.goTo(call, t.serve)
          await face(call, robot.body, towards(t.serve, t))
          for (const i of things) {
            load(i)
            if (i.kind === 'line') i.line.slot = undefined
            else i.supply.slot = undefined
            if (i.kind === 'line') i.line.stage = 'cleared'
            else i.supply.stage = 'cleared'
            service.changed()
            report()
            await wait(call, 200)
          }
          await robot.goTo(call, landmark('dish-return'))
          await wait(call, 400)
          for (const i of aboard.splice(0)) objectOf(i)?.removeFromParent()
          report()
          const wipe = service.dirty.has(t.id) ? `; cleaner-01 clean place ${t.id} wipes it free` : ''
          const bad = service.lines.find((l) => l.problem && l.stage === 'served')
          const left = bad
            ? `; ${bad.id} ${bad.dish.en} is still on the table [the guest found ${bad.problem}]`
            : ''
          return `cleared ${things.map(nameOf).join(', ')} from ${t.id} to the dish return${wipe}${left}`
        } finally {
          mode = 'docked'
          report()
        }
      })
    },
  )
  world.onReset(() => {
    for (const i of aboard.splice(0)) objectOf(i)?.removeFromParent()
    robot.reset()
    battery = 86
    mode = 'docked'
    report()
  })
  return dev
}

/** The cleaner: drives to a spot, scrubs spills off the floor and wipes a cleared table. */
export function cleaner(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const { cleaner: model } = world.actors
  const robot = new Robot(
    world,
    model.object,
    { id: 'cleaner-01', label: 'cleaner', radius: 0.36, speed: 2.6, home: HOMES.cleaner, idleS: 5 },
    log,
  )
  let mode: 'docked' | 'going' | 'cleaning' | 'returning' = 'docked'
  let water = 92
  let battery = 74
  const puddles = new Map<string, THREE.Object3D>()
  const dev = new WorldDevice({
    id: 'cleaner-01',
    kind: 'robot',
    name: 'Cleaner',
    model: 'Agnes Restaurant floor scrubber',
    mobile: true,
    radius: 0.36,
    localization: 'self',
    profile: {
      size_m: [0.65, 0.7, 0.55],
      max_speed: 2.6,
      notes:
        'A floor scrubber with a wiping arm: clean goes to a place on the floor map, scrubs spills there, and at a table that needs clearing wipes it so it is free again (its dishes must be cleared first, by runner-01). It goes back to its pad by itself.',
    },
    resources: { chassis: 'queue' },
    ui: { primary: 'pose' },
    state: {
      mode: { type: 'string', enum: ['docked', 'going', 'cleaning', 'returning'] },
      spills: { type: 'string', description: 'places with a spill on the floor' },
      water: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        alert: { warn: 20, bad: 5, below: true },
        description: 'clean water left',
      },
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
        alert: { warn: 20, bad: 10, below: true },
      },
    },
  })
  dev.log = log
  const report = () => dev.update({ mode, spills: [...service.spills].join(', '), water, battery })
  report()
  service.listeners.push(report)
  robot.onHome = (phase) => {
    mode = phase === 'leaving' ? 'returning' : 'docked'
    if (phase === 'home') water = 92
    report()
  }
  addPlace(dev, world, robot.body, 'cleaner', log)
  dev.after = () => ({ pose: robot.body.pose() })
  let scrubbing = false
  everyFrame(() => {
    if (scrubbing) model.brush.rotation.y += 0.4
  }, log)

  dev.tool(
    {
      name: 'clean',
      description:
        'Only where something spilled (see spills) or at a table the guest left, once runner-01 has cleared it: go to the place (a table, the door, …) and scrub the floor there, and at that left table also wipe it so it is free again.',
      timeout: 120,
      params: { place: PLACE_PARAM },
      required: ['place'],
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Clean' },
    },
    async (call, { place: where }) => {
      const p = landmark(where)
      return robot.work(async () => {
        try {
          mode = 'going'
          report()
          await robot.goTo(call, p)
          mode = 'cleaning'
          scrubbing = true
          report()
          const start = robot.body.object.rotation.y
          for (let k = 0; k < 16; k++) {
            await wait(call, 250)
            robot.body.object.rotation.y = start + Math.sin(k * 0.8) * 0.35
            call.progress({ done: k + 1, total: 16, text: `scrubbing at ${where}` })
          }
          robot.body.object.rotation.y = start
          water = Math.max(0, water - 8)
          const notes: string[] = []
          if (service.spills.delete(String(where))) {
            puddles.get(String(where))?.removeFromParent()
            puddles.delete(String(where))
            notes.push('the spill is gone')
          }
          if (service.dirty.has(String(where))) {
            if (where === service.table && service.onTable().length)
              notes.push(`dishes are still on ${where}: runner-01 clear first, then clean again`)
            else {
              service.dirty.delete(String(where))
              notes.push(`${where} is wiped and free`)
            }
          }
          service.changed()
          return `cleaned at ${where}${notes.length ? `; ${notes.join('; ')}` : ''}`
        } finally {
          scrubbing = false
          mode = 'docked'
          report()
        }
      })
    },
  )
  world.conditions.push({
    device: dev.id,
    en: 'The guest knocks over their tea',
    zh: '客人打翻了茶',
    apply: () => {
      const t = TABLES.find((x) => x.id === (service.table ?? 't3')) as Table
      if (service.spills.has(t.id)) return
      const seat = service.seat ?? guestSeat(t)
      const spill = puddle()
      world.actors.group.add(place(spill, (seat.x + t.serve.x) / 2, (seat.y + t.serve.y) / 2, 0))
      puddles.set(t.id, spill)
      service.spills.add(t.id)
      service.changed()
    },
  })
  world.onReset(() => {
    for (const p of puddles.values()) p.removeFromParent()
    puddles.clear()
    robot.reset()
    water = 92
    battery = 74
    mode = 'docked'
    report()
  })
  return dev
}
