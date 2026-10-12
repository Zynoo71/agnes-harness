import { type Call, CallError } from '@agnes/mhs/device'
import * as THREE from 'three'
import { LAYOUT } from '../base.js'
import { addCamera } from './camera.js'
import { addPlace, reading } from './place.js'
import { headingTo, type Point, planNear, round, toMap } from './route.js'
import { Body, every, everyFrame, FRAME_HZ, frame, type World, WorldDevice, wait } from './world.js'

/** The astronaut's walk: speed in m/s, turning in radians a second, metres per step. */
const WALK = { speed: 0.55, turn: 2.5, stride: 0.38 }
/** Walking where the radio sends them: a brisker pace. */
const HURRY = 0.8
/** Metres the astronaut keeps from buildings, boulders and machines on the way. */
const CLEARANCE = 0.5
/** Where they wait outside the airlock's outer door, and the chamber behind it. */
const AT_DOOR = { x: LAYOUT.airlockDoor[0], z: LAYOUT.airlockDoor[1] + 1.3 }
const CHAMBER = { x: 0, z: 10.6 }
/** Seconds they wait at a closed door before giving up on it. */
const DOOR_WAIT_S = 90
/** Oxygen at or below which they cannot walk any more (the suit's `bad` line). */
const O2_BAD = 15

type Ask = 'none' | 'return' | 'stay' | 'resume'

/**
 * The astronaut walks between the spots of the worksite on their own, working a while at each:
 * nobody commands them, and other devices must keep clear of them. A step bobs and sways the body.
 */
function wander(world: World, body: Body, busy: () => boolean, log: (line: string) => void): void {
  const model = body.object
  const spots = LAYOUT.worksite
  let next = 1
  let restUntil = performance.now() + 6000
  let phase = 0
  let last = performance.now()
  everyFrame(() => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (busy()) return
    if (world.astronaut !== 'working' || now < restUntil) {
      body.speed = 0
      return
    }
    const [x, z] = spots[next] as readonly [number, number]
    const distance = Math.hypot(x - body.at.x, z - body.at.z)
    if (distance < 0.05) {
      next = (next + 1) % spots.length
      restUntil = now + 5000 + Math.random() * 7000
      body.speed = 0
      model.rotation.z = 0
      model.position.y = world.ground(body.at)
      return
    }
    let delta = headingTo(body.at, { x, z }) - model.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    model.rotation.y += Math.sign(delta) * Math.min(Math.abs(delta), WALK.turn * dt)
    const step = Math.abs(delta) < 0.4 ? Math.min(distance, WALK.speed * dt) : 0
    model.position.x += Math.sin(model.rotation.y) * step
    model.position.z += Math.cos(model.rotation.y) * step
    body.odometer += step
    body.speed = step / Math.max(dt, 1e-3)
    phase += (step / WALK.stride) * Math.PI
    model.position.y = world.ground(body.at) + Math.abs(Math.sin(phase)) * 0.05
    model.rotation.z = Math.sin(phase) * 0.05
  }, log)
}

/** The astronaut's suit: its supplies, the wearer's vital signs, a helmet camera and where it is. */
export function suit(
  world: World,
  options: { id: string; name: string; model: THREE.Object3D; o2: number; battery: number },
  log: (line: string) => void,
): WorldDevice {
  const body = new Body(options.model, world)
  let o2 = options.o2
  let battery = options.battery
  const dev = new WorldDevice({
    id: options.id,
    kind: 'wearable',
    name: options.name,
    model: 'Agnes Base EVA suit',
    mobile: true,
    localization: 'self',
    profile: {
      notes: `A pressure suit worn outside the base. It reports its supplies and the wearer's vital signs. The wearer works at the outcrop on their own, walking between spots: keep vehicles clear of them. radio talks to them: they answer, and do what is asked if they can (return walks them to the airlock's outer door and into the chamber once it is open; resume walks them back to work, out through the airlock if they are inside). Oxygen lasts about an hour of work and refills in the habitat. At ${O2_BAD}% oxygen or with a leaking suit they cannot walk: monolith-01 must carry them.`,
    },
    state: {
      o2_left: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'consumable',
        of: 'oxygen',
        alert: { warn: 30, bad: 15, below: true },
        description: 'oxygen left in the tanks',
      },
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
        alert: { warn: 25, bad: 10, below: true },
      },
      comm: { type: 'string', enum: ['ok', 'weak', 'lost'], description: 'the suit radio link to the base' },
      activity: {
        type: 'string',
        enum: ['working', 'walking', 'waiting', 'carried', 'in_airlock', 'inside'],
        description:
          'what the wearer is doing: working at the outcrop, walking where the radio sent them, waiting outside, carried by monolith-01, in the airlock chamber, in the habitat',
      },
    },
    ui: { primary: 'helmet_video' },
    resources: { wearer: 'reject' },
  })
  dev.log = log
  /** Set while radio walks them somewhere. */
  let walking = false
  /** Pressure inside the suit, kPa. */
  let pressure = 29.6
  const activity = () => {
    if (walking) return 'walking'
    const a = world.astronaut
    return a === 'standing' ? 'waiting' : a === 'chamber' ? 'in_airlock' : a
  }
  let reported = ''
  const report = () => {
    reported = activity()
    dev.update({ o2_left: Math.round(o2), battery: Math.round(battery), comm: 'ok', activity: reported })
  }
  report()

  const vitals = dev.source('vitals', 'values', "the wearer's vital signs", {
    hz: 1,
    default: true,
    fields: {
      heart_rate: {
        type: 'integer',
        unit: 'bpm',
        min: 40,
        max: 200,
        role: 'heart_rate',
        alert: { warn: 120, bad: 150 },
      },
      body_temperature: {
        type: 'number',
        unit: '°C',
        min: 34,
        max: 41,
        role: 'body_temperature',
        alert: { warn: 38, bad: 39 },
      },
      spo2: {
        type: 'integer',
        unit: '%',
        min: 70,
        max: 100,
        role: 'spo2',
        alert: { warn: 93, bad: 88, below: true },
      },
    },
  })
  const life = dev.source('life_support', 'values', 'pressure, CO2 and temperature inside the suit', {
    hz: 1,
    fields: {
      pressure: {
        type: 'number',
        unit: 'kPa',
        min: 20,
        max: 35,
        alert: { warn: 27, bad: 25, below: true },
        description: 'suit pressure',
      },
      co2: { type: 'integer', unit: 'ppm', min: 0, max: 20000, alert: { warn: 5000, bad: 10000 } },
      temperature: { type: 'number', unit: '°C', min: 10, max: 35, role: 'temperature', of: 'suit' },
    },
  })
  // The helmet camera, just in front of the visor.
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 1500)
  cam.rotation.set(-0.15, Math.PI, 0, 'YXZ')
  cam.position.set(0, 1.62, 0.5)
  options.model.add(cam)
  addCamera(
    dev,
    world,
    cam,
    {
      id: 'helmet',
      description: 'helmet camera, looking where the wearer looks',
      mount: { xyz: [0.5, 0, 1.62], rpy: [0, 9, 0] },
      default: true,
    },
    log,
  )
  addPlace(dev, world, body, { what: 'astronaut', maxError: 2, hz: 1 }, log)
  wander(world, body, () => walking, log)

  every(
    1000,
    () => {
      const t = performance.now() / 1000
      const effort = walking || world.astronaut === 'working' ? 1 : 0
      if (reported !== activity()) report()
      // A leak lets the suit's pressure down towards its bad line; mended, it comes back up.
      pressure = world.suitLeak ? Math.max(24, pressure - 0.12) : Math.min(29.6, pressure + 0.5)
      const stress = world.suitLeak ? 1 : 0
      if (vitals.wants())
        vitals.send({
          heart_rate: Math.round(78 + effort * 22 + stress * 28 + Math.sin(t / 17) * 5 + Math.random() * 3),
          body_temperature: reading(36.8 + effort * 0.3, 0.05),
          spo2: Math.round(97 - stress * (29.6 - pressure) * 1.2 + Math.random() * 1.5),
        })
      if (life.wants())
        life.send({
          pressure: reading(pressure, 0.05),
          co2: Math.round(1800 + effort * 900 + Math.random() * 100),
          temperature: reading(21 + effort * 1.5, 0.2),
        })
    },
    log,
  )
  // Supplies run down outside, oxygen faster at work and ten times as fast through a leak; in the
  // habitat the suit is plugged in and refills.
  every(
    10000,
    () => {
      if (world.astronaut === 'inside') {
        if (world.suitLeak) log('suit-01: the leak is mended in the habitat')
        world.suitLeak = false
        o2 = Math.min(100, o2 + 4)
        battery = Math.min(100, battery + 4)
      } else {
        const use = walking || world.astronaut === 'working' ? 0.25 : 0.1
        o2 = Math.max(0, o2 - use * (world.suitLeak ? 10 : 1))
        battery = Math.max(0, battery - 0.1)
      }
      report()
    },
    log,
  )

  const where = (p: Point = body.at) => {
    const m = toMap(p)
    return `(${round(m.x, 1)}, ${round(m.y, 1)})`
  }
  /** Why they cannot walk, if they cannot. */
  const cannotWalk = () =>
    world.suitLeak
      ? 'their suit is leaking'
      : o2 <= O2_BAD
        ? `their oxygen is at ${Math.round(o2)}%`
        : undefined
  /** Walks a planned way to `to` (or as near as it gets), bobbing with each step. */
  const walkTo = async (call: Call, to: Point, purpose: string) => {
    const keepouts = world.obstacles(['suit-01']).map((t) => ({ x: t.x, z: t.z, r: t.r + CLEARANCE }))
    const way = planNear(world.planGrid(), body.at, to, keepouts, CLEARANCE)
    if (!way) throw new CallError('x_no_way', `no way on foot from ${where()} to ${where(to)}`)
    const model = body.object
    let phase = 0
    let done = 0
    walking = true
    report()
    try {
      for (const p of way.path) {
        await body.go(call, p, {
          speed: HURRY,
          turnRate: WALK.turn,
          arrive: 0.2,
          step: () => {
            const why = cannotWalk()
            if (why)
              throw new CallError(
                'x_cannot_walk',
                `stopped at ${where()}: ${why}; monolith-01 must carry them`,
              )
            phase += (body.speed / FRAME_HZ / WALK.stride) * Math.PI
            model.position.y = world.ground(body.at) + Math.abs(Math.sin(phase)) * 0.05
            model.rotation.z = Math.sin(phase) * 0.05
          },
        })
        done += 1
        call.progress({
          done,
          total: way.path.length,
          text: `walking ${purpose}: leg ${done} of ${way.path.length}`,
        })
      }
    } finally {
      walking = false
      body.speed = 0
      model.rotation.z = 0
      model.position.y = world.ground(body.at)
      report()
    }
  }
  /** Steps between `from` and `to` in about a second and a half. */
  const step = async (call: Call, from: Point, to: Point, heading: number) => {
    const model = body.object
    model.rotation.set(0, heading, 0)
    const steps = 1.5 * FRAME_HZ
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      const p = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }
      model.position.set(p.x, world.ground(p), p.z)
      await frame(call)
    }
  }
  /** Waits up to DOOR_WAIT_S for the outer door to open; whether it did. */
  const doorOpens = async (call: Call, text: string) => {
    for (let i = 0; i < DOOR_WAIT_S * 4 && world.airlock.outer !== 'open'; i++) {
      if (i % 8 === 0) call.progress({ text })
      await wait(call, 250)
    }
    return world.airlock.outer === 'open'
  }

  const reply: Record<Ask, () => string> = {
    none: () =>
      `Copy. Oxygen ${Math.round(o2)}%, ${activity() === 'working' ? 'still at the outcrop' : 'standing by'}.`,
    return: () => 'Copy, heading back to the airlock.',
    stay: () => 'Copy, holding here.',
    resume: () => 'Copy, going back to work.',
  }

  dev.tool(
    {
      name: 'radio',
      description: `Talk to the wearer over the suit radio. They answer, and do what \`ask\` says when they can: return walks them to the airlock's outer door (about a minute from the outcrop) and, once it is open, into the chamber, where airlock-01 close_outer and cycle_in bring them inside; stay stops them where they are; resume walks them back to work (from the habitat: into the chamber, and out once the outer door opens). They cannot walk with a leaking suit or ${O2_BAD}% oxygen or less.`,
      timeout: 240,
      params: {
        text: { type: 'string', description: 'what to say to them' },
        ask: {
          type: 'string',
          enum: ['none', 'return', 'stay', 'resume'],
          description: 'what to ask them to do; none (the default) only talks',
        },
      },
      required: ['text'],
      uses: ['wearer'],
      motion: true,
      ui: { label: 'Radio' },
    },
    async (call, args) => {
      const ask = ((args.ask as Ask | undefined) ?? 'none') as Ask
      const at = world.astronaut
      if (at === 'carried' && ask !== 'none')
        throw new CallError('x_carried', 'monolith-01 is carrying them; put_down first')
      const why = cannotWalk()
      if (why && (ask === 'return' || ask === 'resume'))
        throw new CallError(
          'x_cannot_walk',
          `they cannot walk: ${why}. monolith-01 must carry them to the airlock (follow suit-01, carry suit-01, go_to the airlock, put_down)`,
        )
      const said = reply[ask]()
      log(`suit-01 radio: "${args.text}" → "${said}"`)
      call.progress({ text: `they answer: "${said}"` })
      const result = (detail: string, data: Record<string, unknown> = {}) => ({
        detail: `they answered "${said}"; ${detail}`,
        data: { said, activity: activity(), ...data },
      })
      if (ask === 'none')
        return result(
          `they are ${activity().replace('_', ' ')} and stay there: none only talks (ask return, stay or resume to have them move)`,
        )
      if (ask === 'stay') {
        if (at === 'working') world.astronaut = 'standing'
        report()
        return result(`waiting at ${where()}`)
      }
      if (ask === 'return') {
        if (at === 'chamber' || at === 'inside')
          return result(`they are ${at === 'inside' ? 'in the habitat' : 'in the airlock chamber'} already`)
        world.astronaut = 'standing'
        await walkTo(call, AT_DOOR, 'to the airlock')
        const face = headingTo(body.at, CHAMBER)
        body.object.rotation.y = face
        if (!(await doorOpens(call, 'at the airlock, waiting for the outer door to open')))
          return result(
            `they wait outside the closed outer door of airlock-01 at ${where()}; cycle_out and open_outer it, then radio return again`,
          )
        await step(call, body.at, CHAMBER, Math.PI)
        world.astronaut = 'chamber'
        world.airlockChanged?.()
        report()
        return result(
          'they stepped into the airlock chamber; airlock-01 close_outer and cycle_in bring them inside',
        )
      }
      // resume: out of the habitat through the airlock if need be, then back to the outcrop.
      if (at === 'working') return result('they are at work already')
      if (at === 'inside') {
        if (world.airlock.inner !== 'open')
          throw new CallError('x_door_closed', "airlock-01's inner door is closed; cycle_in first")
        body.object.visible = true
        body.object.position.set(CHAMBER.x, world.ground(CHAMBER), CHAMBER.z)
        body.object.rotation.set(0, 0, 0)
        world.astronaut = 'chamber'
        world.airlockChanged?.()
        report()
      }
      if (world.astronaut === 'chamber') {
        if (
          !(await doorOpens(
            call,
            'in the airlock chamber, waiting for the outer door to open (airlock-01 cycle_out, open_outer)',
          ))
        )
          return result('they wait in the airlock chamber; airlock-01 cycle_out and open_outer let them out')
        world.astronaut = 'standing'
        world.airlockChanged?.()
        await step(call, CHAMBER, AT_DOOR, 0)
      }
      world.astronaut = 'standing'
      const [x, z] = LAYOUT.worksite[0] as readonly [number, number]
      await walkTo(call, { x, z }, 'back to the outcrop')
      world.astronaut = 'working'
      report()
      return result(`back at work at the outcrop, ${where()}`)
    },
  )

  world.conditions.push({
    device: dev.id,
    en: 'Suit oxygen low',
    zh: '宇航服氧气不足',
    apply: () => {
      o2 = 22
      report()
    },
  })
  world.onReset(() => {
    o2 = options.o2
    battery = options.battery
    walking = false
    pressure = 29.6
    body.reset()
    options.model.visible = true
    report()
  })
  return dev
}
