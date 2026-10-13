import * as THREE from 'three'
import type { WorldDevice } from './live/world.js'

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

/**
 * What draws the eye to the devices at work in the main view: a ring breathing on the floor under
 * each device while it runs a call, in its caller's colour. Drawn on the main view's layer only, and
 * only while a call runs, so a quiet restaurant costs nothing.
 */
export function buildFocus(
  scene: THREE.Scene,
  anchors: Map<string, THREE.Object3D>,
  devices: WorldDevice[],
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
    },
  }
}
