import { type Call, CallError } from '@agnes/mhs/device'
import * as THREE from 'three'
import { LAYOUT } from '../base.js'
import { addCamera } from './camera.js'
import { addPlace, reading } from './place.js'
import { headingTo, type Point, planNear, round, toMap } from './route.js'
import { Body, every, everyFrame, FRAME_HZ, frame, frameTime, type World, WorldDevice } from './world.js'

/** The astronaut's walk: speed in m/s, turning in radians a second, metres per step. */
const WALK = { speed: 0.55, turn: 2.5, stride: 0.38 }
/** Walking where the radio sends them: a brisker pace. */
const HURRY = 0.8
/** Metres the astronaut keeps from buildings, boulders and machines on the way. */
const CLEARANCE = 0.5
/** Where they wait outside the airlock's outer door, and the chamber behind it. */
const AT_DOOR = { x: LAYOUT.airlockDoor[0], z: LAYOUT.airlockDoor[1] + 1.3 }
const CHAMBER = { x: 0, z: 10.6 }
/** Oxygen at or below which they cannot walk any more (the suit's `bad` line). */
const O2_BAD = 15
/** How someone who cannot walk gets inside. */
const CARRY_IN =
  'monolith-01 must carry them to the airlock: monolith-01 follow suit-01, carry suit-01, go_to the airlock, put_down'

type Ask = 'none' | 'return' | 'stay' | 'resume'

/**
 * Where the astronaut works on their own, round the base: a name for what they are doing there and
 * the spots they walk between at it. The outcrop is the main job; the rest are checks.
 */
const JOBS: { at: string; spots: (readonly [number, number])[] }[] = [
  { at: 'the outcrop', spots: [...LAYOUT.worksite] },
  {
    at: 'the weather station',
    spots: [
      [-2.6, -13],
      [-6.4, -13.4],
    ],
  },
  { at: 'the comms dish', spots: [[-10, -9.5]] },
  {
    at: 'the solar array',
    spots: [
      [12.6, 22.4],
      [12.6, 20.8],
    ],
  },
  { at: 'the seismometer', spots: [[36.2, 28.4]] },
  {
    at: 'the landing pad',
    spots: [
      [6, 37],
      [9.5, 38.5],
    ],
  },
]
/** Metres from a vehicle at which the astronaut stops and lets it pass. */
const GIVE_WAY = 3.5

/**
 * The astronaut goes round the base on their own: to one job after another, on a planned way, and
 * works a while at each spot there. Nobody commands them, and other devices must keep clear of
 * them; they stop for a vehicle close by, and cannot walk at all when `held` says so. A step bobs
 * and sways the body.
 */
function wander(
  world: World,
  body: Body,
  busy: () => boolean,
  held: () => boolean,
  log: (line: string) => void,
): () => string {
  const model = body.object
  let job = 0
  let spot = 0
  /** The way to the current spot, planned when they set off. */
  let way: Point[] | undefined
  let restUntil = performance.now() + 6000
  let phase = 0
  let last = frameTime()
  /** When the way was last planned: a fresh way is followed a while before it is checked again. */
  let planned = 0
  /** Where the vehicles were last frame, to tell which are moving. */
  const seen = new Map<string, Point>()
  const stand = () => {
    body.speed = 0
    model.rotation.z = 0
    model.position.y = world.ground(body.at)
  }
  everyFrame(() => {
    const now = frameTime()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (busy()) {
      way = undefined
      return
    }
    if (world.astronaut !== 'working' || held() || now < restUntil) {
      way = undefined
      if (body.speed) stand()
      return
    }
    // A vehicle on the move close by: wait for it to pass.
    let near = false
    for (const t of world.things()) {
      if (t.id !== 'rover-01' && t.id !== 'monolith-01') continue
      const was = seen.get(t.id)
      seen.set(t.id, { x: t.x, z: t.z })
      const moving = was !== undefined && Math.hypot(t.x - was.x, t.z - was.z) > 0.002
      if (moving && Math.hypot(t.x - body.at.x, t.z - body.at.z) < GIVE_WAY) near = true
    }
    if (near) {
      if (body.speed) stand()
      return
    }
    const [x, z] = (JOBS[job] as (typeof JOBS)[number]).spots[spot] as readonly [number, number]
    if (!way) {
      const keepouts = world.obstacles(['suit-01']).map((t) => ({ x: t.x, z: t.z, r: t.r + CLEARANCE }))
      const path = planNear(world.planGrid(), body.at, { x, z }, keepouts, CLEARANCE)?.path
      way = path?.length ? [...path] : [{ x, z }]
      planned = now
    }
    const to = way[0] as Point
    const distance = Math.hypot(to.x - body.at.x, to.z - body.at.z)
    // A vehicle that has stopped on the way since it was planned: plan again, round it.
    const k = Math.min(1.2, distance) / Math.max(distance, 1e-6)
    const probe = { x: body.at.x + (to.x - body.at.x) * k, z: body.at.z + (to.z - body.at.z) * k }
    const parked = world
      .things()
      .some(
        (t) =>
          (t.id === 'rover-01' || t.id === 'monolith-01') &&
          Math.hypot(t.x - probe.x, t.z - probe.z) < t.r + 0.6,
      )
    if (parked && distance > 0.5 && now - planned > 2000) {
      way = undefined
      return
    }
    if (distance < 0.05) {
      way.shift()
      if (way.length) return
      way = undefined
      // Done here: the next spot of this job, or on to another job.
      spot += 1
      if (spot >= (JOBS[job] as (typeof JOBS)[number]).spots.length) {
        spot = 0
        job = (job + 1 + Math.floor(Math.random() * (JOBS.length - 1))) % JOBS.length
      }
      restUntil = now + 6000 + Math.random() * 8000
      stand()
      return
    }
    let delta = headingTo(body.at, to) - model.rotation.y
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
  const at = () => (JOBS[job] as (typeof JOBS)[number]).at
  return () => (way && body.speed ? `on the way to ${at()}` : `at ${at()}`)
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
      notes: `A pressure suit worn outside the base. It reports its supplies and the wearer's vital signs. The wearer works round the base on their own, one job after another (the outcrop, the weather station, the comms dish, the solar array, the seismometer, the landing pad), walking between them on the paths and stopping for a vehicle close by: keep vehicles clear of them; the pose source says where they are. radio talks to them: they answer, and do what is asked if they can (return walks them to the airlock's outer door and into the chamber once it is open; resume walks them back to work, out through the airlock if they are inside). Oxygen lasts about an hour of work and refills in the habitat. At ${O2_BAD}% oxygen or with a leaking suit they cannot walk: monolith-01 must carry them.`,
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
          'what the wearer is doing: working round the base on their own, walking where the radio sent them, waiting outside, carried by monolith-01, in the airlock chamber, in the habitat',
      },
    },
    // The helmet camera moves the most, so pages show it right after the base camera.
    ui: { primary: 'helmet_video', order: -1 },
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
  const working = wander(
    world,
    body,
    () => walking,
    () => cannotWalk() !== undefined,
    log,
  )

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
  /** Sent back to the airlock, they wait at its outer door until it opens, after the radio call too. */
  let atDoor = false
  world.walkIn = async (call) => {
    const there = Math.hypot(body.at.x - AT_DOOR.x, body.at.z - AT_DOOR.z) < 1.5
    if (!atDoor || !there || walking || world.astronaut !== 'standing') return false
    atDoor = false
    await step(call, body.at, CHAMBER, Math.PI)
    world.astronaut = 'chamber'
    world.airlockChanged?.()
    report()
    return true
  }

  const reply: Record<Ask, () => string> = {
    none: () => `Copy. Oxygen ${Math.round(o2)}%, ${activity() === 'working' ? working() : 'standing by'}.`,
    return: () => 'Copy, heading back to the airlock.',
    stay: () => 'Copy, holding here.',
    resume: () => 'Copy, going back to work.',
  }

  dev.tool(
    {
      name: 'radio',
      description: `Talk to the wearer over the suit radio. They answer, and do what \`ask\` says when they can: return walks them to the airlock's outer door (about a minute from the far jobs) and ends there: they step into the chamber when the door is open, or wait at it and step in once airlock-01 cycle_out and open_outer open it; then airlock-01 close_outer and cycle_in bring them inside. stay stops them where they are; resume walks them back to work (from the habitat: into the chamber, and out once the outer door is open; when it was shut, a second resume after cycle_out and open_outer). They cannot walk with a leaking suit or ${O2_BAD}% oxygen or less: then ${CARRY_IN}.`,
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
        throw new CallError('x_cannot_walk', `they cannot walk: ${why}. ${CARRY_IN}`)
      const said = reply[ask]()
      log(`suit-01 radio: "${args.text}" → "${said}"`)
      call.progress({ text: `they answer: "${said}"` })
      const result = (detail: string, data: Record<string, unknown> = {}) => ({
        detail: `they answered "${said}"; ${detail}`,
        data: { said, activity: activity(), ...data },
      })
      // Someone who cannot walk out here waits for Monolith: the result says so.
      const stuck =
        why && ['working', 'standing'].includes(at) ? `; they cannot walk: ${why}. ${CARRY_IN}` : ''
      if (ask === 'none')
        return result(
          `they are ${activity().replace('_', ' ')} and stay there: none only talks (ask return, stay or resume to have them move)${stuck}`,
        )
      if (ask === 'stay') {
        if (at === 'working') world.astronaut = 'standing'
        report()
        return result(`waiting at ${where()}${stuck}`)
      }
      if (ask === 'return') {
        if (at === 'chamber' || at === 'inside')
          return result(`they are ${at === 'inside' ? 'in the habitat' : 'in the airlock chamber'} already`)
        world.astronaut = 'standing'
        atDoor = false
        await walkTo(call, AT_DOOR, 'to the airlock')
        const face = headingTo(body.at, CHAMBER)
        body.object.rotation.y = face
        // While this call is open nobody can open the door, so they wait there on their own.
        if (world.airlock.outer !== 'open') {
          atDoor = true
          return result(
            `they wait outside the closed outer door of airlock-01 at ${where()}; once airlock-01 cycle_out and open_outer open it, they step into the chamber`,
          )
        }
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
        if (world.airlock.outer !== 'open')
          return result(
            'they wait in the airlock chamber; airlock-01 cycle_out and open_outer, then radio resume again walks them out to work',
          )
        world.astronaut = 'standing'
        world.airlockChanged?.()
        await step(call, CHAMBER, AT_DOOR, 0)
      }
      world.astronaut = 'standing'
      atDoor = false
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
    atDoor = false
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
