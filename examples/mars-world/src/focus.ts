import * as THREE from 'three'
import type { WorldDevice } from './live/world.js'
import { heightAt } from './terrain.js'

/** The main view's own layer: what only it draws, never a device camera or the picture in picture. */
export const FOCUS_LAYER = 1

/** Who made a call, in the tags' and the activity list's colours: Jev (the DM), the LLM, anyone else. */
const CALLER = {
  DM: new THREE.Color('#86bba6'),
  LLM: new THREE.Color('#8ea2ff'),
  other: new THREE.Color('#f6e7d2'),
}
const callerColour = (caller: string | undefined) =>
  caller === 'DM' ? CALLER.DM : caller === 'LLM' ? CALLER.LLM : CALLER.other

/**
 * Where each device's ring lies, in metres: a fixed centre for a building or a mast, or under the
 * device itself as it moves; its radius across (x) and, for a long building, along (z).
 */
const RINGS: Record<string, { at?: [number, number]; r: number; rz?: number }> = {
  'habitat-01': { at: [0, 0], r: 12.4 },
  'airlock-01': { at: [0, 11.6], r: 3.2 },
  'suit-01': { r: 0.9 },
  'rover-01': { r: 2.6 },
  'hopper-01': { r: 2 },
  'monolith-01': { r: 1.2 },
  'lab-01': { at: [-24, 15.5], r: 3.8, rz: 5.2 },
  // Wide of the long greenhouse, so its south side shows from the overview, past the plinth.
  'greenhouse-01': { at: [18.5, -2], r: 10.6, rz: 6 },
  'power-01': { at: [11.5, 20], r: 3.6, rz: 2.2 },
  'weather-01': { at: [-4.5, -15], r: 1.5 },
  'comms-01': { at: [-13, -12], r: 2.4 },
  'cam-base': { at: [-4, 28], r: 1.4 },
}
/** How high a ring floats over the ground: clear of the pads' tops, so none hides under one. */
const LIFT = 0.25
/** The ring breathes in opacity once in this many seconds, between these two. */
const BREATH = { s: 1.2, low: 0.35, high: 0.8 }

/**
 * A flat band of a unit ring: bright at its rim, fading inward and just past it, in vertex alpha.
 */
function ringGeometry(): THREE.BufferGeometry {
  const radii = [0.78, 0.94, 1, 1.04]
  const alphas = [0, 0.45, 1, 0]
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
      index.push(p, p + n, p + 1, p + 1, p + n, p + n + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  g.setIndex(index)
  return g
}

/**
 * What draws the eye to the devices at work in the main view: a ring breathing on the ground under
 * each device while it runs a call, in its caller's colour. Drawn on the main view's layer only, and
 * only while a call runs, so a base at rest costs nothing.
 */
export function buildFocus(
  scene: THREE.Scene,
  anchors: Map<string, THREE.Object3D>,
  devices: WorldDevice[],
): { update(t: number, dt: number): void } {
  const geometry = ringGeometry()
  const rings = devices.flatMap((device) => {
    const place = RINGS[device.id]
    const anchor = anchors.get(device.id)
    if (!place || !anchor) return []
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.layers.set(FOCUS_LAYER)
    mesh.scale.set(place.r, 1, place.rz ?? place.r)
    mesh.visible = false
    if (place.at) {
      const [x, z] = place.at
      mesh.position.set(x, heightAt(x, z) + LIFT, z)
    }
    scene.add(mesh)
    return [{ device, anchor, place, mesh, material, fade: 0 }]
  })
  const at = new THREE.Vector3()
  return {
    update(t, dt) {
      const k = 0.5 - 0.5 * Math.cos((t / BREATH.s) * Math.PI * 2)
      const breath = BREATH.low + (BREATH.high - BREATH.low) * k
      for (const ring of rings) {
        const a = ring.device.current
        // In quickly when a call starts, out a little slower once it ends, in the caller's colour.
        if (a) ring.material.color.copy(callerColour(a.caller))
        ring.fade = a ? Math.min(1, ring.fade + dt * 5) : Math.max(0, ring.fade - dt * 3)
        ring.mesh.visible = ring.fade > 0 && ring.anchor.visible
        if (!ring.mesh.visible) continue
        ring.material.opacity = ring.fade * breath
        if (!ring.place.at) {
          // Under the device, on the ground, even while the hopper flies over it.
          ring.anchor.getWorldPosition(at)
          ring.mesh.position.set(at.x, heightAt(at.x, at.z) + LIFT, at.z)
        }
      }
    },
  }
}
