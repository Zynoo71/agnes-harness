import * as THREE from 'three'
import type { Trip, WorldDevice } from './live/world.js'

/** The main view's own layer: what only it draws, never a device's camera. */
export const FOCUS_LAYER = 1

/** Who made a call, in the tags' and the activity list's colours: Jev (the DM), the LLM, anyone else. */
const CALLER = {
  DM: new THREE.Color('#86bba6'),
  LLM: new THREE.Color('#8ea2ff'),
  other: new THREE.Color('#f6e7d2'),
}
export const callerColour = (caller: string | undefined): THREE.Color =>
  caller === 'DM' ? CALLER.DM : caller === 'LLM' ? CALLER.LLM : CALLER.other

/**
 * How wide each device's ring is, in metres: its footprint and a margin, across (x, east) and, for
 * a long fixture, along (y, north).
 */
const RINGS: Record<string, { r: number; ry?: number }> = {
  'host-01': { r: 0.55 },
  'menu-01': { r: 0.7 },
  'floor-01': { r: 2.2, ry: 0.6 },
  'prep-01': { r: 0.5 },
  'wok-01': { r: 1.1, ry: 0.9 },
  'stove-01': { r: 1.2, ry: 0.9 },
  'arm-01': { r: 0.7 },
  'bar-01': { r: 0.6 },
  'runner-01': { r: 0.58 },
  'supplies-01': { r: 1.1, ry: 0.5 },
  'cleaner-01': { r: 0.6 },
  'play-01': { r: 0.5 },
  'room-01': { r: 0.6 },
  'room-02': { r: 0.6 },
  'pos-01': { r: 1.45, ry: 0.65 },
  'cam-01': { r: 0.6 },
}
/** How high the rings lie over the floor: clear of the rugs. */
const LIFT = 0.03
/** A ring breathes in opacity once in this many seconds, between these two. */
const BREATH = { s: 1.2, low: 0.35, high: 0.8 }

/** A flat band of a unit ring: bright at its rim, fading inward and just past it, in vertex alpha. */
function ringGeometry(): THREE.BufferGeometry {
  const radii = [0.6, 0.85, 1, 1.08]
  const alphas = [0, 0.6, 1, 0]
  const segments = 72
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    for (const [j, r] of radii.entries()) {
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r)
      colors.push(1, 1, 1, alphas[j] as number)
    }
  }
  const n = radii.length
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < n - 1; j++) {
      const p = i * n + j
      // Wound to face up, toward the view.
      index.push(p, p + n, p + 1, p + 1, p + n, p + n + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  g.setIndex(index)
  return g
}

/**
 * A see-through glow in a caller's colour, untouched by the scene's light. Blended over the floor
 * rather than added to it: added light washes out to white on the pale parquet.
 */
const glow = () =>
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })

/** A route's dashes, in metres: long, apart and wide; at most this many drawn. */
const DASH = { on: 0.3, off: 0.18, width: 0.1, most: 160 }
/** How high a route lies, just over the rings, and how wide the ring at its end is. */
const ROUTE_LIFT = 0.035
const END_R = 0.32

/**
 * The way a robot still has to go on a call: dashes along its planned path from where it is to where
 * it is going, in its caller's colour, and a small ring where it ends. The dashes are counted back
 * from the end, so they keep still on the floor while the part behind the robot drops away.
 */
function buildRoute(scene: THREE.Scene, trip: Trip, ring: THREE.BufferGeometry) {
  const positions = new Float32Array(DASH.most * 6 * 3)
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
  const geometry = new THREE.BufferGeometry().setAttribute('position', attribute)
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  })
  const line = new THREE.Mesh(geometry, material)
  // Its points change every frame, so the bounds three.js would cull by never fit.
  line.frustumCulled = false
  const endMaterial = glow()
  endMaterial.opacity = 0.9
  const end = new THREE.Mesh(ring, endMaterial)
  end.scale.setScalar(END_R)
  for (const m of [line, end]) {
    m.layers.set(FOCUS_LAYER)
    m.renderOrder = 3
    m.visible = false
    scene.add(m)
  }
  /** The path last drawn, and the segment of it the robot is on: it only moves forward. */
  let drawn: Trip['path']
  let seg = 0
  let count = 0
  /** Squared distance from (x, z) to the segment a–b of the path. */
  const away = (a: number, x: number, z: number) => {
    const p = drawn as NonNullable<Trip['path']>
    const { x: ax, z: az } = p[a] as { x: number; z: number }
    const { x: bx, z: bz } = p[a + 1] as { x: number; z: number }
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2
  }
  /** Where the next vertex goes in `positions`. */
  let k = 0
  const vertex = (vx: number, vz: number) => {
    positions[k++] = vx
    positions[k++] = ROUTE_LIFT
    positions[k++] = vz
  }
  /** Adds the dash from (ax, az) to (bx, bz), as two triangles flat on the floor. */
  const quad = (ax: number, az: number, bx: number, bz: number) => {
    if (count >= DASH.most) return
    const len = Math.hypot(bx - ax, bz - az) || 1
    const nx = (-(bz - az) / len) * (DASH.width / 2)
    const nz = ((bx - ax) / len) * (DASH.width / 2)
    k = count * 18
    // (a+, b+, a−) and (a−, b+, b−), wound to face up.
    vertex(ax + nx, az + nz)
    vertex(bx + nx, bz + nz)
    vertex(ax - nx, az - nz)
    vertex(ax - nx, az - nz)
    vertex(bx + nx, bz + nz)
    vertex(bx - nx, bz - nz)
    count += 1
  }
  return {
    update(colour: THREE.Color) {
      const path = trip.path
      line.visible = end.visible = path !== undefined && path.length > 0
      if (!path?.length) {
        drawn = undefined
        return
      }
      if (path !== drawn) {
        drawn = path
        seg = 0
      }
      const { x, z } = trip.body.object.position
      while (seg < path.length - 2 && away(seg + 1, x, z) <= away(seg, x, z)) seg += 1
      // From the robot along the rest of the path: first its length, then the dashes along it.
      const last = path[path.length - 1] as { x: number; z: number }
      let total = 0
      let px = x
      let pz = z
      for (let k = Math.min(seg + 1, path.length - 1); k < path.length; k++) {
        const q = path[k] as { x: number; z: number }
        total += Math.hypot(q.x - px, q.z - pz)
        px = q.x
        pz = q.z
      }
      count = 0
      const period = DASH.on + DASH.off
      let along = 0
      px = x
      pz = z
      for (let k = Math.min(seg + 1, path.length - 1); k < path.length; k++) {
        const q = path[k] as { x: number; z: number }
        const len = Math.hypot(q.x - px, q.z - pz)
        if (len > 1e-6) {
          // Dashes end at total − n·period; draw the part of each that falls on this segment.
          const from = total - along - len
          const to = total - along
          for (let n = Math.max(0, Math.floor(from / period)); n * period < to; n++) {
            const e0 = Math.max(from, n * period)
            const e1 = Math.min(to, n * period + DASH.on)
            if (e1 <= e0) continue
            // e counts back from the end; on this segment it falls from `to` at p to `from` at q.
            const f0 = (to - e1) / len
            const f1 = (to - e0) / len
            quad(px + (q.x - px) * f0, pz + (q.z - pz) * f0, px + (q.x - px) * f1, pz + (q.z - pz) * f1)
          }
        }
        along += len
        px = q.x
        pz = q.z
      }
      geometry.setDrawRange(0, count * 6)
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, count * 18)
      attribute.needsUpdate = true
      material.color.copy(colour)
      endMaterial.color.copy(colour)
      end.position.set(last.x, ROUTE_LIFT, last.z)
    },
  }
}

/**
 * What draws the eye to the devices at work in the main view: a ring breathing on the floor under
 * each device while it runs a call, and the way a robot still has to go, both in the caller's
 * colour. Drawn on the main view's layer only, and only while a call runs, so a quiet restaurant
 * costs nothing.
 */
export function buildFocus(
  scene: THREE.Scene,
  anchors: Map<string, THREE.Object3D>,
  devices: WorldDevice[],
  trips: Trip[],
): { update(t: number): void } {
  const geometry = ringGeometry()
  const rings = devices.flatMap((device) => {
    const size = RINGS[device.id]
    const anchor = anchors.get(device.id)
    if (!size || !anchor) return []
    const material = glow()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.layers.set(FOCUS_LAYER)
    // Plan north is the scene's −z; the ring is symmetric, so the sign does not matter.
    mesh.scale.set(size.r, 1, size.ry ?? size.r)
    mesh.renderOrder = 2
    mesh.visible = false
    scene.add(mesh)
    return [{ device, anchor, mesh, material, fade: 0 }]
  })
  const routes = trips.map((trip) => ({ trip, route: buildRoute(scene, trip, geometry) }))
  const at = new THREE.Vector3()
  let last = 0
  return {
    update(t) {
      const dt = Math.min(0.1, t - last)
      last = t
      const k = 0.5 - 0.5 * Math.cos((t / BREATH.s) * Math.PI * 2)
      const breath = BREATH.low + (BREATH.high - BREATH.low) * k
      for (const ring of rings) {
        const a = ring.device.current
        // In quickly when a call starts, out quickly once it ends, in the caller's colour.
        if (a) ring.material.color.copy(callerColour(a.caller))
        ring.fade = a ? Math.min(1, ring.fade + dt * 5) : Math.max(0, ring.fade - dt * 4)
        ring.mesh.visible = ring.fade > 0
        if (!ring.mesh.visible) continue
        ring.material.opacity = ring.fade * breath
        ring.anchor.getWorldPosition(at)
        ring.mesh.position.set(at.x, LIFT, at.z)
      }
      for (const { trip, route } of routes) route.update(callerColour(trip.caller))
    },
  }
}
