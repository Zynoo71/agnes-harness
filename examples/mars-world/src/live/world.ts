import {
  type Call,
  CallError,
  Device,
  type DeviceOptions,
  type ToolHandler,
  type ToolOptions,
} from '@agnes/mhs/device'

type Values = Parameters<Device['update']>[0]

import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { FOOTPRINTS } from '../base.js'
import type { MarsClock } from '../clock.js'
import { MONOLITH, type Parts } from '../devices.js'
import { heightAt, OBSTACLES } from '../terrain.js'
import type { Effects, Events } from './events.js'
import { type Footprint, type GridMap, occupancy } from './map.js'
import { grayPng } from './png.js'
import { type Circle, headingTo, type Point, round, toMap, yawOf } from './route.js'

/** A camera's render targets and the buffers its pictures are read back into. */
interface Targets {
  linear: THREE.WebGLRenderTarget
  out: THREE.WebGLRenderTarget
  /** The picture, as RGBA rows from the top. */
  raw: Uint8Array
  w: number
  h: number
  /** For video: the picture as I420, packed four bytes to a pixel, and the planes read back. */
  yuv?: THREE.WebGLRenderTarget
  planes?: Uint8Array
  /** The GPU-side buffer an asynchronous read goes to, and the fence that says it is done. */
  pbo?: WebGLBuffer | null
  fence?: WebGLSync | undefined
}

/** Something in the scene a device can find or must keep clear of: the scene's truth. */
export interface Thing extends Circle {
  id: string
  label: string
}

/** Frames a second of the one clock everything that moves steps on. */
export const FRAME_HZ = 60

// Browsers slow down timers in hidden tabs to once a second, and later to once a minute, which
// would freeze a device's motion whenever its page is behind another window. Timers in a worker
// keep their pace, so devices wait on those. The worker also beats the frame clock, each beat aimed
// at its exact time: setInterval rounds 16.7 ms down to 16, and a camera filming every other frame
// then ran faster than its rate, so pictures piled up waiting to be sent until they were dropped.
const ticker = new Worker(
  URL.createObjectURL(
    new Blob(
      [
        `const period = ${1000 / FRAME_HZ}
        let next = performance.now() + period
        const beat = () => {
          postMessage('frame')
          next += period
          const now = performance.now()
          if (next < now - 100) next = now + period
          setTimeout(beat, next - now)
        }
        setTimeout(beat, period)
        onmessage = (e) => setTimeout(() => postMessage(e.data), e.data.ms)`,
      ],
      { type: 'text/javascript' },
    ),
  ),
)
const waiting = new Map<number, () => void>()
let ticks = 0
let frameWaiters: (() => void)[] = []
const onFrame = new Set<() => void>()
const afterFrame = new Set<() => void>()
// Cameras film once the frame's motion is done: a message is a task, so it runs after every step the
// frame woke up, however many awaits each takes, and unlike a timeout it is not slowed when hidden.
const after = new MessageChannel()
after.port1.onmessage = () => {
  for (const f of afterFrame) f()
}
ticker.onmessage = (e: MessageEvent<{ id: number } | 'frame'>) => {
  if (e.data === 'frame') {
    const woken = frameWaiters
    frameWaiters = []
    for (const resolve of woken) resolve()
    for (const f of onFrame) f()
    after.port2.postMessage(null)
    return
  }
  waiting.get(e.data.id)?.()
  waiting.delete(e.data.id)
}

/**
 * Waits for the next frame of the clock that all motion steps on. Cameras film right after a frame,
 * so a steady motion moves the same amount in each picture; on separate timers it moved one step in
 * one picture and two in the next, and the video stuttered.
 */
export async function frame(call: Call): Promise<void> {
  await Promise.race([new Promise<void>((resolve) => frameWaiters.push(resolve)), call.aborted()])
  if (call.signal.aborted) await call.checkpoint()
}

/** Runs `step` on every frame of the motion clock while the page lives; errors are logged. */
export function everyFrame(step: () => void, log: (line: string) => void): void {
  onFrame.add(() => {
    try {
      step()
    } catch (e) {
      log(`live: ${String(e)}`)
    }
  })
}

/** Runs `film` after every frame's motion, for the cameras. */
export function afterEveryFrame(film: () => void): void {
  afterFrame.add(film)
}

/** Waits `ms`, at full pace even in a hidden tab, and ends early once the call is interrupted. */
export async function wait(call: Call, ms: number): Promise<void> {
  ticks += 1
  const id = ticks
  await Promise.race([
    new Promise<void>((resolve) => {
      waiting.set(id, resolve)
      ticker.postMessage({ id, ms })
    }),
    call.aborted(),
  ])
  waiting.delete(id)
  // Throws Interrupted, like call.sleep, once the call was cancelled or stopped.
  if (call.signal.aborted) await call.checkpoint()
}

/** A call as the page shows it: what runs where, for whom, how far it got and how it ended. */
export interface Activity {
  device: string
  tool: string
  args: Values
  /** Who called: the caller name from the hub's meta (an agent, a person's console), if any. */
  caller: string | undefined
  /** How long the caller took to decide on the call, in ms, from the hub's meta, if it says. */
  think: number | undefined
  started: number
  progress: { done?: number; total?: number; text?: string } | undefined
  ended: number | undefined
  /** done, error, interrupted, rejected; and the reason and sentence it ended with. */
  status: string | undefined
  reason: string | undefined
  detail: string | undefined
}

/** A state value past its alert line: warn or bad. */
export interface Alert {
  device: string
  field: string
  level: 'warn' | 'bad'
  value: number
  unit: string
}

/** Hears every call as it starts, makes progress and ends, and every alert as it is raised or cleared. */
export const watchers: {
  activity: ((a: Activity) => void)[]
  alert: ((a: Alert, raised: boolean) => void)[]
} = { activity: [], alert: [] }

interface AlertLine {
  warn?: number
  bad?: number
  below?: boolean
  unit?: string | undefined
}

/**
 * A device of the world: a Device that knows its running calls, so that Reset can end them the way
 * mhs/stop does, reported to the hub as interrupted; and that tells the page what it does (each
 * call, its progress and how it ended) and which of its state values are past their alert lines.
 */
export class WorldDevice extends Device {
  private readonly running = new Set<Call>()
  /** The latest call still running, and the last one that ended. */
  current: Activity | undefined
  last: Activity | undefined
  /** State values past their alert lines, by field. */
  readonly alerts = new Map<string, Alert>()
  private readonly lines: Record<string, AlertLine>

  constructor(options: DeviceOptions) {
    super(options)
    // A call refused as unsafe never reaches its tool: the page hears of it here.
    let unsafe: Device['unsafe']
    Object.defineProperty(this, 'unsafe', {
      get: () =>
        unsafe &&
        ((tool: string) => {
          const why = unsafe?.(tool)
          if (why) {
            const now = performance.now()
            const a: Activity = {
              device: this.id,
              tool,
              args: {},
              caller: undefined,
              think: undefined,
              started: now,
              progress: undefined,
              ended: now,
              status: 'rejected',
              reason: 'unsafe',
              detail: why,
            }
            this.last = a
            for (const w of watchers.activity) w(a)
          }
          return why
        }),
      set: (hook: Device['unsafe']) => {
        unsafe = hook
      },
    })
    this.lines = Object.fromEntries(
      Object.entries(options.state ?? {})
        .filter(([, f]) => (f as { alert?: unknown }).alert)
        .map(([k, f]) => {
          const { alert, unit } = f as { alert: AlertLine; unit?: string }
          return [k, { ...alert, unit }]
        }),
    )
  }

  override tool(options: ToolOptions, handler: ToolHandler): void {
    super.tool(options, async (call, args) => {
      this.running.add(call)
      const meta = call.meta as { caller?: string; think_ms?: number } | undefined
      const a: Activity = {
        device: this.id,
        tool: call.name,
        args,
        caller: meta?.caller,
        think: meta?.think_ms,
        started: performance.now(),
        progress: undefined,
        ended: undefined,
        status: undefined,
        reason: undefined,
        detail: undefined,
      }
      const send = call.progress.bind(call)
      call.progress = (update) => {
        a.progress = update
        for (const w of watchers.activity) w(a)
        send(update)
      }
      this.current = a
      for (const w of watchers.activity) w(a)
      try {
        const value = await handler(call, args)
        a.status = 'done'
        a.detail =
          typeof value === 'string' ? value : ((value as { detail?: string } | undefined)?.detail ?? '')
        return value
      } catch (e) {
        const interrupted = call.signal.aborted
        a.status = interrupted ? 'interrupted' : 'error'
        a.reason = interrupted ? (call.endReason ?? 'cancel') : e instanceof CallError ? e.reason : 'failed'
        a.detail = e instanceof CallError ? e.detail : String(e)
        throw e
      } finally {
        this.running.delete(call)
        a.ended = performance.now()
        if (this.current === a) this.current = undefined
        this.last = a
        for (const w of watchers.activity) w(a)
      }
    })
  }

  override update(values: Values): void {
    super.update(values)
    for (const [field, line] of Object.entries(this.lines)) {
      const value = values[field]
      if (typeof value !== 'number') continue
      const past = (limit: number | undefined) =>
        limit !== undefined && (line.below ? value <= limit : value >= limit)
      const level = past(line.bad) ? 'bad' : past(line.warn) ? 'warn' : undefined
      const was = this.alerts.get(field)
      if (level === was?.level) continue
      if (level) {
        const alert: Alert = { device: this.id, field, level, value, unit: line.unit ?? '' }
        this.alerts.set(field, alert)
        for (const w of watchers.alert) w(alert, true)
      } else if (was) {
        this.alerts.delete(field)
        // Cleared with the value it came back to, not the one it was raised at.
        for (const w of watchers.alert) w({ ...was, value }, false)
      }
    }
  }

  /** Zeroes motion and ends every running call as interrupted (stop). */
  async stopAll(): Promise<void> {
    await this.onStop?.()
    for (const call of this.running) call.interrupt('stop')
  }
}

/** Trouble a person can bring about from the controls panel; the device it touches reports it. */
export interface Condition {
  device: string
  en: string
  zh: string
  apply(): void
}

/** A photo a camera took and keeps, for the dish to send home. */
export interface Photo {
  id: string
  /** The camera device that took it. */
  by: string
  jpeg: Uint8Array
  /** Mars time it was taken, `Sol 1 · 17:24 LMST`. */
  at: string
  /** The sun was in the picture, how high it stood and where (degrees; azimuth clockwise from north). */
  sun: { inFrame: boolean; elevation: number; azimuth: number }
}

/** A report that reached Earth, and Mission Control's answer. */
export interface Mail {
  report: string
  photo: Photo | undefined
  reply: { en: string; zh: string }
  at: string
}

/** What the live devices share: the scene, its truth, and the state that ties devices together. */
export class World {
  /** The rover reports these (and `leg`, where it drives to now); the lab reads them before it unloads. */
  rover = { docked: true, cargo: [] as string[], leg: undefined as Point | undefined }
  /** Set by the rover: tells it to report its state after another device changed it. */
  roverChanged: (() => void) | undefined
  /** The vehicle Monolith tows now (rover-01 or hopper-01): it cannot move by itself meanwhile. */
  towed: string | undefined
  /**
   * Where the astronaut is: at work in the field, walking about it on their own; carried by
   * Monolith; set down somewhere outside, waiting there; in the airlock's chamber; or in the habitat.
   * Out of doors they stand in other devices' way.
   */
  astronaut: 'working' | 'carried' | 'standing' | 'chamber' | 'inside' = 'working'
  /** The airlock reports its doors here, and re-reports its state when told something changed. */
  airlock = { inner: 'open' as 'open' | 'closed', outer: 'closed' as 'open' | 'closed' }
  airlockChanged: (() => void) | undefined
  /** The suit leaks (an event): oxygen goes fast and the wearer cannot walk. */
  suitLeak = false
  /** What happens on its own: storms, leaks, dust devils, meteorites (set up by connectDevices). */
  events: Events | undefined
  /** What the scene draws for events; set by the page. */
  effects: Effects | undefined
  /** Set by the comms dish: whether Earth is in view, and when (Unix seconds) that changes. */
  earthWindow: (() => { open: boolean; changes: number }) | undefined
  /** Set by the power system: dust settles on the panels, in percent of their light. */
  dustPanels: ((percent: number) => void) | undefined
  /** Set by power: whether the dock's charger has power (not shed, not dark). */
  charging = true
  /** Set by the power system: whether the array is deployed, and a panel brushed clean (gives the mean dust). */
  solar: { deployed(): boolean; clean(panel: number): number } | undefined
  /** Set by the lab: takes a sample handed to it and queues it for analysis. */
  labReceive: ((sample: string) => void) | undefined
  /** Photos the cameras took, by id (`photo-1`). */
  readonly photos = new Map<string, Photo>()
  /** Hear each report as it reaches Earth; the page shows it. */
  readonly mailListeners: ((mail: Mail) => void)[] = []
  /** Conditions the devices offer the controls panel. */
  readonly conditions: Condition[] = []
  /** The weather station reports these; the hopper reads them before it flies. */
  weather = { wind: 6, dust: 0.6, storm: 'none' as 'none' | 'watch' | 'warning' }
  /** What each device does on Reset: back to how it started, its state reported at once. */
  private readonly resets: (() => void)[] = []
  /** The rocks as the page drew them, before any sample was taken. */
  private readonly rockScales = new Map(OBSTACLES.map((o) => [o, o.object.scale.clone()]))
  /** Render targets by camera and size: a camera's stills and its video are not the same size. */
  private readonly snapshots = new Map<string, Targets>()
  private readonly output = flippedOutput()
  private readonly i420 = new I420()
  private readonly skyAt = new THREE.Vector3()

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly scene: THREE.Scene,
    readonly parts: Parts,
    /** The sky dome, which follows whichever camera renders. */
    readonly sky: THREE.Object3D,
    /** The local time, which the light, the solar array and the air temperature follow. */
    readonly clock: MarsClock,
  ) {}

  onReset(reset: () => void): void {
    this.resets.push(reset)
  }

  /** Puts the shared state and every device back as a fresh page has them. */
  reset(): void {
    this.rover = { docked: true, cargo: [], leg: undefined }
    this.towed = undefined
    this.astronaut = 'working'
    this.airlock = { inner: 'open', outer: 'closed' }
    this.suitLeak = false
    this.photos.clear()
    this.events?.reset()
    for (const [rock, scale] of this.rockScales) rock.object.scale.copy(scale)
    for (const reset of this.resets) reset()
  }

  /** Everything a device may find, where it is now. */
  things(): Thing[] {
    const out: Thing[] = OBSTACLES.map((o) => ({
      id: o.id,
      label: o.label,
      x: o.x,
      z: o.z,
      r: o.r,
    }))
    const { astronaut, rover, hopper, monolith } = this.parts
    if (['working', 'carried', 'standing'].includes(this.astronaut))
      out.push({
        id: 'suit-01',
        label: 'astronaut',
        x: astronaut.position.x,
        z: astronaut.position.z,
        r: 0.5,
      })
    out.push({ id: 'rover-01', label: 'rover', x: rover.position.x, z: rover.position.z, r: 1.4 })
    out.push({ id: 'hopper-01', label: 'hopper', x: hopper.position.x, z: hopper.position.z, r: 1.3 })
    const m = monolith.group.position
    out.push({ id: MONOLITH.id, label: 'robot', x: m.x, z: m.z, r: 0.35 })
    return out
  }

  /** Obstacles a ground vehicle must keep away from (people included), without `except`. */
  obstacles(except: string[] = []): Thing[] {
    return this.things().filter((t) => !except.includes(t.id) && t.label !== 'hopper')
  }

  ground(p: Point): number {
    return heightAt(p.x, p.z)
  }

  /** What blocks a ground vehicle that the base map knows: buildings, boulders, the sample rock. */
  footprints(): Footprint[] {
    return [...FOOTPRINTS, ...OBSTACLES.map((o) => ({ x: o.x, z: o.z, r: o.r }))]
  }

  private map: Promise<{ grid: GridMap; png: Uint8Array }> | undefined
  private groundGrid: GridMap | undefined

  /**
   * The base map without the rocks and people, for planning a rover's way: buildings and steep
   * ground. Rocks and people are kept out with their own clearances (route.ts keepouts).
   */
  planGrid(): GridMap {
    this.groundGrid ??= occupancy(FOOTPRINTS, heightAt)
    return this.groundGrid
  }

  /** What would stop the rover (boulders, people) and what else is in its way (sample rocks). */
  inTheWay(except: string[] = []): { stops: Thing[]; others: Thing[] } {
    const all = this.obstacles(['rover-01', ...except])
    return {
      stops: all.filter((t) => t.label !== 'unusual rock'),
      others: all.filter((t) => t.label === 'unusual rock'),
    }
  }

  /** The base map as an occupancy grid and its PNG, made on first use. */
  baseMap(): Promise<{ grid: GridMap; png: Uint8Array }> {
    this.map ??= (async () => {
      const grid = occupancy(this.footprints(), heightAt)
      return { grid, png: await grayPng(grid.w, grid.h, grid.cells) }
    })()
    return this.map
  }

  /** Renders what `camera` sees into its own targets, tone-mapped like the main view. */
  private draw(camera: THREE.PerspectiveCamera, w: number, h: number): Targets {
    const key = `${camera.uuid} ${w}x${h}`
    let targets = this.snapshots.get(key)
    if (!targets) {
      targets = {
        // Multisampled, so edges stay smooth instead of turning into stairs the encoder makes worse.
        linear: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }),
        out: new THREE.WebGLRenderTarget(w, h),
        raw: new Uint8Array(w * h * 4),
        w,
        h,
      }
      this.snapshots.set(key, targets)
    }
    const { renderer, scene } = this
    const previous = renderer.getRenderTarget()
    camera.updateMatrixWorld()
    this.skyAt.copy(this.sky.position)
    camera.getWorldPosition(this.sky.position)
    renderer.setRenderTarget(targets.linear)
    renderer.render(scene, camera)
    this.output.render(renderer, targets.out, targets.linear, 0, false)
    renderer.setRenderTarget(previous)
    this.sky.position.copy(this.skyAt)
    return targets
  }

  /** What `camera` sees, tone-mapped like the main view, as a texture with its rows from the top. */
  view(camera: THREE.PerspectiveCamera, w: number, h: number): THREE.Texture {
    return this.draw(camera, w, h).out.texture
  }

  /**
   * What `camera` sees, tone-mapped like the main view, as RGBA rows from the top. Waits for the
   * GPU; the buffer is reused by the next call for the same camera.
   */
  pixels(camera: THREE.PerspectiveCamera, w: number, h: number): Uint8Array {
    const targets = this.draw(camera, w, h)
    this.renderer.readRenderTargetPixels(targets.out, 0, 0, w, h, targets.raw)
    return targets.raw
  }

  /**
   * Starts reading what `camera` sees back without waiting for the GPU: the pixels go to a buffer
   * on the GPU side, and `collect` picks them up once a fence says they are there. A synchronous
   * read stalls the page until the GPU has drawn everything queued before it.
   */
  capture(camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const targets = this.draw(camera, w, h)
    const gl = this.renderer.getContext() as WebGL2RenderingContext
    if (!targets.pbo) {
      targets.pbo = gl.createBuffer()
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, targets.pbo)
      gl.bufferData(gl.PIXEL_PACK_BUFFER, I420.bytes(w, h), gl.STREAM_READ)
      targets.yuv = new THREE.WebGLRenderTarget(w / 4, (h * 3) / 2)
      targets.planes = new Uint8Array(I420.bytes(w, h))
    } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, targets.pbo)
    const previous = this.renderer.getRenderTarget()
    const yuv = targets.yuv as THREE.WebGLRenderTarget
    this.i420.convert(this.renderer, targets.out, yuv)
    this.renderer.setRenderTarget(yuv)
    gl.readPixels(0, 0, yuv.width, yuv.height, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    this.renderer.setRenderTarget(previous)
    if (targets.fence) gl.deleteSync(targets.fence)
    targets.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? undefined
    gl.flush()
  }

  /**
   * The picture the last `capture` of `camera` at this size started, as I420 planes (`I420`),
   * once the GPU has it; undefined while it is not there yet. The buffer is reused by the next
   * picture.
   */
  collect(camera: THREE.PerspectiveCamera, w: number, h: number): Uint8Array | undefined {
    const targets = this.snapshots.get(`${camera.uuid} ${w}x${h}`)
    if (!targets?.fence || !targets.pbo || !targets.planes) return undefined
    const gl = this.renderer.getContext() as WebGL2RenderingContext
    if (gl.clientWaitSync(targets.fence, 0, 0) === gl.TIMEOUT_EXPIRED) return undefined
    gl.deleteSync(targets.fence)
    targets.fence = undefined
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, targets.pbo)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, targets.planes)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    return targets.planes
  }

  /** A JPEG of what `camera` sees, tone-mapped like the main view. */
  async snapshot(camera: THREE.PerspectiveCamera, w: number, h: number): Promise<Uint8Array> {
    const image = new ImageData(new Uint8ClampedArray(this.pixels(camera, w, h)), w, h)
    const canvas = new OffscreenCanvas(w, h)
    ;(canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    return new Uint8Array(await blob.arrayBuffer())
  }
}

/** Pose and odometry of a body that moves on (or over) the ground. */
export class Body {
  readonly start: { x: number; z: number; heading: number }
  odometer = 0
  speed = 0
  turn = 0

  constructor(
    readonly object: THREE.Object3D,
    readonly world: World,
    readonly lift = 0,
  ) {
    this.start = { x: object.position.x, z: object.position.z, heading: object.rotation.y }
  }

  get at(): Point {
    return { x: this.object.position.x, z: this.object.position.z }
  }

  /** Back where it started, at rest, its odometry from zero. */
  reset(): void {
    this.object.position.set(this.start.x, this.world.ground(this.start) + this.lift, this.start.z)
    this.object.rotation.set(0, this.start.heading, 0)
    this.odometer = 0
    this.speed = 0
    this.turn = 0
  }

  get heading(): number {
    return this.object.rotation.y
  }

  pose(ok = true): Record<string, unknown> {
    return { map: 'base', ...toMap(this.at), yaw: yawOf(this.heading), ok }
  }

  /** Relative to where the device started, in its start frame (x forward, y left). */
  odometry(): Record<string, unknown> {
    const dx = this.object.position.x - this.start.x
    const dz = this.object.position.z - this.start.z
    const h = this.start.heading
    const fx = Math.sin(h)
    const fz = Math.cos(h)
    return {
      x: round(dx * fx + dz * fz),
      y: round(dx * fz - dz * fx),
      yaw: round(((this.heading - h) * 180) / Math.PI, 1),
      v: round(this.speed),
      w: round((this.turn * 180) / Math.PI, 1),
    }
  }

  /**
   * Turns toward `to` and goes there at up to `speed` m/s, frame by frame, until within `arrive`
   * metres: speeding up and slowing down at `accel` m/s², so it starts and arrives smoothly.
   * `blocked` may end the trip early with a sentence; `step` hears each frame. Interrupts (cancel,
   * stop, pause) take effect at the next frame.
   */
  async go(
    call: Call,
    to: Point,
    options: {
      speed: number
      accel?: number
      turnRate?: number
      arrive?: number
      height?: (p: Point) => number
      /** Why the way ahead is not clear; `remaining` is how far the point it drives to still is. */
      blocked?: (remaining: number) => string | undefined
      step?: () => void
    },
  ): Promise<void> {
    const turnRate = options.turnRate ?? Math.PI / 4
    const accel = options.accel ?? 1
    const arrive = options.arrive ?? 0.15
    let v = 0
    const height = options.height ?? ((p: Point) => this.world.ground(p) + this.lift)
    let last = performance.now()
    try {
      for (;;) {
        await call.checkpoint(() => {
          this.speed = 0
          this.turn = 0
        })
        const now = performance.now()
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        const distance = Math.hypot(to.x - this.at.x, to.z - this.at.z)
        if (distance <= arrive) break
        const want = headingTo(this.at, to)
        let delta = want - this.heading
        delta = Math.atan2(Math.sin(delta), Math.cos(delta))
        // Only what lies ahead while driving counts: turning in place away from a boulder is fine.
        const why = Math.abs(delta) < 0.35 ? options.blocked?.(distance) : undefined
        if (why) throw new Blocked(why)
        const turn = Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt)
        this.object.rotation.y += turn
        this.turn = turn / Math.max(dt, 1e-3)
        // Drive only once roughly facing the goal, like a skid-steer rover; brake to arrive.
        const facing = Math.abs(delta) < 0.35
        v = facing ? Math.min(options.speed, v + accel * dt, Math.sqrt(2 * accel * distance) + 0.1) : 0
        const forward = Math.min(distance, v * dt)
        this.speed = forward / Math.max(dt, 1e-3)
        this.object.position.x += Math.sin(this.heading) * forward
        this.object.position.z += Math.cos(this.heading) * forward
        this.object.position.y = height(this.at)
        this.odometer += forward
        options.step?.()
        await frame(call)
      }
    } finally {
      this.speed = 0
      this.turn = 0
    }
  }

  /** Changes height to `y` at up to `rate` m/s, easing in and out at `accel` m/s², frame by frame. */
  async rise(call: Call, y: number, rate: number, step?: () => void, accel = 2): Promise<void> {
    let last = performance.now()
    let v = 0
    while (Math.abs(this.object.position.y - y) > 0.02) {
      await call.checkpoint()
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const dy = y - this.object.position.y
      v = Math.min(rate, v + accel * dt, Math.sqrt(2 * accel * Math.abs(dy)) + 0.05)
      this.object.position.y += Math.sign(dy) * Math.min(Math.abs(dy), v * dt)
      step?.()
      await frame(call)
    }
  }
}

/** Thrown by Body.go when `blocked` says the way is not clear. */
export class Blocked extends Error {}

/** Eases `object`'s rotation toward `target` (radians per axis) over `ms`, interruptibly. */
export async function turnTo(
  call: Call,
  object: THREE.Object3D,
  target: Partial<Record<'x' | 'y' | 'z', number>>,
  ms: number,
): Promise<void> {
  const from = { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z }
  const start = performance.now()
  for (;;) {
    await call.checkpoint()
    const k = Math.min(1, (performance.now() - start) / ms)
    const e = k * k * (3 - 2 * k)
    for (const axis of ['x', 'y', 'z'] as const) {
      const to = target[axis]
      if (to !== undefined) object.rotation[axis] = from[axis] + (to - from[axis]) * e
    }
    if (k >= 1) return
    await frame(call)
  }
}

/** Runs `send` every `ms` while the page lives, at full pace in a hidden tab; errors are logged. */
export function every(ms: number, send: () => void | Promise<void>, log: (line: string) => void): void {
  const loop = () => {
    ticks += 1
    const id = ticks
    waiting.set(id, () => {
      Promise.resolve()
        .then(send)
        .catch((e) => log(`live: ${String(e)}`))
        .finally(loop)
    })
    ticker.postMessage({ id, ms })
  }
  loop()
}

/**
 * The main view's output pass (tone mapping, sRGB), drawn upside down: WebGL reads pixels from the
 * bottom row up, so pictures read back from it come out top row first, ready for JPEG and video.
 */
function flippedOutput(): OutputPass {
  const pass = new OutputPass()
  pass.material.vertexShader = pass.material.vertexShader.replace(
    'vUv = uv;',
    'vUv = vec2( uv.x, 1.0 - uv.y );',
  )
  return pass
}

/**
 * Converts a picture to I420 on the GPU, the planes a video encoder takes: Y at full size, then U
 * and V at half width and half height, BT.709 limited range. Reading these back moves 1.5 bytes a
 * pixel instead of 4, and the read is what holds up the page.
 *
 * The target is a quarter as wide as the picture and one and a half times as tall, four bytes to a
 * pixel, so its rows read back from the top are exactly the planes one after another.
 */
export class I420 {
  static bytes(w: number, h: number): number {
    return (w * h * 3) / 2
  }

  private readonly uniforms = {
    picture: { value: null as THREE.Texture | null },
    size: { value: new THREE.Vector2() },
  }
  private readonly material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: this.uniforms,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // `picture` holds the top row first (flippedOutput), so v grows downwards.
    fragmentShader: `
      uniform sampler2D picture;
      uniform vec2 size;
      out vec4 bytes;
      vec3 at(float x, float y) { return texture(picture, vec2(x, y) / size).rgb; }
      float luma(vec3 c) { return (16.0 + 219.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))) / 255.0; }
      float cb(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(-0.1146, -0.3854, 0.5))) / 255.0; }
      float cr(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(0.5, -0.4542, -0.0458))) / 255.0; }
      void main() {
        float w = size.x;
        float h = size.y;
        // readPixels returns the bottom row (gl_FragCoord.y 0) first, so that is the first row out.
        float row = floor(gl_FragCoord.y);
        float x = floor(gl_FragCoord.x) * 4.0;
        vec4 o;
        if (row < h) {
          for (int k = 0; k < 4; k++) o[k] = luma(at(x + float(k) + 0.5, row + 0.5));
        } else {
          // Chroma: each sample is the centre of a 2x2 block, which linear filtering averages.
          float t = row - h;
          bool v = t >= h / 4.0;
          if (v) t -= h / 4.0;
          for (int k = 0; k < 4; k++) {
            float i = t * w + x + float(k);
            float r = floor(i / (w / 2.0));
            vec3 c = at(2.0 * (i - r * w / 2.0) + 1.0, 2.0 * r + 1.0);
            o[k] = v ? cr(c) : cb(c);
          }
        }
        bytes = o;
      }`,
    depthTest: false,
    depthWrite: false,
  })
  private readonly quad = new FullScreenQuad(this.material)

  convert(renderer: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget): void {
    this.uniforms.picture.value = from.texture
    this.uniforms.size.value.set(from.width, from.height)
    renderer.setRenderTarget(to)
    this.quad.render(renderer)
  }
}
