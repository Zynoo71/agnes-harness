import * as THREE from 'three'
import type { Trip, WorldDevice } from './live/world.js'
import { type IsoView, OVERVIEW } from './view.js'

/**
 * The follow camera, like a broadcast camera at a football match: the view keeps its way round and
 * glides across and in or out, so every device at work stays in frame with where it is heading. A
 * device stays in frame a few seconds after its call ends, so calls one after another do not pump
 * the view; with nothing at work, or work all over the room, it shows the whole room.
 */
const FOLLOW = {
  /** Never closer than this many metres of floor top to bottom. */
  near: 12,
  /** Room left round each framed point, in metres, and the share of the frame it may fill. */
  room: 1.6,
  fill: 0.85,
  /** A device stays in frame this long after its call ends, in seconds. */
  linger: 5,
  /** How long the view takes to settle on a new framing, in seconds. */
  ease: 1.4,
}
/** The view looks down this many degrees (as in view.ts). */
const ELEVATION = 38

/** Moves `value` toward `goal` like a critically damped spring: no jolt as it starts or stops. */
function damp(state: { v: number }, value: number, goal: number, dt: number): number {
  const omega = 2 / FOLLOW.ease
  const x = omega * dt
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = value - goal
  const temp = (state.v + omega * change) * dt
  state.v = (state.v - omega * temp) * e
  return goal + (change + temp) * e
}

export interface Director {
  /** Whether it moves the view; a number key, the wheel or a drag switch it off, T back on. */
  on: boolean
  update(dt: number): void
}

export function buildDirector(
  view: IsoView,
  anchors: Map<string, THREE.Object3D>,
  devices: readonly WorldDevice[] | undefined,
  trips: readonly Trip[],
): Director {
  const lastBusy = new Map<string, number>()
  const at = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const goal = { ...OVERVIEW }
  const now = { ...OVERVIEW }
  const speed = { x: { v: 0 }, y: { v: 0 }, span: { v: 0 } }
  /** Plan points (x east, y north) to keep in frame. */
  const points: { x: number; y: number }[] = []
  let started = false

  const gather = (t: number) => {
    points.length = 0
    for (const d of devices ?? []) {
      const alarm = [...d.alerts.values()].some((a) => a.level === 'bad')
      if (d.current || alarm) lastBusy.set(d.id, t)
      const since = lastBusy.get(d.id)
      if (since === undefined || t - since > FOLLOW.linger) continue
      const anchor = anchors.get(d.id)
      if (!anchor) continue
      anchor.getWorldPosition(at)
      points.push({ x: at.x, y: -at.z })
    }
    for (const trip of trips) {
      const end = trip.path?.[trip.path.length - 1]
      if (end) points.push({ x: end.x, y: -end.z })
    }
  }

  /** The framing that keeps every point in view, or the whole room. */
  const frame = () => {
    if (points.length === 0) {
      Object.assign(goal, OVERVIEW)
      return
    }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    // Screen right and up, in the scene, from the camera as it is turned.
    right.setFromMatrixColumn(view.camera.matrixWorld, 0)
    up.setFromMatrixColumn(view.camera.matrixWorld, 1)
    const aspect = (view.camera.right - view.camera.left) / (view.camera.top - view.camera.bottom)
    const sin = Math.sin(THREE.MathUtils.degToRad(ELEVATION))
    let span = FOLLOW.near
    for (const p of points) {
      // Plan y north is the scene's −z.
      const dx = p.x - cx
      const dz = -(p.y - cy)
      const sx = Math.abs(dx * right.x + dz * right.z) + FOLLOW.room
      const sy = Math.abs(dx * up.x + dz * up.z) + FOLLOW.room
      span = Math.max(span, (2 * sy) / (sin * FOLLOW.fill), (2 * sx) / (sin * aspect * FOLLOW.fill))
    }
    if (span >= OVERVIEW.span) Object.assign(goal, OVERVIEW)
    else Object.assign(goal, { x: cx, y: cy, span })
  }

  const director: Director = {
    on: true,
    update(dt) {
      if (!director.on) {
        started = false
        return
      }
      gather(performance.now() / 1000)
      frame()
      if (!started) {
        Object.assign(now, view.framing)
        for (const s of Object.values(speed)) s.v = 0
        started = true
      }
      const step = Math.min(dt, 0.1)
      now.x = damp(speed.x, now.x, goal.x, step)
      now.y = damp(speed.y, now.y, goal.y, step)
      now.span = damp(speed.span, now.span, goal.span, step)
      view.set(now)
    },
  }
  return director
}
