import { type Call, CallError } from '@agnes/mhs/device'
import * as THREE from 'three'
import { type BedName, type Crop, GREENHOUSE, LAYOUT } from '../base.js'
import { sunAt } from '../clock.js'
import { MONOLITH } from '../devices.js'
import { buildCrate, STRIKE, UNFOLD_S } from '../monolith.js'
import { OBSTACLES, type Obstacle } from '../terrain.js'
import { GLYPHS, layout, WRITABLE } from '../writing.js'
import { PLACE_PARAM, pointOf } from './basemap.js'
import { addCamera } from './camera.js'
import { GROW_S } from './greenhouse.js'
import { MAP_AREA } from './map.js'
import { addPlace, reading } from './place.js'
import {
  type Circle,
  fromMap,
  headingTo,
  MONO,
  monolithAhead,
  openAround,
  type Point,
  planNear,
  round,
  toMap,
} from './route.js'
import {
  Blocked,
  Body,
  every,
  everyFrame,
  FRAME_HZ,
  frame,
  frameTime,
  routes,
  type Thing,
  turnTo,
  type World,
  WorldDevice,
  wait,
} from './world.js'

/** Gaits: top speed in m/s, acceleration in m/s², turning in radians a second. */
const GAIT = {
  walk: { speed: 2.5, accel: 2, turn: Math.PI * 0.9 },
  roll: { speed: 6, accel: 2, turn: Math.PI / 2 },
}
/** From its front to what it picks up, at most, in metres. */
const REACH = 1.2
/** Seconds to lift or set down a load. */
const LIFT_S = 1.5
/** Pushing a boulder aside: the widest it can move, in metres across, how far, and in how many seconds. */
export const PUSH = { across: 2, metres: 3.5, seconds: 3.5 }
/**
 * Breaking a boulder: seconds a blow takes, blows for the smallest and the biggest boulders, how
 * far from its centre to the boulder's face it stands to strike, and seconds the rubble takes to land.
 */
const BREAK = { blow: 1.3, fewest: 4, most: 6, reach: 0.8, settle: 1.8 }
/** A broken boulder's result names the boulders still standing this close to it, metres. */
const NEAR_BOULDER_M = 30
/** A close-up photo is taken of a rock within this many metres of its front. */
const CLOSE_UP = 3
/** What a close-up of each kind of unusual rock shows. */
const LOOKS = {
  'rock-1': 'a greenish-grey stone about 0.9 m across, finely layered, unlike the red rocks around it',
  meteorite:
    'a dark, metallic stone about 0.65 m across with a black, glassy fusion crust, half sunk in a splash of thrown-out dust',
}
/** The greenhouse's aisle: where it turns in from outside the east door, just inside it, and its west end. */
const AISLE = {
  door: { x: LAYOUT.greenhouseDoor[0], z: LAYOUT.greenhouseDoor[1] },
  entry: { x: LAYOUT.greenhouse[0] + GREENHOUSE.length / 2 - 0.6, z: LAYOUT.greenhouse[1] },
  west: { x: LAYOUT.greenhouse[0] - GREENHOUSE.length / 2 + 1.1, z: LAYOUT.greenhouse[1] },
}
/** Taking what it holds into the habitat, step by step: said in the results that end holding it. */
const INTO_AIRLOCK =
  'go_to the airlock; airlock-01 cycle_out (skip it when its pressure is already near 0 kPa), then open_outer; put_down; then airlock-01 close_outer and cycle_in'
/** How fast it walks along a bed while it plants or harvests it, m/s. */
const TENDING = 1
/** What each plant yields, in kg. */
const YIELD: Record<Exclude<Crop, 'none'>, number> = { potato: 0.6, tomato: 0.4 }
/** Towing: the cable's length in metres, and how near home (the dock, the hopper pad) put_down winches it into place. */
const TOW = { cable: 1.2, home: 8 }
/** Where it holds an astronaut: this far in front of its centre and this high off the ground. */
const HELD = { ahead: 0.72, up: 0.32 }
/** It counts as at the airlock within this many metres of the outer door, and at the lab of the lab. */
const AT_AIRLOCK = 3
const AT_LAB = 6
/** In the airlock's chamber, just inside the outer door, in world coordinates. */
const CHAMBER = { x: 0, z: 10.6 }
/** Devices and people it can follow. */
const FOLLOWABLE = ['suit-01', 'rover-01', 'hopper-01']
/**
 * Writing in the sand: at most this many characters, metres a grid unit (letters 4 units tall), its
 * pace over the letters (m/s, m/s², radians a second: brisker than its walk, so a word takes about
 * half a minute), and metres a furrow segment.
 */
const WRITE = { most: 8, scale: 1.25, speed: 4, accel: 6, turn: Math.PI * 3, segment: 0.3 }
/** Follow ends this close to a machine's edge; to a person it walks up to its stop distance. */
const MACHINE_GAP = 1.5
/** Following plans its way again once the target has moved this far from where it was, in metres. */
const REPLAN_M = 1
const ARRIVED = 'arrived'
const REPLAN = 'replan'

/**
 * What it adds to what it says, by its settings: the higher `humor`, the more it jokes; the lower
 * `honesty`, the more it smooths things over. Facts in tool results stay plain whatever they are.
 */
const QUIPS = [
  'Four slabs, no complaints.',
  'Walking is slower, but it is good for my image.',
  'I would roll there, but someone has to keep the dust company.',
  'That was the plan. I will act as if it was mine.',
  'Mars has no air, and still I have timing.',
]
const DRY = ['Copy.', 'Understood.', 'On it.']
const LINES = {
  pickup: {
    honest: 'I have you. Hold still; the walk to the airlock is bumpy.',
    smooth: 'I have you. This will be a perfectly smooth ride.',
  },
  chamber: {
    honest: 'You are in the airlock. Not my most graceful delivery.',
    smooth: 'Delivered, flawlessly.',
  },
  standing: { honest: 'Setting you down here. Stay where you are.', smooth: 'Here we are. Lovely spot.' },
  pushed: {
    honest: 'Boulder moved. The way is clear.',
    smooth: 'Boulder relocated. It wanted a better view.',
  },
  broke: {
    honest: 'Boulder broken up. The way is clear; mind the gravel.',
    smooth: 'Boulder gone. It was falling apart anyway.',
  },
  planted: {
    honest: 'Seed potatoes in. Now water and light, and patience.',
    smooth: 'Planted. Finest potatoes on Mars, guaranteed.',
  },
  harvested: {
    honest: 'Fresh food, grown on Mars.',
    smooth: 'A record harvest. Also the only one.',
  },
  photo: {
    honest: 'Close-up taken. Hold still, rock.',
    smooth: 'Close-up taken. The rock said cheese.',
  },
  hitched: {
    honest: 'Cable on. I pull, you roll.',
    smooth: 'Hitched. A perfectly normal thing for a monolith to do.',
  },
  home: {
    honest: 'Home. All yours.',
    smooth: 'Delivered, as if nothing ever happened.',
  },
  wrote: {
    honest: 'Written. It reads best from above.',
    smooth: 'Calligraphy, Martian style.',
  },
}

/**
 * Monolith: four metal slabs joined at the middle, a robot built to work beside people. It walks by
 * swinging its slabs, unfolds into a wheel to roll fast over open ground, follows people and
 * machines, carries an astronaut or a rock sample, and talks over the radio. It finds its way on the
 * base map around buildings, boulders and machines, stops by itself before a boulder or machine in
 * its way, and comes as close as half a metre to a person.
 */
export function monolith(world: World, log: (line: string) => void): WorldDevice {
  const { monolith: model, astronaut, rover, hopper } = world.parts
  const body = new Body(model.group, world)
  let battery = 93
  let humor = 75
  let honesty = 90
  let motor = -20
  let load: { kind: 'astronaut' | 'sample' | 'rover' | 'hopper' | 'crate'; id: string } | undefined
  let moving: 'walk' | 'roll' | undefined
  /** The motion call running now, which the stop tool ends. */
  let current: Call | undefined
  const dev = new WorldDevice({
    id: MONOLITH.id,
    kind: 'robot',
    name: MONOLITH.name,
    model: 'Agnes Base four-slab robot',
    mobile: true,
    radius: 0.4,
    localization: 'self',
    profile: {
      size_m: [0.42, 0.6, 1.5],
      weight_kg: 280,
      max_speed: GAIT.roll.speed,
      payload_kg: 180,
      reach_m: REACH,
      notes: `Four metal slabs joined at the middle, about 1.5 m tall. It walks at ${GAIT.walk.speed} m/s by swinging its slabs; on open ground it unfolds into a wheel and rolls at ${GAIT.roll.speed} m/s (not while it carries something). It finds its own way on the base map around buildings, boulders and machines. Built to work beside people: it comes within ${MONO.personGap} m of a person, but stops by itself before a boulder or a machine in its way. It can carry an astronaut, a rock sample or a crate, tow the rover or the hopper on a cable, push a small boulder aside or break a boulder of any size into rubble, and plant and harvest the greenhouse beds. A nuclear battery keeps it charged: it never runs flat. humor and honesty (0-100 %) change how it phrases what it says, never the facts in its results.`,
    },
    resources: { slabs: 'reject', radio: 'queue' },
    manual: {
      axes: [
        { id: 'vx', role: 'forward', unit: 'm/s', min: -0.5, max: GAIT.walk.speed, keys: ['w', 's'] },
        { id: 'wz', role: 'turn', unit: 'deg/s', min: -90, max: 90, keys: ['a', 'd'] },
      ],
      rate_hz: 10,
      deadman_s: 0.5,
    },
    // First in the Devices panel: Monolith does the most of the work.
    ui: { primary: 'front_video', order: -3 },
    state: {
      mode: {
        type: 'string',
        enum: ['idle', 'walking', 'rolling', 'carrying'],
        description:
          'standing idle, walking, rolling as a wheel, or carrying a load (lifting, holding, walking with it)',
      },
      carrying: {
        type: 'string',
        enum: ['none', 'astronaut', 'sample', 'rover', 'hopper', 'crate'],
        description: 'what it holds, or tows on its cable',
      },
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
      },
      humor: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        writable: true,
        description: 'how much it jokes in what it says',
      },
      honesty: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        writable: true,
        description: 'how plainly it tells people how things are, rather than smoothing them over',
      },
    },
  })
  dev.log = log
  const mode = () => (moving === 'roll' ? 'rolling' : load ? 'carrying' : moving ? 'walking' : 'idle')
  const report = () =>
    dev.update({ mode: mode(), carrying: load?.kind ?? 'none', battery: Math.round(battery), humor, honesty })
  report()
  dev.onSet = (name, value) => {
    if (name === 'humor') humor = value as number
    if (name === 'honesty') honesty = value as number
    return value
  }

  // The front camera in the display strip, held level as the slabs swing.
  // Its near plane clips the slabs that swing past the lens as it walks.
  const front = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 2000)
  front.rotation.order = 'YXZ'
  front.rotation.set(-0.12, Math.PI, 0)
  front.position.set(0, 1.36, 0.24)
  model.group.add(front)
  addCamera(
    dev,
    world,
    front,
    {
      id: 'front',
      description: 'front camera beside the display strip, 1.36 m up, looking ahead and 7 degrees down',
      mount: { xyz: [0.24, 0, 1.36], rpy: [0, 7, 0] },
      default: true,
    },
    log,
  )
  addPlace(dev, world, body, { what: 'robot', maxError: 0.3 }, log)
  const odometry = dev.source('odometry', 'odometry', 'from its hinge encoders, since start-up', { hz: 5 })
  every(200, () => void (odometry.wants() && odometry.send(body.odometry())), log)
  const health = dev.source('health', 'values', 'battery and the hinge motors', {
    hz: 1,
    fields: {
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
      },
      motor_temperature: {
        type: 'number',
        unit: '°C',
        min: -60,
        max: 100,
        role: 'temperature',
        of: 'motor',
        description: 'the hinge motors that swing the slabs',
      },
    },
  })
  every(
    1000,
    () => {
      const working = body.speed > 0.05 || Math.abs(body.turn) > 0.05
      const effort = moving === 'roll' ? 2 : load ? 1.6 : 1
      // Its nuclear battery keeps the cells topped up whatever it does, and the hinge motors are
      // rated for far more than it asks of them: it never runs flat or overheats.
      motor += working ? (10 + 10 * effort - motor) * 0.03 : (-20 - motor) * 0.01
      battery = Math.min(100, battery + 0.05)
      if (health.wants())
        health.send({ battery: Math.round(battery), motor_temperature: reading(motor, 0.3) })
    },
    log,
  )
  every(5000, report, log)

  // An astronaut in its hold goes where it goes, every frame.
  const hold = () => {
    const h = body.heading
    const p = body.at
    const x = p.x + Math.sin(h) * HELD.ahead
    const z = p.z + Math.cos(h) * HELD.ahead
    astronaut.position.set(x, world.ground({ x, z }) + HELD.up, z)
    astronaut.rotation.set(-0.1, h, 0)
  }
  // A towed vehicle trails on the cable: pulled along once the cable is taut, nose towards it.
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.4 }),
  )
  cable.visible = false
  world.scene.add(cable)
  // The crate of harvest: in its hands, or set down on the ground or in the airlock's chamber.
  const crate = buildCrate()
  crate.group.visible = false
  world.scene.add(crate.group)
  const showCrate = () => {
    const { at, kg } = world.crate
    const crop = world.crate.crop === 'tomato' ? 'tomato' : 'potato'
    const full = kg / (GREENHOUSE.plants * YIELD[crop])
    model.crate.fill(full, crop)
    crate.fill(full, crop)
    if (at === 'held') model.want.hold = 'crate'
    else if (model.want.hold === 'crate') model.want.hold = 'none'
    crate.group.visible = at === 'ground' || at === 'chamber'
  }
  world.crateChanged = showCrate
  /** How high the towed vehicle rides above the ground (the hopper on its feet). */
  let lift = 0
  const towed = () => (load?.kind === 'rover' ? rover : load?.kind === 'hopper' ? hopper : undefined)
  const drag = (v: THREE.Object3D) => {
    const h = body.heading
    const back = { x: body.at.x - Math.sin(h) * MONO.nose, z: body.at.z - Math.cos(h) * MONO.nose }
    const r = load?.kind === 'rover' ? 1.4 : 1.3
    const dx = v.position.x - back.x
    const dz = v.position.z - back.z
    const d = Math.hypot(dx, dz) || 1
    if (d > TOW.cable + r) {
      v.position.x = back.x + (dx / d) * (TOW.cable + r)
      v.position.z = back.z + (dz / d) * (TOW.cable + r)
      if (load?.kind === 'rover') {
        const want = Math.atan2(-dx, -dz)
        v.rotation.y += Math.atan2(Math.sin(want - v.rotation.y), Math.cos(want - v.rotation.y)) * 0.15
      }
    }
    v.position.y = world.ground(v.position) + lift
    const from = new THREE.Vector3(back.x, world.ground(back) + 0.5, back.z)
    const edge = { x: v.position.x - (dx / d) * r * 0.8, z: v.position.z - (dz / d) * r * 0.8 }
    const to = new THREE.Vector3(edge.x, world.ground(edge) + 0.5, edge.z)
    cable.position.copy(from)
    cable.lookAt(to)
    cable.scale.set(1, 1, from.distanceTo(to))
  }
  everyFrame(() => {
    if (load?.kind === 'astronaut') hold()
    const v = towed()
    if (v) drag(v)
  }, log)

  // What says something: a bubble over it in the scene, for longer the more it says.
  const speak = (text: string) => {
    model.speech.text = text
    model.speech.until = performance.now() + 2500 + text.length * 60
    return text
  }
  const voice = (line: { honest: string; smooth: string }) => (honesty >= 50 ? line.honest : line.smooth)
  let said = 0
  const flavour = (text: string) => {
    said += 1
    const extra =
      humor >= 70 ? ` ${QUIPS[said % QUIPS.length]}` : humor >= 40 ? ` ${DRY[said % DRY.length]}` : ''
    return `${text}${extra}${honesty < 30 ? ' Trust me.' : ''}`
  }

  const where = (p: Point = body.at) => {
    const m = toMap(p)
    return `(${m.x}, ${m.y})`
  }
  /** What it must keep clear of: everything but itself, what it holds, and `except`. */
  const around = (except: string[] = []): Thing[] =>
    world.obstacles([MONOLITH.id, ...(load && load.kind !== 'sample' ? [load.id] : []), ...except])
  const describe = (hit: Thing) => {
    const nose = MONO.nose + (load?.kind === 'astronaut' ? MONO.held : 0)
    const front = {
      x: body.at.x + Math.sin(body.heading) * nose,
      z: body.at.z + Math.cos(body.heading) * nose,
    }
    const gap = Math.max(0, Math.hypot(hit.x - front.x, hit.z - front.z) - hit.r)
    const what =
      hit.label === 'astronaut'
        ? 'an astronaut'
        : `${hit.label === 'unusual rock' ? 'the' : 'a'} ${hit.label}`
    return `stopped ${round(gap, 1)} m before ${what} at ${where(hit)}`
  }
  const hazard = (gait: 'walk' | 'roll', remaining: number, except: string[] = []) =>
    monolithAhead(body.at, body.heading, around(except), gait, remaining, load?.kind === 'astronaut')

  /** A way on the base map to `to`, or as near it as can be reached, keeping the gait's clearance. */
  const plan = (to: Point, gait: 'walk' | 'roll', except: string[] = []) => {
    const clearance = MONO.clearance[gait]
    const things: Circle[] = around(except).map((t) => ({
      x: t.x,
      z: t.z,
      r: t.r + (t.label === 'astronaut' ? 0.3 : 0),
    }))
    const keepouts = things.map((t) => ({ ...t, r: t.r + clearance }))
    const grid = world.planGrid()
    if (gait === 'roll') {
      for (const [p, what] of [
        [body.at, 'here'],
        [to, where(to)],
      ] as const)
        if (!openAround(grid, things, p, clearance))
          throw new CallError(
            'x_not_open_ground',
            `cannot roll: ${what} is not open ground (within ${clearance} m of buildings, boulders, machines or people); walk instead (gait walk)`,
          )
      const way = planNear(grid, body.at, to, keepouts, clearance, 0)
      if (!way)
        throw new CallError(
          'x_not_open_ground',
          `cannot roll: no way from ${where()} to ${where(to)} keeps ${clearance} m from buildings, boulders, machines and people; walk instead (gait walk)`,
        )
      return way
    }
    const way = planNear(grid, body.at, to, keepouts, clearance)
    if (!way)
      throw new CallError('x_no_way', `no way on the base map from ${where()} to within 4 m of ${where(to)}`)
    return way
  }

  const fold = async (call: Call) => {
    model.want.wheel = false
    while (model.unfolded > 0) await wait(call, 50)
  }
  /** Walks or rolls `path` leg by leg; `blocked` may end it early, as Body.go does. */
  const travel = async (
    call: Call,
    path: Point[],
    gait: 'walk' | 'roll',
    blocked: (remaining: number) => string | undefined,
  ) => {
    const g = GAIT[gait]
    let done = 0
    const route = { points: path, next: 0 }
    routes.set(dev.id, route)
    try {
      for (const p of path) {
        route.next = done
        await body.go(call, p, { speed: g.speed, accel: g.accel, turnRate: g.turn, arrive: 0.2, blocked })
        done += 1
        call.progress({
          done,
          total: path.length,
          text: `${gait === 'roll' ? 'rolling' : 'walking'}: leg ${done} of ${path.length}`,
        })
      }
    } finally {
      if (routes.get(dev.id) === route) routes.delete(dev.id)
    }
  }
  /** Runs a motion tool: it is the current call, and its state says it moves while it does. */
  const motion = async <T>(
    call: Call,
    gait: 'walk' | 'roll' | undefined,
    run: () => Promise<T>,
  ): Promise<T> => {
    current = call
    try {
      if (model.unfolded > 0 && gait !== 'roll') await fold(call)
      moving = gait
      report()
      return await run()
    } finally {
      if (current === call) current = undefined
      moving = undefined
      model.want.wheel = false
      body.speed = 0
      report()
    }
  }

  dev.after = () => ({ pose: body.pose(), odometry: body.odometry() })
  // Manual walking: the latest axes, applied frame by frame; the deadman zeroes them (MAN-4).
  const manual = { vx: 0, wz: 0 }
  dev.onManual = (axes) => {
    manual.vx = axes.vx ?? 0
    manual.wz = axes.wz ?? 0
    moving = manual.vx !== 0 || manual.wz !== 0 ? 'walk' : undefined
    if (moving) model.want.wheel = false
    report()
  }
  dev.onStop = () => {
    body.speed = 0
    manual.vx = 0
    manual.wz = 0
    model.want.wheel = false
  }
  let manualAt = frameTime()
  let steering = false
  everyFrame(() => {
    const now = frameTime()
    const dt = Math.min(0.1, (now - manualAt) / 1000)
    manualAt = now
    if ((manual.vx === 0 && manual.wz === 0) || model.unfolded > 0) {
      if (steering) body.speed = body.turn = 0
      steering = false
      return
    }
    steering = true
    // The safety stop holds under manual control too: no walking forward into a boulder or a person.
    const vx = manual.vx > 0 && hazard('walk', Number.POSITIVE_INFINITY) ? 0 : manual.vx
    body.object.rotation.y += ((manual.wz * Math.PI) / 180) * dt
    body.object.position.x += Math.sin(body.heading) * vx * dt
    body.object.position.z += Math.cos(body.heading) * vx * dt
    body.object.position.y = world.ground(body.at)
    body.odometer += Math.abs(vx * dt)
    body.speed = vx
    body.turn = (manual.wz * Math.PI) / 180
  }, log)

  /** The way it stops, as an estop result. */
  const estop = (e: unknown): never => {
    if (e instanceof Blocked)
      throw new CallError('estop', `${e.message}; now at ${where()}`, { data: { pose: body.pose() } })
    throw e
  }
  /**
   * Plans a way to `to` and travels it. A person stepping into the way is waited for and walked
   * round, up to three times; anything else in the way ends it as estop. `except` is left out of
   * planning and the safety stop, `pass` only out of the safety stop. Returns the last way.
   */
  const journey = async (
    call: Call,
    to: Point,
    gait: 'walk' | 'roll',
    except: string[] = [],
    pass: string[] = [],
  ) => {
    for (let tries = 0; ; tries++) {
      const way = plan(to, gait, except)
      let hit: Thing | undefined
      try {
        await travel(call, way.path, gait, (remaining) => {
          hit = hazard(gait, remaining, [...except, ...pass])
          return hit && describe(hit)
        })
        return way
      } catch (e) {
        if (!(e instanceof Blocked) || hit?.label !== 'astronaut' || tries >= 3) estop(e)
        call.progress({ text: 'waiting for the astronaut to pass' })
        await wait(call, 3000)
      }
    }
  }

  dev.tool(
    {
      name: 'go_to',
      description: `Go to a place on the base map, or to a point (x east, y north, metres), finding its way around buildings, boulders and machines; to as near as it can get when the point itself is blocked. gait walk (${GAIT.walk.speed} m/s) goes anywhere; roll (${GAIT.roll.speed} m/s) only over open ground, ${MONO.clearance.roll} m clear of everything, and not while carrying. Stops by itself before a boulder, a machine or a person in its way.`,
      timeout: 300,
      params: {
        place: PLACE_PARAM,
        x: {
          type: 'number',
          minimum: MAP_AREA.x0,
          maximum: MAP_AREA.x1,
          description: 'metres east of the habitat',
        },
        y: {
          type: 'number',
          minimum: MAP_AREA.y0,
          maximum: MAP_AREA.y1,
          description: 'metres north of the habitat',
        },
        gait: {
          type: 'string',
          enum: ['walk', 'roll'],
          default: 'walk',
          description: 'walk, or roll as a wheel',
        },
      },
      uses: ['slabs'],
      motion: true,
      pausable: true,
      ui: { label: 'Go to' },
    },
    (call, { gait, ...args }) =>
      motion(call, gait, async () => {
        const { x, y } = pointOf(args)
        if (gait === 'roll' && load)
          throw new CallError('x_carrying', `it cannot roll while it carries ${load.id}; walk (gait walk)`)
        const to = fromMap(x, y)
        // Planned once up front, so a way that cannot be found fails before it unfolds.
        plan(to, gait)
        const start = performance.now()
        const odometer = body.odometer
        if (gait === 'roll') {
          model.want.wheel = true
          call.progress({ text: 'unfolding into a wheel' })
          await wait(call, UNFOLD_S * 1000 + 100)
        }
        const way = await journey(call, to, gait)
        if (gait === 'roll') {
          call.progress({ text: 'folding up' })
          await fold(call)
        }
        const missed = Math.hypot(way.end.x - to.x, way.end.z - to.z)
        const distance = round(body.odometer - odometer, 1)
        const seconds = Math.round((performance.now() - start) / 1000)
        const door = LAYOUT.airlockDoor
        const atDoor = Math.hypot(body.at.x - door[0], body.at.z - door[1]) <= AT_AIRLOCK
        const end = atDoor
          ? ", at airlock-01's outer door"
          : missed > 0.3
            ? `, ${round(missed, 1)} m short of ${where(to)}, which is blocked`
            : ''
        return {
          detail: `${gait === 'roll' ? 'rolled' : 'walked'} ${distance} m in ${seconds} s to ${where()}${end}`,
          data: { gait, distance_m: distance, seconds, legs: way.path.length, route: way.path.map(toMap) },
        }
      }),
  )

  dev.tool(
    {
      name: 'follow',
      description: `Walk to a person or a moving device and stay with it: until beside it, or for \`seconds\` if given. It finds its way around buildings and boulders and comes within ${MONO.personGap} m of a person, ${MACHINE_GAP} m of a machine.`,
      timeout: 300,
      params: {
        target: { type: 'string', enum: FOLLOWABLE, description: 'the device or person (suit-01) to follow' },
        seconds: {
          type: 'number',
          minimum: 1,
          maximum: 240,
          description: 'keep following this long; omitted, it stops once beside the target',
        },
      },
      required: ['target'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Follow' },
    },
    (call, { target, seconds }) =>
      motion(call, 'walk', async () => {
        if (target === 'suit-01' && load?.id === 'suit-01')
          throw new CallError('x_carrying', 'it is carrying suit-01 already')
        const find = () => world.things().find((t) => t.id === target)
        if (!find())
          throw new CallError(
            'x_not_here',
            `${target} is not outside: the astronaut is ${world.astronaut === 'inside' ? 'in the habitat' : 'in the airlock'}`,
          )
        const person = target === 'suit-01'
        const start = performance.now()
        const odometer = body.odometer
        const beside = (t: Thing) =>
          Math.hypot(t.x - body.at.x, t.z - body.at.z) - t.r - MONO.nose <=
          (person ? MONO.personGap + 0.3 : MACHINE_GAP)
        const until = seconds === undefined ? undefined : start + seconds * 1000
        for (;;) {
          const t = find()
          if (!t) throw new CallError('x_not_here', `${target} went where it cannot follow`)
          const near = beside(t)
          if (near && (until === undefined || performance.now() >= until)) break
          if (until !== undefined && performance.now() >= until) break
          if (near) {
            // Beside it: face it and wait for it to move on.
            body.speed = 0
            await turnTo(
              call,
              model.group,
              {
                y:
                  body.heading +
                  Math.atan2(
                    Math.sin(headingTo(body.at, t) - body.heading),
                    Math.cos(headingTo(body.at, t) - body.heading),
                  ),
              },
              300,
            )
            await wait(call, 300)
            continue
          }
          const way = plan({ x: t.x, z: t.z }, 'walk', [target as string])
          const before = body.odometer
          try {
            await travel(call, way.path, 'walk', (remaining) => {
              const hit = hazard('walk', remaining)
              if (hit?.id === target) return ARRIVED
              if (hit) return describe(hit)
              // The target moved on: plan again toward where it is now.
              const now = find()
              return now && Math.hypot(now.x - t.x, now.z - t.z) > REPLAN_M ? REPLAN : undefined
            })
          } catch (e) {
            if (!(e instanceof Blocked) || (e.message !== ARRIVED && e.message !== REPLAN)) estop(e)
            continue
          }
          if (body.odometer - before < 0.05 && !beside(find() ?? t))
            throw new CallError('x_no_way', `cannot get nearer to ${target} at ${where(t)} than ${where()}`)
        }
        const t = find() as Thing
        const gap = round(Math.max(0, Math.hypot(t.x - body.at.x, t.z - body.at.z) - t.r - MONO.nose), 1)
        const distance = round(body.odometer - odometer, 1)
        return {
          detail: `${seconds === undefined ? 'reached' : `followed for ${seconds} s and is beside`} ${target} at ${where(t)}, ${gap} m from it; walked ${distance} m, now at ${where()}`,
          data: { target, gap_m: gap, distance_m: distance, target_at: toMap(t) },
        }
      }),
  )

  dev.tool(
    {
      name: 'carry',
      description: `Pick up the astronaut (suit-01), a sample of a rock (such as rock-1) or the crate of harvest set down on the ground (crate) within ${REACH} m of its front, and hold it. Carrying, it walks but cannot roll; put_down sets the load down, into the airlock's chamber or at the lab.`,
      timeout: 20,
      params: {
        target: {
          type: 'string',
          maxLength: 40,
          description:
            'the astronaut (suit-01), an unusual rock by its id from a survey (rock-1, …), or crate',
        },
      },
      required: ['target'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Carry' },
    },
    (call, { target }) =>
      motion(call, undefined, async () => {
        if (load) throw new CallError('x_hands_full', `it already carries ${load.id}; put_down first`)
        if (target === 'crate') {
          if (world.crate.at !== 'ground')
            throw new CallError(
              'x_no_crate',
              world.crate.at === 'none'
                ? 'there is no crate out here'
                : 'the crate is in the airlock chamber',
            )
          const c = crate.group.position
          const gap = Math.hypot(c.x - body.at.x, c.z - body.at.z) - 0.3 - MONO.nose
          if (gap > REACH)
            throw new CallError(
              'unreachable',
              `the crate is ${round(gap, 1)} m from its front, at ${where(c)}; go_to it first, to within ${REACH} m`,
            )
          const face = headingTo(body.at, c)
          await turnTo(
            call,
            model.group,
            { y: body.heading + Math.atan2(Math.sin(face - body.heading), Math.cos(face - body.heading)) },
            600,
          )
          await wait(call, LIFT_S * 1000)
          world.crate.at = 'held'
          showCrate()
          load = { kind: 'crate', id: 'crate' }
          report()
          return {
            detail: `picked up the crate (${world.crate.kg} kg of ${world.crate.crop}es) at ${where()}; holding it. To take it in, in this order: ${INTO_AIRLOCK}.`,
            data: { carrying: 'crate', ...world.crate },
          }
        }
        const person = target === 'suit-01'
        const t = person
          ? world.things().find((s) => s.id === 'suit-01')
          : OBSTACLES.find((o) => o.id === target && o.label === 'unusual rock')
        if (!t && !person) throw new CallError('x_no_such_rock', `there is no unusual rock ${target}`)
        if (!t)
          throw new CallError(
            'x_not_here',
            `the astronaut is ${world.astronaut === 'inside' ? 'in the habitat' : 'in the airlock'}`,
          )
        const gap = Math.hypot(t.x - body.at.x, t.z - body.at.z) - t.r - MONO.nose
        if (gap > REACH)
          throw new CallError(
            'unreachable',
            `${target} is ${round(gap, 1)} m from its front, at ${where(t)}; ${person ? 'follow suit-01' : 'go_to it'} first, to within ${REACH} m`,
          )
        // Face the load, then lift it.
        const face = headingTo(body.at, t)
        await turnTo(
          call,
          model.group,
          { y: body.heading + Math.atan2(Math.sin(face - body.heading), Math.cos(face - body.heading)) },
          600,
        )
        if (person) {
          world.astronaut = 'carried'
          model.want.hold = 'astronaut'
          const from = astronaut.position.clone()
          const steps = LIFT_S * FRAME_HZ
          for (let i = 1; i <= steps; i++) {
            hold()
            const held = astronaut.position.clone()
            astronaut.position.lerpVectors(from, held, i / steps)
            await frame(call)
          }
          load = { kind: 'astronaut', id: 'suit-01' }
          report()
          const said = speak(flavour(voice(LINES.pickup)))
          return {
            detail: `picked up the astronaut (suit-01) at ${where()}; holding them. To bring them inside, in this order: ${INTO_AIRLOCK}. Said: "${said}"`,
            data: { carrying: 'astronaut', target, said },
          }
        }
        call.progress({ text: `breaking off a sample of ${target}` })
        await wait(call, LIFT_S * 1000)
        const rock = OBSTACLES.find((o) => o.id === target)
        rock?.object.scale.multiplyScalar(0.85)
        model.want.hold = 'sample'
        load = { kind: 'sample', id: target as string }
        report()
        return {
          detail: `picked up a sample of ${target} at ${where(t)}; holding it for the lab`,
          data: { carrying: 'sample', target },
        }
      }),
  )

  dev.tool(
    {
      name: 'put_down',
      description: `Set down what it carries in front of it. At the airlock (within ${AT_AIRLOCK} m of its outer door, which must be open) it sets the astronaut or a crate into the chamber; a sample goes to the lab, within ${AT_LAB} m of it.`,
      timeout: 20,
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Put down' },
    },
    (call) =>
      motion(call, undefined, async () => {
        if (!load) throw new CallError('x_empty', 'it carries nothing')
        const v = towed()
        if (v) {
          const id = load.id
          const isRover = load.kind === 'rover'
          const [hx, hz] = isRover ? LAYOUT.dock : LAYOUT.hopperPad
          const home = { x: hx, z: hz + (isRover ? 0.4 : 0) }
          const there = Math.hypot(v.position.x - home.x, v.position.z - home.z) <= TOW.home
          // Standing where the vehicle goes, it first steps aside onto open ground beside it.
          if (there && Math.hypot(body.at.x - home.x, body.at.z - home.z) < 3.5) {
            const keepouts = around().map((t) => ({ x: t.x, z: t.z, r: t.r + MONO.clearance.walk }))
            const aside = Array.from({ length: 16 }, (_, k) => ({
              x: home.x + Math.sin((k / 16) * Math.PI * 2) * 4.5,
              z: home.z + Math.cos((k / 16) * Math.PI * 2) * 4.5,
            }))
              .filter((c) => openAround(world.planGrid(), keepouts, c, MONO.clearance.walk))
              .sort(
                (a, b) =>
                  Math.hypot(a.x - body.at.x, a.z - body.at.z) - Math.hypot(b.x - body.at.x, b.z - body.at.z),
              )[0]
            if (aside)
              await travel(call, plan(aside, 'walk').path, 'walk', (remaining) => {
                const hit = hazard('walk', remaining)
                return hit && describe(hit)
              }).catch(estop)
          }
          call.progress({ text: `unhitching ${id}` })
          // Near home, the cable winches it into place: the rover nose first into the dock.
          const from = v.position.clone()
          const yaw = v.rotation.y
          const turn = isRover ? Math.atan2(Math.sin(Math.PI - yaw), Math.cos(Math.PI - yaw)) : 0
          const steps = (there ? 3 : LIFT_S) * FRAME_HZ
          const to = new THREE.Vector3(home.x, world.ground(home) + lift, home.z)
          const winch = load
          load = undefined
          for (let i = 1; i <= steps; i++) {
            if (there) {
              const k = i / steps
              v.position.lerpVectors(from, to, k * k * (3 - 2 * k))
              v.rotation.y = yaw + turn * k
            }
            await frame(call)
          }
          cable.visible = false
          world.towed = undefined
          if (there && isRover) world.rover.docked = true
          world.roverChanged?.()
          report()
          const said = there ? speak(flavour(voice(LINES.home))) : undefined
          return {
            detail: there
              ? isRover
                ? `towed rover-01 into the dock; it is plugged in and charging${said ? `. Said: "${said}"` : ''}`
                : `set hopper-01 down on the hopper pad; it refuels there${said ? `. Said: "${said}"` : ''}`
              : `unhitched ${id} at ${where(v.position)}; ${isRover ? 'only the dock charges it' : 'only the hopper pad refuels it'}`,
            data: { put: winch.id, at: there ? (isRover ? 'dock' : 'hopper pad') : toMap(v.position), said },
          }
        }
        const near = (p: readonly [number, number], r: number) =>
          Math.hypot(body.at.x - p[0], body.at.z - p[1]) <= r
        if (load.kind === 'sample') {
          if (!near(LAYOUT.lab, AT_LAB))
            throw new CallError(
              'x_not_at_lab',
              `samples go to the lab: go_to the lab (place lab, ${where({ x: LAYOUT.lab[0], z: LAYOUT.lab[1] })}) first`,
            )
          await wait(call, LIFT_S * 1000)
          const sample = load.id
          model.want.hold = 'none'
          load = undefined
          world.labReceive?.(sample)
          return {
            detail: `handed the sample of ${sample} to the lab; it waits there for analysis (lab-01 analyze)`,
            data: { put: sample, at: 'lab' },
          }
        }
        const atAirlock = near(LAYOUT.airlockDoor, AT_AIRLOCK)
        if (atAirlock && world.airlock.outer !== 'open')
          throw new CallError(
            'x_door_closed',
            "airlock-01's outer door is closed: cycle_out and open_outer there first, then put_down again",
          )
        const h = body.heading
        const ahead = {
          x: body.at.x + Math.sin(h) * (HELD.ahead + 0.1),
          z: body.at.z + Math.cos(h) * (HELD.ahead + 0.1),
        }
        if (load.kind === 'crate') {
          if (atAirlock && world.astronaut === 'chamber')
            throw new CallError('x_chamber_full', 'the astronaut is in the airlock chamber: one at a time')
          const spot = atAirlock ? CHAMBER : ahead
          await wait(call, LIFT_S * 1000)
          crate.group.position.set(spot.x, world.ground(spot), spot.z)
          crate.group.rotation.y = h
          world.crate.at = atAirlock ? 'chamber' : 'ground'
          load = undefined
          showCrate()
          world.airlockChanged?.()
          report()
          const what = `the crate (${world.crate.kg} kg of ${world.crate.crop}es)`
          return {
            detail: atAirlock
              ? `set ${what} into the airlock chamber; airlock-01 is occupied: close_outer, then cycle_in takes it into the habitat's pantry`
              : `set ${what} down at ${where(spot)}; carry crate picks it up again`,
            data: {
              put: 'crate',
              place: atAirlock ? 'airlock' : toMap(spot),
              crop: world.crate.crop,
              kg: world.crate.kg,
            },
          }
        }
        // Set the astronaut down: into the chamber, or on the ground in front.
        const from = astronaut.position.clone()
        const spot = atAirlock ? CHAMBER : ahead
        const to = new THREE.Vector3(spot.x, world.ground(spot), spot.z)
        world.astronaut = atAirlock ? 'chamber' : 'standing'
        load = undefined
        const steps = LIFT_S * FRAME_HZ
        for (let i = 1; i <= steps; i++) {
          astronaut.position.lerpVectors(from, to, i / steps)
          await frame(call)
        }
        astronaut.rotation.set(0, atAirlock ? Math.PI : h, 0)
        model.want.hold = 'none'
        world.airlockChanged?.()
        const said = speak(flavour(voice(atAirlock ? LINES.chamber : LINES.standing)))
        return {
          detail: atAirlock
            ? `set the astronaut (suit-01) into the airlock chamber; airlock-01 is occupied: close_outer, then cycle_in brings them into the habitat. Said: "${said}"`
            : `set the astronaut (suit-01) down at ${where(spot)}; they wait there. Said: "${said}"`,
          data: { put: 'suit-01', at: atAirlock ? 'airlock' : toMap(spot), said },
        }
      }),
  )

  dev.tool(
    {
      name: 'tow',
      description: `Tow a vehicle that cannot move by itself on a cable: the rover (rover-01, such as with a flat battery) or the hopper (hopper-01, landed away from its pad). It walks to the vehicle's front from wherever it is, hitches it and from then on drags it behind wherever it walks (go_to, walking; it cannot roll while towing). put_down unhitches it: within ${TOW.home} m of the dock the rover is winched in, plugged in and charges; within ${TOW.home} m of the hopper pad the hopper is set on it and refuels.`,
      timeout: 300,
      params: {
        target: { type: 'string', enum: ['rover-01', 'hopper-01'], description: 'the vehicle to tow' },
      },
      required: ['target'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Tow' },
    },
    (call, { target }) =>
      motion(call, 'walk', async () => {
        if (load) throw new CallError('x_hands_full', `it already carries ${load.id}; put_down first`)
        const id = target as 'rover-01' | 'hopper-01'
        const v = id === 'rover-01' ? rover : hopper
        const t = world.things().find((x) => x.id === id) as Thing
        if (id === 'hopper-01' && v.position.y - world.ground(t) > 0.4)
          throw new CallError('x_flying', 'hopper-01 is in the air; it can be towed once it has landed')
        if (id === 'rover-01' && world.rover.leg)
          throw new CallError('x_moving', 'rover-01 is driving; it can be towed once it stands still')
        // To the vehicle's front (for the hopper, the side towards it), then face away from it.
        const face = id === 'rover-01' ? v.rotation.y : headingTo(t, body.at)
        const hitch = {
          x: t.x + Math.sin(face) * (t.r + TOW.cable),
          z: t.z + Math.cos(face) * (t.r + TOW.cable),
        }
        await journey(call, hitch, 'walk', [id])
        await turnTo(
          call,
          model.group,
          { y: body.heading + Math.atan2(Math.sin(face - body.heading), Math.cos(face - body.heading)) },
          600,
        )
        call.progress({ text: `hitching ${id}` })
        await wait(call, LIFT_S * 1000)
        lift = v.position.y - world.ground(v.position)
        load = { kind: id === 'rover-01' ? 'rover' : 'hopper', id }
        world.towed = id
        if (id === 'rover-01' && world.rover.docked) world.rover.docked = false
        world.roverChanged?.()
        cable.visible = true
        report()
        const said = speak(flavour(voice(LINES.hitched)))
        return {
          detail: `hitched ${id} at ${where(t)}; it trails on the cable wherever it walks: go_to (walking) home, then put_down. Said: "${said}"`,
          data: { towing: id, said },
        }
      }),
  )

  /** The boulder at map point (x, y): the nearest one, when (x, y) is on it or within 2 m of its edge. */
  const boulderAt = (x: number, y: number): Obstacle => {
    const at = fromMap(x, y)
    const rock = OBSTACLES.filter((o) => o.label === 'boulder').sort(
      (a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z),
    )[0]
    if (!rock || Math.hypot(rock.x - at.x, rock.z - at.z) > rock.r + 2)
      throw new CallError('x_no_boulder', `there is no boulder at ${where(at)}`)
    return rock
  }
  const boulderParams = {
    x: {
      type: 'number',
      minimum: MAP_AREA.x0,
      maximum: MAP_AREA.x1,
      description: "the boulder's x, metres east",
    },
    y: {
      type: 'number',
      minimum: MAP_AREA.y0,
      maximum: MAP_AREA.y1,
      description: "the boulder's y, metres north",
    },
  }

  dev.tool(
    {
      name: 'push_boulder',
      description: `Push a boulder up to ${PUSH.across} m across off the way it blocks, ${PUSH.metres} m to the side: it walks round to the boulder's far side and rolls it. The boulder at (x, y), such as the one a rover stopped before; it must be within 6 m. Bigger boulders: break_boulder.`,
      timeout: 120,
      params: boulderParams,
      required: ['x', 'y'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Push boulder' },
    },
    (call, { x, y }) =>
      motion(call, 'walk', async () => {
        if (load) throw new CallError('x_hands_full', `it carries ${load.id}; put_down first`)
        const rock = boulderAt(x as number, y as number)
        if (rock.r * 2 > PUSH.across)
          throw new CallError(
            'x_too_big',
            `${rock.id} is ${round(rock.r * 2, 1)} m across, too big to push; break_boulder breaks it`,
          )
        const gap = Math.hypot(rock.x - body.at.x, rock.z - body.at.z) - rock.r
        if (gap > 6)
          throw new CallError(
            'unreachable',
            `${rock.id} is ${round(gap, 1)} m away, at ${where(rock)}; go_to it first`,
          )
        // The way it blocks runs from the rover, if it is near, or from the dock; push square to it,
        // to the side with more room.
        const rover = world.things().find((t) => t.id === 'rover-01')
        const [dx0, dz0] = LAYOUT.dock
        const from = rover && Math.hypot(rover.x - rock.x, rover.z - rock.z) < 30 ? rover : { x: dx0, z: dz0 }
        const way = Math.atan2(rock.x - from.x, rock.z - from.z)
        const others = around([rock.id])
        const room = (side: number) => {
          const to = {
            x: rock.x + Math.sin(way + side) * PUSH.metres,
            z: rock.z + Math.cos(way + side) * PUSH.metres,
          }
          const open = openAround(world.planGrid(), others, to, rock.r)
          return (open ? 100 : 0) + Math.min(...others.map((o) => Math.hypot(o.x - to.x, o.z - to.z) - o.r))
        }
        const side = room(Math.PI / 2) >= room(-Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2
        const push = way + side
        const dir = { x: Math.sin(push), z: Math.cos(push) }
        // Round to the far side, then face the boulder the way it will roll.
        const behind = {
          x: rock.x - dir.x * (rock.r + MONO.nose + 0.2),
          z: rock.z - dir.z * (rock.r + MONO.nose + 0.2),
        }
        const route = plan(behind, 'walk', [rock.id])
        await travel(call, route.path, 'walk', (remaining) => {
          const hit = hazard('walk', remaining, [rock.id])
          return hit && describe(hit)
        }).catch(estop)
        await turnTo(
          call,
          model.group,
          { y: body.heading + Math.atan2(Math.sin(push - body.heading), Math.cos(push - body.heading)) },
          600,
        )
        // Roll it: the boulder turns about the axis square to the push, and Monolith walks behind it.
        const was = { x: rock.x, z: rock.z }
        const lift = rock.object.position.y - world.ground(rock)
        const axis = new THREE.Vector3(dir.z, 0, -dir.x)
        const steps = Math.round(PUSH.seconds * FRAME_HZ)
        let moved = 0
        for (let i = 1; i <= steps; i++) {
          await frame(call)
          const k = i / steps
          const to = PUSH.metres * k * k * (3 - 2 * k)
          const step = to - moved
          moved = to
          rock.x += dir.x * step
          rock.z += dir.z * step
          rock.object.position.set(rock.x, world.ground(rock) + lift, rock.z)
          rock.object.rotateOnWorldAxis(axis, step / rock.r)
          body.object.position.x += dir.x * step
          body.object.position.z += dir.z * step
          body.object.position.y = world.ground(body.at)
          body.speed = step * FRAME_HZ
          if (i % FRAME_HZ === 0) call.progress({ done: i, total: steps, text: `pushing ${rock.id}` })
        }
        body.speed = 0
        const said = speak(flavour(voice(LINES.pushed)))
        return {
          detail: `pushed ${rock.id} ${PUSH.metres} m aside, from ${where(was)} to ${where(rock)}; the way past ${where(was)} is clear. Said: "${said}"`,
          data: { boulder: rock.id, from: toMap(was), to: toMap(rock), said },
        }
      }),
  )

  // How far the boulder's nearest face is along the way it looks, from the height its slabs strike
  // down to the ground; its round outline (r) is only the widest it is.
  const ray = new THREE.Raycaster()
  const faceOf = (rock: Obstacle): number => {
    const d = Math.hypot(rock.x - body.at.x, rock.z - body.at.z)
    const toward = new THREE.Vector3(rock.x - body.at.x, 0, rock.z - body.at.z).normalize()
    rock.object.updateMatrixWorld(true)
    ray.far = d
    const hits = [0.8, 0.4, 0.15].flatMap((up) => {
      ray.set(new THREE.Vector3(body.at.x, world.ground(body.at) + up, body.at.z), toward)
      const at = ray.intersectObject(rock.object, true)[0]
      return at ? [at.distance] : []
    })
    return hits.length > 0 ? Math.min(...hits) : Math.max(0, d - rock.r)
  }
  dev.tool(
    {
      name: 'break_boulder',
      description: `Break a boulder of any size into small rubble that blocks nothing: it walks to the boulder at (x, y) from wherever it is and strikes it with its slabs until it shatters. For boulders bigger than push_boulder moves (over ${PUSH.across} m across), such as those a survey reports or a rover stopped before. The boulder is gone for good: rover routes, safety stops, surveys and the base map no longer have it. About 10 s once there; the rubble flies away from people and machines.`,
      timeout: 300,
      params: boulderParams,
      required: ['x', 'y'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Break boulder' },
    },
    (call, { x, y }) =>
      motion(call, 'walk', async () => {
        if (load) throw new CallError('x_hands_full', `it carries ${load.id}; put_down first`)
        const rock = boulderAt(x as number, y as number)
        const across = round(rock.r * 2, 1)
        // To open ground beside the boulder, on the side nearest it, unless it stands there already.
        const ring = rock.r + MONO.clearance.walk + 0.3
        if (Math.hypot(rock.x - body.at.x, rock.z - body.at.z) > ring + 0.5) {
          const others = around([rock.id])
          const stand = Array.from({ length: 16 }, (_, k) => ({
            x: rock.x + Math.sin((k / 16) * Math.PI * 2) * ring,
            z: rock.z + Math.cos((k / 16) * Math.PI * 2) * ring,
          }))
            .filter((p) => openAround(world.planGrid(), others, p, MONO.clearance.walk))
            .sort(
              (a, b) =>
                Math.hypot(a.x - body.at.x, a.z - body.at.z) - Math.hypot(b.x - body.at.x, b.z - body.at.z),
            )[0]
          if (!stand)
            throw new CallError('x_no_way', `no open ground beside ${rock.id} at ${where(rock)} to stand on`)
          await journey(call, stand, 'walk', [], [rock.id])
        }
        // Face it and step up to it, its face just within reach of the slabs.
        const face = headingTo(body.at, rock)
        await turnTo(
          call,
          model.group,
          { y: body.heading + Math.atan2(Math.sin(face - body.heading), Math.cos(face - body.heading)) },
          600,
        )
        const step = faceOf(rock) - BREAK.reach
        if (step > 0.05)
          await body
            .go(
              call,
              { x: body.at.x + Math.sin(face) * step, z: body.at.z + Math.cos(face) * step },
              {
                speed: 1,
                accel: GAIT.walk.accel,
                turnRate: GAIT.walk.turn,
                arrive: 0.05,
                blocked: (remaining) => {
                  const hit = hazard('walk', remaining, [rock.id])
                  return hit && describe(hit)
                },
              },
            )
            .catch(estop)
        // Blow after blow, a puff of dust and a shudder through the boulder each; the last shatters it.
        const blows = Math.round(THREE.MathUtils.clamp(2 + rock.r * 0.9, BREAK.fewest, BREAK.most))
        const frames = Math.round(BREAK.blow * FRAME_HZ)
        const lands = Math.round(frames * STRIKE.lands)
        const still = rock.object.position.clone()
        const hit = {
          x: body.at.x + Math.sin(face) * BREAK.reach,
          z: body.at.z + Math.cos(face) * BREAK.reach,
        }
        try {
          for (let b = 1; b <= blows; b++) {
            call.progress({ done: b - 1, total: blows, text: `striking ${rock.id}: blow ${b} of ${blows}` })
            for (let i = 1; i <= frames; i++) {
              await frame(call)
              model.want.strike = i / frames
              if (i === lands && b < blows) world.effects?.puff(hit, 0.8, 0.8 + b * 0.25)
              if (i === lands && b === blows) {
                call.progress({ done: blows, total: blows, text: `${rock.id} shatters` })
                const clear = world
                  .things()
                  .filter(
                    (t) =>
                      ['astronaut', 'rover', 'hopper', 'robot'].includes(t.label) &&
                      Math.hypot(t.x - rock.x, t.z - rock.z) < rock.r + 8,
                  )
                  .map((t) => headingTo(rock, t))
                world.effects?.shatter(rock, rock.r, clear)
                world.removeRock(rock)
              }
              const shudder = i - lands
              if (shudder >= 0 && shudder < 12 && b < blows) {
                const k = 0.05 * (1 - shudder / 12)
                rock.object.position.set(
                  still.x + (Math.random() - 0.5) * k,
                  still.y,
                  still.z + (Math.random() - 0.5) * k,
                )
              } else rock.object.position.copy(still)
            }
          }
        } finally {
          model.want.strike = 0
          rock.object.position.copy(still)
        }
        await wait(call, BREAK.settle * 1000)
        const said = speak(flavour(voice(LINES.broke)))
        const near = OBSTACLES.filter(
          (o) =>
            o !== rock && o.label === 'boulder' && Math.hypot(o.x - rock.x, o.z - rock.z) < NEAR_BOULDER_M,
        )
        const left = near.length
          ? ` Still standing within ${NEAR_BOULDER_M} m: ${near.map((o) => `${o.id} at ${where(o)}, ${round(o.r * 2, 1)} m across`).join('; ')}; break_boulder each one that is in the way or that the person asked to clear.`
          : ''
        return {
          detail: `broke ${rock.id}, a boulder ${across} m across at ${where(rock)}, into rubble that blocks nothing; the way past ${where(rock)} is clear, and rover routes, safety stops and surveys no longer have it. Now at ${where()}.${left} Said: "${said}"`,
          data: { boulder: rock.id, at: toMap(rock), size_m: across, blows, said },
        }
      }),
  )

  // A close-up is taken from the lens, aimed down at the rock; a flash shows it happen.
  const closeUp = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 2000)
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.9, depthWrite: false }),
  )
  flash.position.set(0, 1.36, 0.3)
  flash.visible = false
  model.group.add(flash)
  dev.tool(
    {
      name: 'take_photo',
      description: `Take a full-size photo with its own camera and keep it; comms-01 send can take it home by its id. With target, a close-up of an unusual rock (rock-1, or a meteorite from a survey) within ${CLOSE_UP} m of its front: it turns to the rock and aims at it, and the result says what the close-up shows. Without target, what is ahead.`,
      timeout: 20,
      params: {
        target: {
          type: 'string',
          maxLength: 40,
          description: 'an unusual rock by its id from a survey (rock-1, …)',
        },
      },
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Take photo' },
    },
    (call, { target }) =>
      motion(call, undefined, async () => {
        const rock =
          target === undefined
            ? undefined
            : OBSTACLES.find((o) => o.id === target && o.label === 'unusual rock')
        if (target !== undefined && !rock)
          throw new CallError('x_no_such_rock', `there is no unusual rock ${target}`)
        let camera = front
        let gap = 0
        if (rock) {
          gap = Math.hypot(rock.x - body.at.x, rock.z - body.at.z) - rock.r - MONO.nose
          if (gap > CLOSE_UP)
            throw new CallError(
              'unreachable',
              `${rock.id} is ${round(gap, 1)} m from its front, at ${where(rock)}; go_to it first, to within ${CLOSE_UP} m`,
            )
          const face = headingTo(body.at, rock)
          await turnTo(
            call,
            model.group,
            { y: body.heading + Math.atan2(Math.sin(face - body.heading), Math.cos(face - body.heading)) },
            600,
          )
          model.group.updateMatrixWorld(true)
          front.getWorldPosition(closeUp.position)
          closeUp.lookAt(rock.x, world.ground(rock) + 0.2, rock.z)
          closeUp.updateMatrixWorld()
          camera = closeUp
        }
        call.progress({ text: 'taking the photo' })
        await wait(call, 400)
        flash.visible = true
        const id = `photo-${world.photos.size + 1}`
        const { elevation, azimuth } = sunAt(world.clock.hour())
        world.photos.set(id, {
          id,
          by: dev.id,
          jpeg: await world.snapshot(camera, 1280, 720),
          at: world.clock.label(),
          sun: { inFrame: false, elevation, azimuth },
          ...(rock ? { subject: rock.id } : {}),
        })
        await wait(call, 150)
        flash.visible = false
        if (!rock)
          return {
            detail: `${id} taken at ${world.clock.label()}: what is ahead of it at ${where()}`,
            data: { photo: id },
          }
        const said = speak(flavour(voice(LINES.photo)))
        const looks = rock.id === 'rock-1' ? LOOKS['rock-1'] : LOOKS.meteorite
        return {
          detail: `${id} taken at ${world.clock.label()}: a close-up of ${rock.id} from ${round(Math.max(0, gap), 1)} m, showing ${looks}; comms-01 send can take it home. Said: "${said}"`,
          data: { photo: id, subject: rock.id, said },
        }
      }),
  )

  // The greenhouse: in at the east door, up its ramp, along the aisle between the beds and back out.
  const garden = world.parts.greenhouse
  const doorEdge = LAYOUT.greenhouse[0] + GREENHOUSE.length / 2
  const inGreenhouse = (p: Point) =>
    p.x < doorEdge + 1.6 &&
    p.x > doorEdge - GREENHOUSE.length &&
    Math.abs(p.z - LAYOUT.greenhouse[1]) < GREENHOUSE.radius
  const floor = (p: Point) => {
    const k = Math.min(1, Math.max(0, (p.x - doorEdge) / 1.6))
    return GREENHOUSE.floor + (world.ground(p) - GREENHOUSE.floor) * k
  }
  const slide = async (call: Call, open: boolean) => {
    for (let i = 1; i <= FRAME_HZ; i++) {
      garden.door(open ? i / FRAME_HZ : 1 - i / FRAME_HZ)
      await frame(call)
    }
  }
  /**
   * Walks to the east door from wherever it is, in along the aisle to its west end and back out,
   * slowly over the leg it tends the bed on (west planting, east harvesting); `tend` hears each frame
   * of that leg. Stopped inside, it is put back outside the door.
   */
  const throughGreenhouse = async (call: Call, tending: 'in' | 'out', tend: () => void) => {
    const walk = (to: Point, slow: boolean) =>
      body.go(call, to, {
        speed: slow ? TENDING : GAIT.walk.speed,
        accel: GAIT.walk.accel,
        turnRate: GAIT.walk.turn,
        arrive: 0.15,
        height: floor,
        ...(slow ? { step: tend } : {}),
      })
    await journey(call, AISLE.door, 'walk')
    try {
      await walk({ x: AISLE.door.x - 0.5, z: AISLE.door.z }, false)
      await slide(call, true)
      await walk(AISLE.entry, false)
      await walk(AISLE.west, tending === 'in')
      await walk(AISLE.entry, tending === 'out')
      await walk(AISLE.door, false)
      await slide(call, false)
    } finally {
      if (inGreenhouse(body.at)) {
        model.group.position.set(AISLE.door.x, world.ground(AISLE.door), AISLE.door.z)
        model.group.rotation.y = Math.PI / 2
      }
      garden.door(0)
    }
  }
  const bedParam = { type: 'string', enum: Object.keys(GREENHOUSE.beds), description: 'which greenhouse bed' }
  /** How many of a bed's first `of` plants stand east of `x` (the plants are counted from the east end). */
  const eastOf = (x: number, of = GREENHOUSE.plants) => garden.spots.filter((s, i) => i < of && s > x).length
  dev.tool(
    {
      name: 'plant',
      description: `Plant seed potatoes in an empty greenhouse bed (north or south): it walks to the greenhouse's east door from wherever it is, in along the aisle setting ${GREENHOUSE.plants} seed potatoes into the bed, and back out. greenhouse-01 waters and lights them; they ripen in about two minutes; then harvest.`,
      timeout: 300,
      params: { bed: bedParam },
      required: ['bed'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Plant' },
    },
    (call, { bed }) =>
      motion(call, 'walk', async () => {
        const b = world.beds[bed as BedName]
        if (load) throw new CallError('x_hands_full', `it carries ${load.id}; put_down first`)
        if (b.crop !== 'none') {
          const other = bed === 'north' ? 'south' : 'north'
          const free = world.beds[other].crop === 'none' ? `; the ${other} bed is empty: plant that one` : ''
          throw new CallError(
            'x_bed_taken',
            (b.growth >= 1
              ? `the ${bed} bed has ripe ${b.crop}es in it; harvest it first`
              : `the ${bed} bed has ${b.crop}es growing in it (${Math.round(b.growth * 100)} % grown); harvest it when ripe`) +
              free,
          )
        }
        await throughGreenhouse(call, 'in', () => {
          const n = eastOf(body.at.x + 0.2)
          if (n === b.planted) return
          if (b.crop === 'none') Object.assign(b, { crop: 'potato', growth: 0 })
          b.planted = n
          world.gardenChanged?.()
        })
        const said = speak(flavour(voice(LINES.planted)))
        return {
          detail: `planted ${b.planted} seed potatoes in the ${bed} bed and came back out of the greenhouse, at ${where()}; they grow with soil moisture of 30 % or more and light (greenhouse-01 ${bed} moisture ${Math.round(b.moisture)} %), in about ${Math.ceil((1 - b.growth) * GROW_S)} s of that; harvest once greenhouse-01 ${bed}_stage is ripe. Said: "${said}"`,
          data: { bed, crop: 'potato', planted: b.planted, moisture: Math.round(b.moisture), said },
        }
      }),
  )
  dev.tool(
    {
      name: 'harvest',
      description:
        "Harvest a ripe greenhouse bed (north or south) into a crate: it walks to the greenhouse's east door from wherever it is, takes a crate in, picks the bed along the aisle and comes out holding the full crate. put_down at the airlock's open outer door sets the crate into the chamber, and airlock-01 cycle_in takes it into the habitat's pantry.",
      timeout: 300,
      params: { bed: bedParam },
      required: ['bed'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Harvest' },
    },
    (call, { bed }) =>
      motion(call, 'walk', async () => {
        const b = world.beds[bed as BedName]
        if (load) throw new CallError('x_hands_full', `it carries ${load.id}; put_down first`)
        if (b.crop === 'none')
          throw new CallError('x_bed_empty', `nothing grows in the ${bed} bed; plant it first`)
        if (b.growth < 1)
          throw new CallError(
            'x_not_ripe',
            `the ${bed} bed's ${b.crop}es are ${Math.round(b.growth * 100)} % grown, not ripe yet (greenhouse-01 ${bed}_stage, ${bed}_needs)`,
          )
        const crop = b.crop
        const total = b.planted
        world.crate = { at: 'held', crop, kg: 0 }
        load = { kind: 'crate', id: 'crate' }
        showCrate()
        report()
        await throughGreenhouse(call, 'out', () => {
          const n = eastOf(body.at.x + 0.3, total)
          if (n === b.planted) return
          b.planted = n
          world.crate.kg = Math.round((total - n) * YIELD[crop])
          if (n === 0) Object.assign(b, { crop: 'none', growth: 0 })
          showCrate()
          world.gardenChanged?.()
        })
        const said = speak(flavour(voice(LINES.harvested)))
        return {
          detail: `harvested ${world.crate.kg} kg of ${crop}es from the ${bed} bed into a crate and came back out, at ${where()}, holding it; the bed is empty. To take it in, in this order: ${INTO_AIRLOCK}. Said: "${said}"`,
          data: { bed, crop, kg: world.crate.kg, said },
        }
      }),
  )

  dev.tool(
    {
      name: 'write',
      description: `Write a short text (up to ${WRITE.most} characters: ${WRITABLE}) in big letters in the smooth open sand west of the landing pad (open-sand): it walks there and draws each letter as a furrow with its slabs, letters ${4 * WRITE.scale} m tall. Writing again rubs out what was there. The whole text is best seen from above, such as by hopper-01 take_photo hovering over open-sand.`,
      timeout: 600,
      params: { text: { type: 'string', maxLength: WRITE.most, description: 'what to write' } },
      required: ['text'],
      uses: ['slabs'],
      motion: true,
      ui: { label: 'Write' },
    },
    (call, { text }) =>
      motion(call, 'walk', async () => {
        const t = (text as string).trim().toUpperCase()
        if (!t || [...t].length > WRITE.most)
          throw new CallError('x_cannot_write', `text must be 1 to ${WRITE.most} characters`)
        const odd = [...t].filter((c) => !(c in GLYPHS))
        if (odd.length)
          throw new CallError('x_cannot_write', `it cannot write ${odd.join(' ')}; it writes ${WRITABLE}`)
        if (load) throw new CallError('x_hands_full', `it carries ${load.id}; put_down first`)
        const [cx, cz] = LAYOUT.sand
        const { strokes, width, height } = layout(t, cx, cz, WRITE.scale)
        const start = strokes[0]?.[0]
        if (!start) throw new CallError('x_cannot_write', 'nothing to write')
        await journey(call, start, 'walk')
        world.effects?.unmark()
        const writing = { text: t, x: cx, z: cz, width, height, done: false }
        world.writing = writing
        const go = (to: Point, step?: () => void) =>
          body.go(call, to, {
            speed: WRITE.speed,
            accel: WRITE.accel,
            turnRate: WRITE.turn,
            arrive: 0.1,
            ...(step ? { step } : {}),
          })
        for (const [i, stroke] of strokes.entries()) {
          await go(stroke[0] as Point)
          let last = { ...body.at }
          const pen = () => {
            if (Math.hypot(body.at.x - last.x, body.at.z - last.z) < WRITE.segment) return
            world.effects?.mark(last, body.at)
            last = { ...body.at }
          }
          for (const p of stroke.slice(1)) {
            await go(p, pen)
            world.effects?.mark(last, body.at)
            last = { ...body.at }
          }
          call.progress({
            done: i + 1,
            total: strokes.length,
            text: `writing "${t}": stroke ${i + 1} of ${strokes.length}`,
          })
        }
        writing.done = true
        // Step off the letters to the south, out of the picture.
        await go({ x: body.at.x, z: cz + height / 2 + 3 })
        const said = speak(flavour(voice(LINES.wrote)))
        const centre = toMap({ x: cx, z: cz })
        return {
          detail: `wrote "${t}" in the sand at open-sand, ${round(width, 1)} m wide and ${round(height, 1)} m tall, centred at (${centre.x}, ${centre.y}); it stands just south of it at ${where()}. Seen whole only from above: hopper-01 take_off, fly_to open-sand with alt ${Math.min(30, Math.max(12, Math.ceil(width / 1.6)))}, then take_photo. Said: "${said}"`,
          data: { text: t, width: round(width, 1), height: round(height, 1), centre, said },
        }
      }),
  )

  dev.tool(
    {
      name: 'say',
      description:
        'Say something over the radio; it shows in a bubble over the robot. humor and honesty colour how it says it.',
      timeout: 20,
      params: { text: { type: 'string', maxLength: 200, description: 'what to say' } },
      required: ['text'],
      uses: ['radio'],
      ui: { label: 'Say' },
    },
    async (call, { text }) => {
      const said = speak(flavour(text as string))
      await wait(call, model.speech.until - performance.now())
      return { detail: `said over the radio: "${said}"`, data: { said, humor, honesty } }
    },
  )

  dev.tool(
    {
      name: 'stop',
      description: 'Stop where it is, ending whatever it is doing; it keeps hold of what it carries.',
      timeout: 5,
      ui: { label: 'Stop' },
    },
    async () => {
      const was = current?.name
      current?.interrupt('stop')
      dev.onStop?.()
      return {
        detail: `${was ? `stopped ${was}` : 'already standing still'}; at ${where()}${load ? `, holding ${load.id}` : ''}`,
        data: { stopped: was ?? null, carrying: load?.kind ?? 'none' },
      }
    },
  )
  world.onReset(() => {
    battery = 93
    humor = 75
    honesty = 90
    motor = -20
    load = undefined
    cable.visible = false
    flash.visible = false
    crate.group.visible = false
    moving = undefined
    manual.vx = 0
    manual.wz = 0
    model.reset()
    body.reset()
    report()
  })
  return dev
}
