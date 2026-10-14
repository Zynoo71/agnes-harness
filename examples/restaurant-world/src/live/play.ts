import { type Call, CallError } from '@agnes/mhs/device'
import * as THREE from 'three'
import { bubble, toyBlock } from '../actors.js'
import { babyChairSpot, HOMES, PLAY, TABLES } from '../layout.js'
import { place, rotY } from '../shapes.js'
import { addPlace, face, Robot, walk } from './motion.js'
import { stepTo, Trail } from './party.js'
import { fromMap, toMap } from './route.js'
import {
  Body,
  type Companion,
  everyFrame,
  FRAME_HZ,
  frame,
  PACE,
  type World,
  WorldDevice,
  wait,
} from './world.js'

/** Where the robot stands in the play area to watch and play, and the mat the child plays on. */
const STAND = { x: 2.3, y: 1.25, yaw: 180 }
const MAT = { x: 1.45, y: 1.1 }
/** The way round to the slide's ladder from the mat and from the foot of the chute. */
const BELOW_LADDER = { x: PLAY.slide.ladder.x, y: 1.95 }
const BELOW_FOOT = { x: PLAY.slide.foot.x + 0.1, y: 1.95 }
const SLIDE_TOP_H = 0.86
/** How far behind the robot the child walks, and how much one game calms them. */
const GAP = 0.6
const CALM = 5
const GAMES = ['slide', 'bubbles', 'blocks'] as const
type Game = (typeof GAMES)[number]
const BLOCK_COLOURS = [0xff6b6b, 0xffd166, 0x7bd389, 0x6fb3ff, 0xb39ddb, 0xff8fb0]

/** Moves `o` in a straight line to plan point (x, y) at height h over `ms`; `each` hears the fraction done. */
async function glide(
  call: Call,
  o: THREE.Object3D,
  to: { x: number; y: number; h: number },
  ms: number,
  each?: (k: number) => void,
): Promise<void> {
  const from = o.position.clone()
  const p = fromMap(to.x, to.y)
  const goal = new THREE.Vector3(p.x, to.h, p.z)
  const start = performance.now()
  for (;;) {
    await call.checkpoint()
    const k = Math.min(1, ((performance.now() - start) * PACE) / ms)
    o.position.lerpVectors(from, goal, k)
    each?.(k)
    if (k >= 1) return
    await frame(call)
  }
}

/**
 * The play robot: takes the guest's small child from the table to the play area in the south-west
 * corner, plays with them there (the slide, soap bubbles, building blocks) and brings them back. It
 * reports how upset the child is; crying is the trouble it is there for.
 */
export function playBot(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const model = world.actors.playmate
  const robot = new Robot(
    world,
    model.object,
    { id: 'play-01', label: 'play robot', radius: 0.26, speed: 3.3, home: HOMES.play, idleS: 20 },
    log,
  )
  let mode: 'idle' | 'going' | 'leading' | 'playing' | 'returning' = 'idle'
  let game: Game | 'none' = 'none'
  let upset = 0
  /** The child walks behind the robot while it leads them. */
  let leading: Companion | undefined
  const trail = new Trail(model.object)
  /** Soap bubbles in the air, and the tower of blocks on the mat. */
  const bubbles: { mesh: THREE.Mesh; v: THREE.Vector3; born: number }[] = []
  const tower = new THREE.Group()
  world.actors.group.add(tower)

  const kid = () => world.companions.find((c) => c.child)
  const childState = () => {
    const c = kid()
    if (!c) return 'none'
    if (c.held) return game === 'none' ? 'with_robot' : 'playing'
    return service.guest === 'seated' ? 'at_table' : 'with_guest'
  }
  world.childMood = () => {
    if (!kid()) return ''
    if (upset >= 4) return '😭'
    return game !== 'none' || performance.now() < world.happyUntil ? '😄' : ''
  }

  const dev = new WorldDevice({
    id: 'play-01',
    kind: 'robot',
    name: 'Play robot',
    model: 'Agnes Restaurant play robot',
    mobile: true,
    radius: 0.26,
    localization: 'self',
    profile: {
      size_m: [0.5, 0.5, 1.1],
      max_speed: 3.3,
      notes:
        'A small, friendly robot for the guest’s small child (host-01 child): take_child walks the child from the guest’s table to the play area in the south-west corner, play keeps them busy there (the slide, soap bubbles or building blocks), bring_back walks them back to their seat. upset says how unhappy the child is; at 4 or more they are crying, and each game calms them. The guest cannot leave (host-01 see_off) while the child is in the play area.',
    },
    resources: { chassis: 'queue' },
    ui: { primary: 'pose' },
    state: {
      mode: { type: 'string', enum: ['idle', 'going', 'leading', 'playing', 'returning'] },
      child: {
        type: 'string',
        enum: ['none', 'with_guest', 'at_table', 'with_robot', 'playing'],
        description: 'where the small child is: none when the party has no small child',
      },
      game: { type: 'string', enum: ['none', ...GAMES] },
      upset: {
        type: 'integer',
        min: 0,
        max: 10,
        alert: { warn: 4, bad: 7 },
        description: 'how unhappy the small child is; 4 or more is crying',
      },
    },
  })
  dev.log = log
  const report = () => dev.update({ mode, child: childState(), game, upset })
  report()
  service.listeners.push(report)
  robot.onHome = () => {
    mode = 'idle'
    report()
  }
  addPlace(dev, world, robot.body, 'play robot', log)
  dev.after = () => ({ pose: robot.body.pose() })

  everyFrame(() => {
    const dt = 1 / FRAME_HZ
    if (leading) {
      trail.record()
      stepTo(leading, trail.along(GAP), dt, 3.9)
    }
    const now = performance.now()
    for (let k = bubbles.length - 1; k >= 0; k--) {
      const b = bubbles[k] as (typeof bubbles)[number]
      const age = (now - b.born) / 1000
      b.mesh.position.addScaledVector(b.v, dt)
      b.v.multiplyScalar(0.985)
      b.v.y = 0.25
      b.mesh.position.x += Math.sin(now / 400 + k) * 0.002
      if (age > 3.2) {
        b.mesh.removeFromParent()
        bubbles.splice(k, 1)
      }
    }
  }, log)

  /** The arms: `lift` 0 hangs them, 1 holds them up; `wave` swings them in turn. */
  const arms = (lift: number, wave = 0) =>
    model.arms.forEach((arm, k) => {
      arm.rotation.x = -lift * 2.6 + Math.sin(performance.now() / 120 + k * Math.PI) * wave
    })

  /** Where the robot stands beside the child at the guest's table, and the child's spot there. */
  const byTable = () => {
    const t = TABLES.find((x) => x.id === service.table)
    if (!t || !service.seat) return undefined
    const spot = babyChairSpot(t, service.seat)
    const dx = spot.x - t.x
    const dy = spot.y - t.y
    const n = Math.hypot(dx, dy) || 1
    return {
      spot,
      robot: { x: spot.x + (dx / n) * 0.6, y: spot.y + (dy / n) * 0.6 - 0.35, yaw: 0 },
    }
  }

  /** The robot leads the child to plan point `to` and waits for them to catch up. */
  const lead = async (call: Call, c: Companion, to: { x: number; y: number; yaw?: number }) => {
    trail.points = [{ x: c.figure.object.position.x, z: c.figure.object.position.z }]
    leading = c
    try {
      await robot.goTo(call, to)
      for (let k = 0; k < 40; k++) {
        const behind = trail.along(GAP)
        const o = c.figure.object.position
        if (Math.hypot(behind.x - o.x, behind.z - o.z) < 0.08) break
        await wait(call, 100)
      }
    } finally {
      leading = undefined
      c.figure.stand()
    }
  }

  const childBody = (c: Companion) => new Body(c.figure.object, world)
  const childTo = (call: Call, c: Companion, points: { x: number; y: number }[], speed = 1.3) =>
    walk(call, childBody(c), points, c.figure, speed)
  /** Turns the child to face plan point (x, y). */
  const childFaces = (c: Companion, p: { x: number; y: number }) => {
    const o = c.figure.object
    const at = toMap({ x: o.position.x, z: o.position.z })
    o.rotation.y = rotY((Math.atan2(p.y - at.y, p.x - at.x) * 180) / Math.PI)
  }

  const slide = async (call: Call, c: Companion) => {
    const S = PLAY.slide
    const o = c.figure.object
    await face(call, robot.body, 90)
    for (let round = 1; round <= 2; round++) {
      call.progress({ done: round - 1, total: 2, text: `down the slide, ${round} of 2` })
      await childTo(call, c, [BELOW_LADDER])
      o.rotation.y = rotY(90)
      // Up the ladder, legs going, then onto the platform facing down the chute.
      let climbed = 0
      await glide(call, o, { x: S.ladder.x, y: S.ladder.y - 0.2, h: SLIDE_TOP_H }, 1100, (k) => {
        climbed = k
        c.figure.walk(climbed * 8 * Math.PI)
      })
      c.figure.stand()
      await glide(call, o, { x: S.top.x, y: S.top.y, h: SLIDE_TOP_H }, 350)
      o.rotation.y = rotY(0)
      c.figure.sit()
      arms(1, 0.3)
      await glide(call, o, { x: S.foot.x + 0.05, y: S.foot.y, h: 0.05 }, 900, (k) => {
        // Gathering speed down the chute.
        const e = k * k
        o.position.x = fromMap(S.top.x + 0.2 + (S.foot.x + 0.05 - S.top.x - 0.2) * e, 0).x
        o.position.y = SLIDE_TOP_H - (SLIDE_TOP_H - 0.05) * e
        arms(1, 0.3)
      })
      o.position.y = 0
      c.figure.stand()
      arms(0)
      await wait(call, 300)
      if (round < 2) await childTo(call, c, [BELOW_FOOT, BELOW_LADDER])
    }
    await childTo(call, c, [BELOW_FOOT, MAT])
    return 'the child went down the slide twice, squealing'
  }

  const blowBubbles = async (call: Call, c: Companion) => {
    await childTo(call, c, [MAT])
    childFaces(c, STAND)
    await face(call, robot.body, 180)
    model.wand.visible = true
    const ring = new THREE.Vector3()
    const towards = fromMap(MAT.x, MAT.y)
    const o = c.figure.object
    try {
      for (let k = 0; k < 40; k++) {
        arms(0)
        ;(model.arms[1] as THREE.Object3D).rotation.x = -1.4 + Math.sin(k * 0.6) * 0.15
        if (k % 2 === 0) {
          model.wand.getWorldPosition(ring)
          const b = bubble(0.04 + Math.random() * 0.05)
          b.position.copy(ring)
          const v = new THREE.Vector3(
            towards.x - ring.x + (Math.random() - 0.5),
            0.25,
            towards.z - ring.z + (Math.random() - 0.5),
          ).multiplyScalar(0.45)
          world.actors.group.add(b)
          bubbles.push({ mesh: b, v, born: performance.now() })
        }
        // The child hops about after the bubbles.
        o.position.y = Math.abs(Math.sin(k * 0.7)) * 0.12
        c.figure.walk(k * 0.7)
        call.progress({ done: k + 1, total: 40, text: 'blowing soap bubbles' })
        await wait(call, 200)
      }
    } finally {
      o.position.y = 0
      c.figure.stand()
      model.wand.visible = false
      arms(0)
    }
    return 'the child chased soap bubbles round the mat, laughing'
  }

  const blocks = async (call: Call, c: Companion) => {
    await childTo(call, c, [MAT])
    childFaces(c, STAND)
    await face(call, robot.body, 180)
    for (const b of [...tower.children]) b.removeFromParent()
    const at = fromMap(MAT.x + 0.4, MAT.y - 0.05)
    tower.position.set(at.x, 0.03, at.z)
    try {
      for (let k = 0; k < BLOCK_COLOURS.length; k++) {
        const block = toyBlock(BLOCK_COLOURS[k] as number)
        block.rotation.y = (Math.random() - 0.5) * 0.4
        tower.add(place(block, (Math.random() - 0.5) * 0.02, 0, 0.055 + k * 0.11 + 0.3))
        await glide(call, block, { x: block.position.x, y: -block.position.z, h: 0.055 + k * 0.11 }, 300)
        call.progress({ done: k + 1, total: BLOCK_COLOURS.length, text: 'building a tower of blocks' })
        arms(0.3, 0.2)
        await wait(call, 700)
      }
      for (let k = 0; k < 8; k++) {
        arms(1, 0.5)
        await wait(call, 150)
      }
    } finally {
      arms(0)
    }
    return `the child built a tower of ${BLOCK_COLOURS.length} blocks on the mat and the robot cheered`
  }

  const needChild = () => {
    const c = kid()
    if (!c) throw new CallError('x_no_child', 'there is no small child in the guest’s party (host-01 child)')
    return c
  }

  dev.tool(
    {
      name: 'take_child',
      description:
        'Walk the guest’s small child from the table to the play area, holding the way for them, when the guest wants the child to play (or the child is crying); the child must be at the guest’s table first.',
      timeout: 90,
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Take the child to play' },
    },
    async (call) => {
      const c = needChild()
      if (c.held) throw new CallError('x_already', 'the child is already with play-01 in the play area')
      const near = byTable()
      if (service.guest !== 'seated' || !near)
        throw new CallError('x_not_seated', 'the party is not at a table yet; the child stays with the guest')
      return robot.work(async () => {
        try {
          mode = 'going'
          report()
          await robot.goTo(call, near.robot)
          c.held = true
          c.figure.object.position.y = 0
          c.figure.stand()
          mode = 'leading'
          report()
          await lead(call, c, STAND)
          await childTo(call, c, [MAT])
          childFaces(c, STAND)
          return `the child is on the mat in the play area with play-01 (upset ${upset}); play a game to keep them happy, bring_back when the party wants them`
        } finally {
          mode = 'idle'
          report()
        }
      })
    },
  )

  dev.tool(
    {
      name: 'play',
      description:
        'Play a game with the child in the play area: go down the slide, blow soap bubbles for them to chase, or build a tower of blocks. Each game takes about ten seconds and calms a crying child. The child must be in the play area first (take_child).',
      timeout: 60,
      params: { game: { type: 'string', enum: [...GAMES], description: 'which game' } },
      required: ['game'],
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Play' },
    },
    async (call, { game: which }) => {
      const c = needChild()
      if (!c.held)
        throw new CallError('x_child_not_here', 'the child is not in the play area: take_child first')
      const g = which as Game
      return robot.work(async () => {
        try {
          const at = toMap(robot.body.at)
          if (Math.hypot(at.x - STAND.x, at.y - STAND.y) > 0.3) await robot.goTo(call, STAND)
          game = g
          mode = 'playing'
          report()
          const what = await (g === 'slide' ? slide : g === 'bubbles' ? blowBubbles : blocks)(call, c)
          upset = Math.max(0, upset - CALM)
          world.happyUntil = performance.now() + 6000
          return `${what}; upset is ${upset}${upset >= 4 ? ', still crying: play again' : ', happy now'}`
        } finally {
          c.figure.object.position.y = 0
          game = 'none'
          mode = 'idle'
          report()
        }
      })
    },
  )

  dev.tool(
    {
      name: 'bring_back',
      description:
        'Walk the child back from the play area to their place at the guest’s table; the party cannot leave while the child is in the play area.',
      timeout: 90,
      uses: ['chassis'],
      motion: true,
      ui: { label: 'Bring the child back' },
    },
    async (call) => {
      const c = needChild()
      if (!c.held) throw new CallError('x_child_not_here', 'the child is not with play-01')
      const near = byTable()
      if (!near) throw new CallError('x_not_seated', 'the guest is not at a table')
      return robot.work(async () => {
        try {
          mode = 'returning'
          report()
          await lead(call, c, near.robot)
          // The child steps back to their place; the party sits them on the baby chair if there is one.
          c.path = [fromMap(near.spot.x, near.spot.y)]
          c.held = false
          return 'the child is back at the guest’s table'
        } finally {
          mode = 'idle'
          report()
        }
      })
    },
  )

  world.conditions.push({
    device: dev.id,
    en: 'The small child starts crying',
    zh: '小孩哭了',
    apply: () => {
      if (!kid()) return
      upset = 8
      report()
    },
  })
  world.onReset(() => {
    leading = undefined
    for (const b of bubbles) b.mesh.removeFromParent()
    bubbles.length = 0
    for (const b of [...tower.children]) b.removeFromParent()
    model.wand.visible = false
    arms(0)
    robot.reset()
    mode = 'idle'
    game = 'none'
    upset = 0
    world.happyUntil = 0
    report()
  })
  return dev
}
