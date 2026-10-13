import { type Call, CallError, type Device } from '@agnes/mhs/device'
import type * as THREE from 'three'
import { rotY } from '../shapes.js'
import { fromMap, type Point, planNear, round, toMap } from './route.js'
import { Body, every, turnTo, type World, wait } from './world.js'

/**
 * Moving about the floor: a robot plans its way on the floor map around the furniture and the
 * others, drives it, and faces where it was sent; when nobody needs it for a while it goes back to
 * its home by itself. The guest walks the same way, with a step.
 */

/** A stand-in for a call, for motion nobody asked for (going home); `stop` ends it like an interrupt. */
export function quietCall(): { call: Call; stop: () => void } {
  const control = new AbortController()
  const call = {
    signal: control.signal,
    aborted: () =>
      control.signal.aborted
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            control.signal.addEventListener('abort', () => resolve(), { once: true }),
          ),
    checkpoint: async () => {
      if (control.signal.aborted) throw new Error('stopped')
    },
    progress: () => undefined,
  } as unknown as Call
  return { call, stop: () => control.abort() }
}

/** Turns `body` to face map yaw `yaw` the short way round. */
export async function face(call: Call, body: Body, yaw: number, ms = 500): Promise<void> {
  const now = body.object.rotation.y
  const want = rotY(yaw)
  const to = now + Math.atan2(Math.sin(want - now), Math.cos(want - now))
  await turnTo(call, body.object, { y: to }, ms)
}

export interface RobotOptions {
  id: string
  label: string
  /** Half its width, and how far it keeps from furniture. */
  radius: number
  speed: number
  home: { x: number; y: number; yaw: number }
  /** Seconds of nothing to do before it goes home. */
  idleS?: number
}

export class Robot {
  readonly body: Body
  /** The trip home that runs while no call does. */
  private homing: { stop: () => void; done: Promise<void> } | undefined
  private busy = 0
  private lastEnd = performance.now()
  /** Called when the robot sets off for home and when it gets there. */
  onHome: ((phase: 'leaving' | 'home') => void) | undefined

  constructor(
    readonly world: World,
    object: THREE.Object3D,
    readonly options: RobotOptions,
    log: (line: string) => void,
  ) {
    this.body = new Body(object, world)
    world.movers.push(() => ({ id: options.id, label: options.label, ...this.body.at, r: options.radius }))
    every(
      1000,
      () => {
        if (this.busy || this.homing || this.atHome()) return
        if (performance.now() - this.lastEnd < (options.idleS ?? 6) * 1000) return
        this.goHome()
      },
      log,
    )
  }

  atHome(): boolean {
    const { x, y } = toMap(this.body.at)
    return Math.hypot(x - this.options.home.x, y - this.options.home.y) < 0.3
  }

  where(): string {
    const { x, y } = toMap(this.body.at)
    return `(${x}, ${y})`
  }

  /** Runs a call's work: any trip home stops first, and the idle clock starts again after. */
  async work<T>(run: () => Promise<T>): Promise<T> {
    this.busy += 1
    if (this.homing) {
      this.homing.stop()
      await this.homing.done
    }
    try {
      return await run()
    } finally {
      this.busy -= 1
      this.lastEnd = performance.now()
    }
  }

  private goHome(): void {
    const { call, stop } = quietCall()
    this.onHome?.('leaving')
    const done = this.goTo(call, this.options.home)
      .then(() => this.onHome?.('home'))
      .catch(() => undefined)
      .finally(() => {
        if (this.homing?.done === done) this.homing = undefined
      })
    this.homing = { stop, done }
  }

  /**
   * Plans a way to (x, y) around furniture and the others, drives it, and faces `yaw` if given. When
   * another robot is in the way, it waits up to 10 s for it to move on.
   */
  async goTo(call: Call, to: { x: number; y: number; yaw?: number }, step?: () => void): Promise<void> {
    const route = () => {
      const others = this.world
        .things()
        .filter((t) => t.id !== this.options.id)
        .map((t) => ({ ...t, r: t.r + this.options.radius }))
        // One already overlapping this robot would wall it in; drive out of it instead.
        .filter((t) => Math.hypot(t.x - this.body.at.x, t.z - this.body.at.z) > t.r)
      return planNear(
        this.world.planGrid(),
        this.body.at,
        fromMap(to.x, to.y),
        others,
        this.options.radius,
        1.5,
      )
    }
    let plan = route()
    for (let i = 0; !plan && i < 5; i++) {
      await wait(call, 2000)
      plan = route()
    }
    if (!plan)
      throw new CallError(
        'unreachable',
        `no way from ${this.where()} to (${round(to.x, 1)}, ${round(to.y, 1)})`,
      )
    await this.body.follow(call, plan.path, {
      speed: this.options.speed,
      accel: 2.2,
      turnRate: Math.PI,
      arrive: 0.06,
      ...(step ? { step } : {}),
    })
    if (to.yaw !== undefined) await face(call, this.body, to.yaw)
  }

  reset(): void {
    this.homing?.stop()
    this.homing = undefined
    this.body.reset()
    this.lastEnd = performance.now()
  }
}

/** A `pose` source on the floor map from the scene's truth, and the floor map as a `grid` source. */
export function addPlace(
  dev: Device,
  world: World,
  body: Body,
  what: string,
  log: (line: string) => void,
): void {
  const pose = dev.source('pose', 'pose', `where the ${what} is on the floor map`, {
    hz: 2,
    model: { name: 'agnes-restaurant-truth', version: '1' },
    max_error_m: 0.05,
  })
  const map = dev.source('map', 'grid', 'the floor map: walls, counters, tables and chairs', {
    hz: 0.2,
    model: { name: 'agnes-restaurant-truth', version: '1' },
  })
  every(500, () => void (pose.wants() && pose.send(body.pose())), log)
  every(
    5000,
    async () => {
      if (!map.wants()) return
      const { grid, png } = await world.floorMap()
      map.send({ id: grid.id, resolution: grid.resolution, origin: grid.origin }, png)
    },
    log,
  )
}

/** The guest's walk: metres per stride, and speed. */
const STRIDE = 0.7
export const WALK = 2

/** Walks `body` through plan points with a step; `stand`/`walk` pose the figure. */
export async function walk(
  call: Call,
  body: Body,
  points: { x: number; y: number }[],
  pose: { walk(phase: number): void; stand(): void },
  speed = WALK,
): Promise<void> {
  try {
    await body.follow(
      call,
      points.map((p) => fromMap(p.x, p.y)),
      {
        speed,
        accel: 2,
        turnRate: Math.PI * 1.5,
        arrive: 0.05,
        lookahead: 0.35,
        step: () => pose.walk((body.odometer / STRIDE) * Math.PI),
      },
    )
  } finally {
    pose.stand()
  }
}

/** A plan point from a world point. */
export const planOf = (p: Point) => toMap(p)
