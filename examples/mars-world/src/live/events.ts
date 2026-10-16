import * as THREE from 'three'
import { canvasTexture, meshOf, model } from '../assets.js'
import { LAYOUT } from '../base.js'
import { heightAt, OBSTACLES, type Obstacle, UNUSUAL_ROCK } from '../terrain.js'
import { AREAS } from './hopper.js'
import { FINDINGS } from './lab.js'
import type { Point } from './route.js'
import { every, nextFrame, type World } from './world.js'

/**
 * What can happen to Agnes Base on its own: each event's parameters and their ranges (numbers as
 * [min, max], choices as a list), whether it is severe, and what it does.
 */
export const CATALOG = {
  dust_storm: {
    severe: true,
    params: { intensity: [0.5, 1], minutes: [3, 8] },
    about:
      'wind and dust build over a few minutes, then die down: weather-01 goes to watch, then warning; the sky darkens, panels left deployed gather dust fast and produce less, the hopper may not fly',
  },
  suit_leak: {
    severe: true,
    params: {},
    about:
      "the astronaut's suit leaks: its pressure falls, oxygen goes ten times as fast and they cannot walk; it lasts until they are back in the habitat",
  },
  dust_devil: {
    severe: false,
    params: { strength: [10, 30] },
    about:
      'a whirlwind of dust crosses the solar array and dusts the panels (strength: percent of light blocked)',
  },
  meteorite: {
    severe: false,
    params: { area: Object.keys(AREAS) },
    about:
      'a small meteorite falls with a flash and a puff of dust and lies there as a new unusual rock that a hopper survey of the area finds',
  },
  rockfall: {
    severe: false,
    params: {},
    about:
      "a boulder about 1.8 m across tumbles onto the way: 8 m ahead of the rover on its track when it is driving, otherwise on the way from the dock to the west field's unusual rock; the rover stops before it, and Monolith can push it aside",
  },
} as const

export type EventKind = keyof typeof CATALOG
export type Params = Record<string, number | string>

/** A banner line in each language the page speaks. */
export interface Headline {
  en: string
  zh: string
}

/** The banner line for an event when nobody wrote one. */
export const HEADLINES: Record<EventKind, (p: Params) => Headline> = {
  dust_storm: (p) =>
    Number(p.intensity) > 0.8
      ? { en: 'A strong dust storm is rolling in', zh: '强沙尘暴正在逼近' }
      : { en: 'A dust storm is building', zh: '沙尘暴正在形成' },
  suit_leak: () => ({ en: "The astronaut's suit is leaking", zh: '宇航服漏气' }),
  dust_devil: () => ({ en: 'A dust devil is crossing the solar array', zh: '尘卷风正扫过太阳能板' }),
  meteorite: (p) => ({
    en: `A meteorite fell in the ${p.area}`,
    zh: `一颗陨石落在${p.area === 'east dunes' ? '东边沙丘' : '西边野外'}`,
  }),
  rockfall: () => ({ en: 'A boulder tumbled onto the way', zh: '一块大石头滚到了路上' }),
}

export interface Happening {
  id: number
  kind: EventKind
  headline: Headline
  params: Params
  /** Who started it: a person on the page or the seeded director. */
  by: string
  /** performance.now() when it started, and when it ends (undefined: when it is dealt with). */
  start: number
  end: number | undefined
  /** The Mars time it started, `Sol 1 · 09:12 LMST`. */
  at: string
  /** Where on the ground it happens, when it happens in one place. */
  place?: Point
}

/** What the scene draws for events and for what devices do; main.ts fills it in. */
export interface Effects {
  meteor(at: Point): void
  devil(from: Point, to: Point, seconds: number): void
  /** A puff of dust thrown off a rock `up` metres above the ground at `at`, about `size` metres across. */
  puff(at: Point, up: number, size: number): void
  /**
   * A boulder of radius `r` at `at` bursting into dust and chunks that fly out and lie there as
   * rubble, none of them towards the headings (radians, as headingTo) in `clear`.
   */
  shatter(at: Point, r: number, clear: number[]): void
  /** A furrow in the sand from `a` to `b`, as Monolith writes; it stays until unmark or clear. */
  mark(a: Point, b: Point): void
  /** Smooths the sand: every furrow gone. */
  unmark(): void
  /** Ends whatever is drawn and takes away the rubble and the furrows. */
  clear(): void
}

/** Seconds a dust devil takes to cross the array; a meteorite's flash and dust; a boulder's fall. */
const DEVIL_S = 24
const METEOR_S = 8
const ROCKFALL_S = 6
/** A fallen boulder's width on the ground, in metres, and how far ahead of a driving rover it lands. */
const FALLEN = { across: 1.8, ahead: 8 }
/** The dust devil's way across the solar array, from the south-east to the north-west. */
const DEVIL_FROM = { x: 44, z: 36 }
const DEVIL_TO = { x: 2, z: 6 }

/** The world's events: running ones, the last ones, and the dust storm's strength now. */
export class Events {
  active: Happening[] = []
  /** Ended events, newest first. */
  past: Happening[] = []
  /** The storm's strength now, 0 (calm) to 1. */
  storm = 0
  /** Hears every event as it starts and ends. */
  readonly listeners: ((h: Happening, phase: 'start' | 'end') => void)[] = []
  private count = 0
  /** Dust devils that have reached the panels. */
  private readonly dusted = new WeakSet<Happening>()
  private rocks: Obstacle[] = []

  constructor(
    private readonly world: World,
    private readonly log: (line: string) => void,
  ) {
    every(250, () => this.tick(), log)
  }

  /** Starts an event, or says why it cannot happen now. */
  start(kind: EventKind, params: Params, headline: Headline, by: string): Happening | string {
    const world = this.world
    if (this.active.some((h) => h.kind === kind)) return `a ${kind.replace('_', ' ')} is already happening`
    if (kind === 'suit_leak' && !['working', 'standing'].includes(world.astronaut))
      return 'the astronaut is not out on foot'
    const now = performance.now()
    const h: Happening = {
      id: ++this.count,
      kind,
      headline,
      params,
      by,
      start: now,
      end: undefined,
      at: world.clock.label(),
    }
    if (kind === 'dust_storm') h.end = now + Number(params.minutes) * 60_000
    if (kind === 'suit_leak') world.suitLeak = true
    if (kind === 'dust_devil') {
      h.end = now + DEVIL_S * 1000
      h.place = DEVIL_FROM
      world.effects?.devil(DEVIL_FROM, DEVIL_TO, DEVIL_S)
    }
    if (kind === 'meteorite') {
      h.end = now + METEOR_S * 1000
      const at = this.landing(String(params.area))
      h.place = at
      world.effects?.meteor(at)
      // The rock lies there once the flash has gone.
      setTimeout(() => void this.addRock(at, h), 900)
    }
    if (kind === 'rockfall') {
      h.end = now + ROCKFALL_S * 1000
      h.place = this.fallPlace()
      void this.addBoulder(h.place)
    }
    this.active.push(h)
    this.log(`event ${kind} by ${by}: ${headline.en} ${JSON.stringify(params)}`)
    for (const listen of this.listeners) listen(h, 'start')
    return h
  }

  /** Ends an event now, for a person on the page: a leaking suit is mended, a storm drops. */
  end(h: Happening): void {
    if (h.kind === 'suit_leak') this.world.suitLeak = false
    else h.end = performance.now()
    this.tick()
  }

  /** Seconds an event has left, or undefined when it lasts until it is dealt with. */
  remaining(h: Happening, now = performance.now()): number | undefined {
    return h.end === undefined ? undefined : Math.max(0, (h.end - now) / 1000)
  }

  /** Back to a calm base: no events, no meteorites. */
  reset(): void {
    this.active = []
    this.past = []
    this.storm = 0
    for (const rock of this.rocks) {
      rock.object.removeFromParent()
      // A boulder Monolith broke is out of OBSTACLES already.
      if (OBSTACLES.includes(rock)) OBSTACLES.splice(OBSTACLES.indexOf(rock), 1)
      delete FINDINGS[rock.id]
    }
    this.rocks = []
  }

  private tick(): void {
    const now = performance.now()
    const world = this.world
    // The storm builds over its first 30 %, blows, and dies down over its last 30 %.
    const storm = this.active.find((h) => h.kind === 'dust_storm')
    if (storm && storm.end !== undefined) {
      const k = (now - storm.start) / (storm.end - storm.start)
      const envelope = THREE.MathUtils.smoothstep(k, 0, 0.3) * (1 - THREE.MathUtils.smoothstep(k, 0.7, 1))
      this.storm = Number(storm.params.intensity) * envelope
    } else this.storm = 0
    // Halfway across, the dust devil reaches the panels.
    const devil = this.active.find((h) => h.kind === 'dust_devil')
    if (devil && !this.dusted.has(devil) && now - devil.start > (DEVIL_S * 1000) / 2) {
      this.dusted.add(devil)
      world.dustPanels?.(Number(devil.params.strength))
    }
    for (const h of [...this.active]) {
      const over = h.kind === 'suit_leak' ? !world.suitLeak : h.end !== undefined && now >= h.end
      if (!over) continue
      this.active.splice(this.active.indexOf(h), 1)
      this.past.unshift(h)
      this.past.length = Math.min(this.past.length, 10)
      for (const listen of this.listeners) listen(h, 'end')
    }
  }

  /**
   * Where a boulder falls: ahead of the rover on the leg it drives, when that leg is long enough;
   * otherwise on the way from the dock to the unusual rock, at the first spot clear of other rocks.
   */
  private fallPlace(): Point {
    const rover = this.world.things().find((t) => t.id === 'rover-01')
    const leg = this.world.rover.leg
    if (rover && leg) {
      const d = Math.hypot(leg.x - rover.x, leg.z - rover.z)
      if (d > FALLEN.ahead + 3) {
        const k = FALLEN.ahead / d
        return { x: rover.x + (leg.x - rover.x) * k, z: rover.z + (leg.z - rover.z) * k }
      }
    }
    const [x0, z0] = LAYOUT.dock
    for (let k = 0.3; k < 0.9; k += 0.05) {
      const p = { x: x0 + (UNUSUAL_ROCK.x - x0) * k, z: z0 + (UNUSUAL_ROCK.z - z0) * k }
      if (OBSTACLES.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > o.r + FALLEN.across)) return p
    }
    return { x: x0 + (UNUSUAL_ROCK.x - x0) * 0.45, z: z0 + (UNUSUAL_ROCK.z - z0) * 0.45 }
  }

  /** A boulder that tumbles down onto `at` and lies there, in the way, until something moves it. */
  private async addBoulder(at: Point): Promise<void> {
    const rock = await model('namaqualand_boulder_02')
    const boulder = rock.clone()
    boulder.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.color = new THREE.Color(1, 0.72, 0.6)
        mesh.material = mat
      }
    })
    // The scan is a long, low slab; stood taller, it reads as a boulder in the way.
    const size = new THREE.Box3().setFromObject(boulder).getSize(new THREE.Vector3())
    const s = FALLEN.across / size.x
    boulder.scale.set(s, s * 1.8, s * 1.3)
    // Held at its middle, so it tumbles and rolls about its centre, not the scan's base.
    const box = new THREE.Box3().setFromObject(boulder)
    boulder.position.sub(box.getCenter(new THREE.Vector3()))
    const holder = new THREE.Group().add(boulder)
    const ground = heightAt(at.x, at.z) - 0.1 + box.getSize(size).y / 2
    holder.position.set(at.x, ground + 9, at.z)
    this.world.scene.add(holder)
    const id = `boulder-${OBSTACLES.filter((o) => o.label === 'boulder').length + 1}`
    const obstacle: Obstacle = {
      id,
      label: 'boulder',
      x: at.x,
      z: at.z,
      r: FALLEN.across / 2,
      object: holder,
    }
    // It drops and tumbles for a second on the motion clock, which beats in a hidden tab too, then
    // lies in the way.
    const start = performance.now()
    for (let k = 0; k < 1; ) {
      await nextFrame()
      k = Math.min(1, (performance.now() - start) / 1000)
      holder.position.y = ground + 9 * (1 - k * k)
      holder.rotation.set(k * Math.PI * 2, k * 1.1, 0)
    }
    OBSTACLES.push(obstacle)
    this.rocks.push(obstacle)
  }

  /** Somewhere in `area` clear of the rocks already there. */
  private landing(area: string): Point {
    const a = AREAS[area] ?? (AREAS['west field'] as Point & { r: number })
    for (let i = 0; ; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * a.r * 0.8
      const p = { x: a.x + Math.cos(angle) * r, z: a.z + Math.sin(angle) * r }
      const clear = OBSTACLES.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > o.r + 4)
      const awayFromBase = Math.hypot(p.x - LAYOUT.field[0], p.z - LAYOUT.field[1]) > 6
      if ((clear && awayFromBase) || i > 40) return p
    }
  }

  private async addRock(at: Point, h: Happening): Promise<void> {
    const id = `rock-${OBSTACLES.filter((o) => o.label === 'unusual rock').length + 1}`
    const group = new THREE.Group()
    group.position.set(at.x, 0, at.z)
    // A dark, metallic stone with a fusion crust, half sunk in the ground.
    const rock = new THREE.Mesh(
      (await meshOf('moon_rock_05')).geometry,
      new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: 0.3, metalness: 0.7 }),
    )
    // The same pebble scan as rock-1, scaled to a stone about 0.65 m across.
    rock.scale.set(9, 7, 9.5)
    rock.rotation.y = Math.random() * Math.PI * 2
    rock.position.y = heightAt(at.x, at.z) - 0.1
    rock.castShadow = true
    rock.receiveShadow = true
    // Around it, the ground it threw out: a dark splash that follows the ground's shape.
    const splash = new THREE.PlaneGeometry(6, 6, 8, 8).rotateX(-Math.PI / 2)
    const pos = splash.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(at.x + pos.getX(i), at.z + pos.getZ(i)) + 0.03)
    group.add(
      rock,
      new THREE.Mesh(
        splash,
        new THREE.MeshStandardMaterial({
          map: SPLASH(),
          transparent: true,
          depthWrite: false,
          roughness: 1,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      ),
    )
    this.world.scene.add(group)
    const size = new THREE.Box3().setFromObject(rock).getSize(new THREE.Vector3())
    const obstacle: Obstacle = {
      id,
      label: 'unusual rock',
      x: at.x,
      z: at.z,
      r: Math.max(size.x, size.z) / 2,
      object: group,
    }
    OBSTACLES.push(obstacle)
    this.rocks.push(obstacle)
    FINDINGS[id] = {
      minerals: { kamacite: 62, taenite: 21, troilite: 9, schreibersite: 4, other: 4 },
      verdict: `iron-nickel meteorite with a fresh fusion crust: it fell ${h.at}; a candidate for return to Earth`,
    }
    h.params.rock = id
  }
}

/** The splash of darker ground a meteorite throws out: rays from the middle, fading out. */
const SPLASH = () =>
  canvasTexture(128, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
    grad.addColorStop(0, 'rgba(40,26,18,0.85)')
    grad.addColorStop(0.35, 'rgba(60,38,26,0.55)')
    grad.addColorStop(1, 'rgba(70,45,30,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, n, n)
    g.strokeStyle = 'rgba(45,30,20,0.35)'
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.3) * 0.1
      const r = n * (0.32 + 0.15 * Math.abs(Math.sin(i * 3.1)))
      g.lineWidth = 1 + (i % 3)
      g.beginPath()
      g.moveTo(n / 2 + Math.cos(a) * n * 0.12, n / 2 + Math.sin(a) * n * 0.12)
      g.lineTo(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r)
      g.stroke()
    }
  })
