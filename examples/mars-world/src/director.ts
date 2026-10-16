import * as THREE from 'three'
import type { Point } from './live/route.js'
import { routes, type WorldDevice } from './live/world.js'

/**
 * The follow camera, like a broadcast camera at a football match: it keeps the overview's heading
 * and never cuts, only glides nearer, further and across, so every device at work stays in frame
 * with the place it is heading for. A device stays in frame a few seconds after its call ends, so
 * calls one after another do not pump the view in and out; with nothing at work it frames every
 * device. Nearer in, it looks down more steeply, over the buildings in front.
 */
const VIEW = {
  /** The overview's field of view, in degrees. */
  fov: 50,
  /** The overview's heading: from the south, a little west of north. */
  yaw: Math.atan2(6.5, -47.5),
  /** Looking down this steeply from far out, and this steeply at its nearest, in radians. */
  pitch: { far: 0.43, near: 0.7 },
  /** Never nearer than this to what it frames, nor further than this, in metres. */
  near: 30,
  far: 120,
  /** The distance where the pitch has eased to the far one. */
  wide: 55,
  /** Room left round each framed point, in metres, and the share of the frame it may fill. */
  room: 4,
  fill: 0.8,
  /** A device stays in frame this long after its call ends, in seconds. */
  linger: 5,
  /** How long the view takes to settle on a new framing, in seconds. */
  ease: 1.4,
}

/** Moves `value` toward `goal` like a critically damped spring: no jolt as it starts or stops. */
function damp(state: { v: number }, value: number, goal: number, dt: number): number {
  const omega = 2 / VIEW.ease
  const x = omega * dt
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = value - goal
  const temp = (state.v + omega * change) * dt
  state.v = (state.v - omega * temp) * e
  return goal + (change + temp) * e
}

export interface Director {
  /** Whether it drives the main camera; number keys switch it off, T back on. */
  on: boolean
  update(dt: number): void
}

export function buildDirector(
  camera: THREE.PerspectiveCamera,
  anchors: Map<string, THREE.Object3D>,
  devices: readonly WorldDevice[] | undefined,
  /** Where something happens now, such as an event's place. */
  happening: () => Point[],
): Director {
  const lastBusy = new Map<string, number>()
  const at = new THREE.Vector3()
  const points: THREE.Vector3[] = []
  const centre = new THREE.Vector3()
  const goal = { x: 0, y: 0, z: 0, dist: VIEW.wide }
  const now = { x: 0, y: 0, z: 0, dist: VIEW.wide }
  const speed = { x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, dist: { v: 0 } }
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const rel = new THREE.Vector3()
  let started = false

  const pitchAt = (dist: number) => {
    const k = THREE.MathUtils.clamp((dist - VIEW.near) / (VIEW.wide - VIEW.near), 0, 1)
    return THREE.MathUtils.lerp(VIEW.pitch.near, VIEW.pitch.far, k)
  }
  const axes = (pitch: number) => {
    forward.set(Math.sin(VIEW.yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(VIEW.yaw) * Math.cos(pitch))
    right.crossVectors(forward, camera.up).normalize()
    up.crossVectors(right, forward)
  }

  /** What to frame now: the devices at work or lately at work, where they head, and events. */
  const gather = (t: number) => {
    points.length = 0
    const add = (x: number, y: number, z: number) => points.push(new THREE.Vector3(x, y, z))
    for (const d of devices ?? []) {
      const alarm = [...d.alerts.values()].some((a) => a.level === 'bad')
      if (d.current || alarm) lastBusy.set(d.id, t)
      const since = lastBusy.get(d.id)
      if (since === undefined || t - since > VIEW.linger) continue
      anchors.get(d.id)?.getWorldPosition(at)
      add(at.x, at.y, at.z)
      const route = d.current ? routes.get(d.id) : undefined
      const end = route?.points[route.points.length - 1]
      if (end) add(end.x, at.y, end.z)
    }
    for (const p of happening()) add(p.x, 0, p.z)
    // Nothing going on: every device.
    if (points.length === 0)
      for (const a of anchors.values()) {
        a.getWorldPosition(at)
        add(at.x, at.y, at.z)
      }
  }

  /** The centre and distance that keep every point in frame. */
  const frame = () => {
    centre.set(0, 0, 0)
    const box = new THREE.Box3().setFromPoints(points)
    box.getCenter(centre)
    // The distance depends on the pitch and the pitch on the distance: twice round settles it.
    let dist = goal.dist
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * VIEW.fill
    const tanH = tanV * camera.aspect
    for (let i = 0; i < 2; i++) {
      axes(pitchAt(dist))
      let need = VIEW.near
      for (const p of points) {
        rel.subVectors(p, centre)
        const x = Math.abs(rel.dot(right)) + VIEW.room
        const y = Math.abs(rel.dot(up)) + VIEW.room
        const z = rel.dot(forward)
        need = Math.max(need, x / tanH - z, y / tanV - z)
      }
      dist = Math.min(VIEW.far, need)
    }
    goal.x = centre.x
    goal.y = centre.y
    goal.z = centre.z
    goal.dist = dist
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
        camera.fov = VIEW.fov
        camera.updateProjectionMatrix()
        Object.assign(now, goal)
        for (const s of Object.values(speed)) s.v = 0
        started = true
      } else {
        const step = Math.min(dt, 0.1)
        now.x = damp(speed.x, now.x, goal.x, step)
        now.y = damp(speed.y, now.y, goal.y, step)
        now.z = damp(speed.z, now.z, goal.z, step)
        now.dist = damp(speed.dist, now.dist, goal.dist, step)
      }
      axes(pitchAt(now.dist))
      camera.position.set(now.x, now.y, now.z).addScaledVector(forward, -now.dist)
      camera.lookAt(now.x, now.y, now.z)
    },
  }
  return director
}
