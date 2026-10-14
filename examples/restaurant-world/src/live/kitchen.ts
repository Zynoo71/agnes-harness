import { type Call, CallError } from '@agnes/mhs/device'
import * as THREE from 'three'
import { ARM_LINKS, dish } from '../actors.js'
import { ARM_BASE, BARTENDER, COUNTER_H, FIXTURES } from '../layout.js'
import { STATION_DEVICE, type Station } from '../menu.js'
import { place } from '../shapes.js'
import { placed } from './floormap.js'
import { stageText } from './menu.js'
import type { Line } from './service.js'
import { frame, frameTime, PACE, type World, WorldDevice, wait } from './world.js'

/**
 * The kitchen and the bar: the wok station and the stove cook order lines and leave them on their
 * counters, the arm takes them from there to the pass, and the bar's robot makes drinks and
 * desserts and sets them on the bar counter, where the runner picks them up.
 */

const F = FIXTURES
/** Where a finished dish waits on each counter, k-th one along. */
const READY_AT: Record<Exclude<Station, 'bar'>, (k: number) => { x: number; y: number; h: number }> = {
  wok: (k) => ({ x: F.wok.x + 0.2 + k * 0.3, y: F.wok.y - 0.22, h: COUNTER_H.wok }),
  stove: (k) => ({ x: F.stove.x + 0.15 - k * 0.3, y: F.stove.y - 0.22, h: COUNTER_H.stove }),
}
/** Spots on the pass and on the bar counter. */
export const PASS_AT = (k: number) => ({
  x: F.pass.x - 1.2 + (k % 5) * 0.6,
  y: F.pass.y + 0.05,
  h: COUNTER_H.pass,
})
export const BAR_AT = (k: number) => ({
  x: F.bar.x - 1.4 + (k % 7) * 0.4,
  y: F.bar.y + 0.02,
  h: COUNTER_H.bar,
})

/** Sets a line's dish down at a spot in the scene. */
function setDown(world: World, l: Line, at: { x: number; y: number; h: number }) {
  const object = l.object ?? dish(l.dish.look, l.dish.color)
  l.object = object
  object.position.set(0, 0, 0)
  object.rotation.set(0, 0, 0)
  world.actors.group.add(place(object, at.x, at.y, at.h))
}

/** The lowest spot index among `lines` at `stage` that no line uses. */
function freeSpot(lines: Line[], taken: (l: Line) => number | undefined): number {
  const used = new Set(lines.map(taken))
  let k = 0
  while (used.has(k)) k += 1
  return k
}

/** Where each line waits on a counter or the pass, by line id. */
const spots = new Map<string, number>()

/** The order line named by `item`, else the first that `next` picks, in order. */
function lineFor(world: World, item: unknown, next: (l: Line) => boolean, where: string): Line {
  if (item === undefined || item === '') {
    const l = world.service.lines.find(next)
    if (!l) throw new CallError('x_nothing_waiting', `nothing waits for ${where}`)
    return l
  }
  const l = world.service.line(String(item))
  if (!l) throw new CallError('x_no_line', `there is no order line ${item}`)
  return l
}

const ready = (world: World, station: Station) =>
  world.service.lines.filter((l) => l.dish.station === station && l.stage === 'ready')

/** A cooking station (the wok, or the steamer and stove): cooks one order line at a time. */
function station(world: World, which: 'wok' | 'stove', log: (line: string) => void): WorldDevice {
  const { service } = world
  const { effects } = world.actors
  const id = STATION_DEVICE[which]
  const isWok = which === 'wok'
  let cooking: Line | undefined
  const dev = new WorldDevice({
    id,
    kind: 'appliance',
    name: isWok ? 'Wok station' : 'Steamer and stove',
    model: isWok ? 'Agnes Restaurant auto-wok' : 'Agnes Restaurant steamer and stove',
    localization: 'fixed',
    placement: placed(isWok ? F.wok.x : F.stove.x, F.wok.y, 270),
    profile: {
      notes: isWok
        ? 'An automatic wok: stir-fries and braises order lines from menu-01, one at a time, following the line’s note (less spicy, no peanuts), once prep-01 has prepped them. A finished dish waits on its counter for arm-01 to take it to the pass.'
        : 'Steams and boils order lines from menu-01 (fish, dumplings, noodles, soup, rice), one at a time, once prep-01 has prepped them. A finished dish waits on its counter for arm-01 to take it to the pass.',
    },
    resources: { [which]: 'queue' },
    state: {
      mode: { type: 'string', enum: ['idle', 'cooking'] },
      cooking: { type: 'string', description: 'the order line being cooked' },
      ready: { type: 'string', description: 'finished dishes waiting on the counter for arm-01' },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      mode: cooking ? 'cooking' : 'idle',
      cooking: cooking ? `${cooking.id} ${cooking.dish.en}` : '',
      ready: ready(world, which)
        .map((l) => `${l.id} ${l.dish.en}`)
        .join(', '),
    })
  report()
  service.listeners.push(report)
  dev.tool(
    {
      name: 'cook',
      description: isWok
        ? 'Stir-fry or braise an order line from menu-01 (a wok-01 dish), following its note, once prep-01 has prepped it: the one named, else the next prepped. Calls wait their turn.'
        : 'Steam or boil an order line from menu-01 (a stove-01 dish), once prep-01 has prepped it: the one named, else the next prepped. Calls wait their turn.',
      timeout: 120,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o1' } },
      uses: [which],
      motion: true,
      ui: { label: 'Cook' },
    },
    async (call, { item }) => {
      const l = lineFor(
        world,
        item,
        (x) => x.dish.station === which && x.stage === 'prepped',
        `${id}, prepped`,
      )
      if (l.dish.station !== which)
        throw new CallError(
          'x_wrong_station',
          `${l.id} ${l.dish.en} is made by ${STATION_DEVICE[l.dish.station]}`,
        )
      if (l.stage === 'queued' || l.stage === 'prepping')
        throw new CallError('x_not_prepped', `${l.id} ${l.dish.en} is not prepped yet: prep-01 prep it first`)
      if (l.stage !== 'prepped')
        throw new CallError('x_not_waiting', `${l.id} ${l.dish.en} is ${stageText(l)}`)
      cooking = l
      l.stage = 'cooking'
      if (l.prepObject) l.prepObject.visible = false
      service.changed()
      effects[isWok ? 'fire' : 'steam'].visible = true
      try {
        let done = 0
        // Hurrying it (menu-01 hurry) halves what is left.
        while (done < l.dish.seconds) {
          await wait(call, 500)
          done += l.rush ? 1 : 0.5
          call.progress({
            done: Math.min(done, l.dish.seconds),
            total: l.dish.seconds,
            text: `cooking ${l.id} ${l.dish.en}${l.note ? ` (${l.note})` : ''}`,
          })
        }
      } catch (e) {
        if (l.stage === 'cooking') l.stage = 'prepped'
        if (l.prepObject) l.prepObject.visible = true
        throw e
      } finally {
        cooking = undefined
        effects[isWok ? 'fire' : 'steam'].visible = false
        service.changed()
      }
      l.prepObject?.removeFromParent()
      l.prepObject = undefined
      const k = freeSpot(ready(world, which), (x) => spots.get(x.id))
      spots.set(l.id, k)
      setDown(world, l, READY_AT[which](k))
      l.stage = 'ready'
      service.changed()
      return `${l.id} ${l.dish.en} is ready on the counter${l.note ? `, made ${l.note}` : ''}, for arm-01 to plate`
    },
  )
  world.onReset(() => {
    cooking = undefined
    effects[isWok ? 'fire' : 'steam'].visible = false
    spots.clear()
    report()
  })
  return dev
}

export const wok = (world: World, log: (line: string) => void) => station(world, 'wok', log)
export const stove = (world: World, log: (line: string) => void) => station(world, 'stove', log)

/** The bar's robot: makes drinks and desserts and sets them on the bar counter. */
export function bar(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const { bartender } = world.actors
  let making: Line | undefined
  const waiting = () => ready(world, 'bar')
  const dev = new WorldDevice({
    id: 'bar-01',
    kind: 'robot',
    name: 'Bar robot',
    model: 'Agnes Restaurant two-armed bar robot',
    localization: 'fixed',
    placement: placed(BARTENDER.x, BARTENDER.y, BARTENDER.yaw),
    profile: {
      notes:
        'A two-armed robot behind the drinks bar: makes drinks, tea and desserts (the birthday cake comes with candles lit) for order lines from menu-01, one at a time, and sets them on the bar counter for runner-01.',
    },
    resources: { arms: 'queue' },
    state: {
      mode: { type: 'string', enum: ['idle', 'making'] },
      making: { type: 'string', description: 'the order line being made' },
      ready: { type: 'string', description: 'drinks and desserts waiting on the bar counter for runner-01' },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      mode: making ? 'making' : 'idle',
      making: making ? `${making.id} ${making.dish.en}` : '',
      ready: waiting()
        .map((l) => `${l.id} ${l.dish.en}`)
        .join(', '),
    })
  report()
  service.listeners.push(report)
  dev.tool(
    {
      name: 'make',
      description:
        'Make a drink or dessert order line from menu-01 (a bar-01 item): the one named, else the next waiting. Calls wait their turn.',
      timeout: 90,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o2' } },
      uses: ['arms'],
      motion: true,
      ui: { label: 'Make' },
    },
    async (call, { item }) => {
      const l = lineFor(world, item, (x) => x.dish.station === 'bar' && x.stage === 'queued', 'the bar')
      if (l.dish.station !== 'bar')
        throw new CallError(
          'x_wrong_station',
          `${l.id} ${l.dish.en} is made by ${STATION_DEVICE[l.dish.station]}`,
        )
      if (l.stage !== 'queued')
        throw new CallError('x_not_waiting', `${l.id} ${l.dish.en} is ${stageText(l)}`)
      making = l
      l.stage = 'cooking'
      service.changed()
      // The drink takes shape in the right hand while both arms work.
      const object = dish(l.dish.look, l.dish.color)
      l.object = object
      const hand = bartender.arms[1]?.hand
      hand?.add(object)
      object.position.set(0, -0.12, 0.05)
      bartender.busy = true
      try {
        let done = 0
        while (done < l.dish.seconds) {
          await wait(call, 100)
          done += l.rush ? 0.2 : 0.1
          const t = performance.now() / 1000
          bartender.arms.forEach((a, k) => {
            a.shoulder.rotation.x = -0.5 + Math.sin(t * 6 + k * Math.PI) * 0.25
            a.elbow.rotation.x = -1.2 + Math.sin(t * 9 + k) * 0.3
          })
          call.progress({
            done: Math.min(done, l.dish.seconds),
            total: l.dish.seconds,
            text: `making ${l.id} ${l.dish.en}`,
          })
        }
      } catch (e) {
        object.removeFromParent()
        l.object = undefined
        if (l.stage === 'cooking') l.stage = 'queued'
        throw e
      } finally {
        making = undefined
        bartender.busy = false
        service.changed()
      }
      const k = freeSpot(waiting(), (x) => spots.get(x.id))
      spots.set(l.id, k)
      setDown(world, l, BAR_AT(k))
      l.stage = 'ready'
      service.changed()
      return `${l.id} ${l.dish.en} is ready on the bar counter for runner-01`
    },
  )
  world.onReset(() => {
    making = undefined
    bartender.busy = false
    report()
  })
  return dev
}

/** The kitchen arm: plates finished dishes from the wok's and the stove's counters onto the pass. */
export function arm(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const { arm: a } = world.actors
  let holding: Line | undefined
  const atPass = () => service.lines.filter((l) => l.stage === 'at_pass')
  const dev = new WorldDevice({
    id: 'arm-01',
    kind: 'arm',
    name: 'Kitchen arm',
    model: 'Agnes Restaurant six-axis kitchen arm',
    localization: 'fixed',
    placement: placed(ARM_BASE.x, ARM_BASE.y, 270),
    profile: {
      reach_m: 2.2,
      notes:
        'A fixed arm between the wok station, the stove and the pass. plate takes a finished dish waiting on wok-01’s or stove-01’s counter and sets it on the pass, under the heat lamps, for runner-01.',
    },
    resources: { arm: 'queue' },
    state: {
      mode: { type: 'string', enum: ['idle', 'plating'] },
      holding: { type: 'string', description: 'the dish in its gripper' },
      at_pass: { type: 'string', description: 'dishes on the pass waiting for runner-01' },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      mode: holding ? 'plating' : 'idle',
      holding: holding ? `${holding.id} ${holding.dish.en}` : '',
      at_pass: atPass()
        .map((l) => `${l.id} ${l.dish.en}`)
        .join(', '),
    })
  report()
  service.listeners.push(report)

  /** The arm's joints to put the grip at plan point (x, y), `h` over the floor. */
  const solve = (x: number, y: number, h: number) => {
    const dx = x - ARM_BASE.x
    const dz = -(y - ARM_BASE.y)
    const r = Math.hypot(dx, dz)
    const up = h + ARM_LINKS.grip - ARM_LINKS.shoulder
    const { upper: L1, fore: L2 } = ARM_LINKS
    const d = Math.min(Math.hypot(r, up), L1 + L2 - 0.01)
    const e = Math.acos(THREE.MathUtils.clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1))
    const s = Math.atan2(r, up) - Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e))
    return { yaw: Math.atan2(dx, dz), s, e }
  }
  const move = async (call: Call, to: { yaw: number; s: number; e: number }, ms = 700) => {
    const from = { yaw: a.base.rotation.y, s: a.shoulder.rotation.x, e: a.elbow.rotation.x }
    const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw))
    const start = frameTime()
    for (;;) {
      const k = Math.min(1, ((frameTime() - start) * PACE) / ms)
      const ease = k * k * (3 - 2 * k)
      a.base.rotation.y = from.yaw + turn * ease
      a.pose(from.s + (to.s - from.s) * ease, from.e + (to.e - from.e) * ease)
      if (k >= 1) return
      await frame(call)
    }
  }
  const reach = (call: Call, at: { x: number; y: number; h: number }, lift = 0, ms?: number) =>
    move(call, solve(at.x, at.y, at.h + lift), ms)

  dev.tool(
    {
      name: 'plate',
      description:
        'Take a finished dish (an order line ready on wok-01’s or stove-01’s counter) to the pass for runner-01: the one named, else the one that has waited longest. Calls wait their turn.',
      timeout: 60,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o1' } },
      uses: ['arm'],
      motion: true,
      ui: { label: 'Plate' },
    },
    async (call, { item }) => {
      const l = lineFor(
        world,
        item,
        (x) => x.dish.station !== 'bar' && x.stage === 'ready',
        'the kitchen counters',
      )
      if (l.dish.station === 'bar')
        throw new CallError(
          'x_bar_item',
          `${l.id} ${l.dish.en} waits on the bar counter; runner-01 picks it up there`,
        )
      if (l.stage !== 'ready' || !l.object)
        throw new CallError('x_not_ready', `${l.id} ${l.dish.en} is ${stageText(l)}`)
      a.busy = true
      holding = l
      report()
      try {
        const from = l.object.getWorldPosition(new THREE.Vector3())
        const pick = { x: from.x, y: -from.z, h: from.y }
        await reach(call, pick, 0.3)
        await reach(call, pick, 0, 400)
        a.grip.add(l.object)
        l.object.position.set(0, 0, 0)
        l.object.rotation.set(0, 0, 0)
        spots.delete(l.id)
        service.changed()
        await reach(call, pick, 0.35, 400)
        const k = freeSpot(atPass(), (x) => spots.get(x.id))
        const to = PASS_AT(k)
        await reach(call, to, 0.35, 1000)
        await reach(call, to, 0, 400)
        spots.set(l.id, k)
        setDown(world, l, to)
        l.stage = 'at_pass'
        service.changed()
        await reach(call, to, 0.5, 350)
        return `${l.id} ${l.dish.en} is on the pass for runner-01`
      } finally {
        holding = undefined
        a.busy = false
        report()
      }
    },
  )
  world.onReset(() => {
    holding = undefined
    a.busy = false
    report()
  })
  return dev
}

export { spots as kitchenSpots }
