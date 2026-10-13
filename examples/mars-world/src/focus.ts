import * as THREE from 'three'
import { LAYOUT } from './base.js'
import type { Point } from './live/route.js'
import { routes, type WorldDevice } from './live/world.js'
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

/** A route line: how wide, how high over the ground, its dashes and gaps (m), how fast they march (m/s). */
const ROUTE = { width: 0.55, lift: 0.07, dash: 1.1, gap: 0.7, march: 1.6, step: 0.5, samples: 1200 }
/** Raised slabs a route crosses, so its line stays on top: the dock, the hopper pad, the landing pad. */
const SLABS = [
  { x: LAYOUT.dock[0], z: LAYOUT.dock[1], w: 2.3, d: 3.5, top: 0.08 },
  { x: LAYOUT.hopperPad[0], z: LAYOUT.hopperPad[1], r: 2.75, top: 0.12 },
  { x: LAYOUT.landingPad[0], z: LAYOUT.landingPad[1], r: 9.4, top: 0.2 },
]
/** The top of whatever is underfoot at (x, z): the ground, or a slab on it. */
function surface(x: number, z: number): number {
  for (const s of SLABS) {
    const on =
      'r' in s ? Math.hypot(x - s.x, z - s.z) < s.r : Math.abs(x - s.x) < s.w && Math.abs(z - s.z) < s.d
    if (on) return heightAt(x, z) + s.top
  }
  return heightAt(x, z)
}

/**
 * A dashed line on the ground along a route, as one ribbon whose vertices know how far along the
 * route they lie: the shader leaves out what the device has passed and marches the dashes toward
 * the destination, so a route is built once and only a number changes as the device moves.
 */
function routeLine(): {
  mesh: THREE.Mesh
  uniforms: {
    color: { value: THREE.Color }
    from: { value: number }
    time: { value: number }
    opacity: { value: number }
  }
  /** Lays the ribbon from `start` through `points`, and fills `along` with how far along each point lies. */
  lay(start: Point, points: Point[], along: number[]): void
} {
  const n = ROUTE.samples
  const position = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3)
  const distance = new THREE.BufferAttribute(new Float32Array(n * 2), 1)
  const side = new THREE.BufferAttribute(new Float32Array(n * 2), 1)
  for (let i = 0; i < n * 2; i++) side.setX(i, i % 2 ? 1 : -1)
  const index: number[] = []
  for (let i = 0; i < n - 1; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('along', distance)
  geometry.setAttribute('side', side)
  geometry.setIndex(index)
  const uniforms = {
    color: { value: new THREE.Color() },
    from: { value: 0 },
    time: { value: 0 },
    opacity: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: `attribute float along; attribute float side;
      varying float vAlong; varying float vSide;
      void main() {
        vAlong = along;
        vSide = side;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 color; uniform float from; uniform float time; uniform float opacity;
      varying float vAlong; varying float vSide;
      void main() {
        // Only the part still ahead, faded in over a metre or so in front of the device.
        float ahead = vAlong - from;
        if (ahead < 0.0) discard;
        // Dashes marching toward the destination.
        if (fract((vAlong - time * ${ROUTE.march.toFixed(2)}) / ${(ROUTE.dash + ROUTE.gap).toFixed(2)}) > ${(ROUTE.dash / (ROUTE.dash + ROUTE.gap)).toFixed(3)}) discard;
        float a = opacity * smoothstep(0.0, 1.5, ahead) * (1.0 - smoothstep(0.6, 1.0, abs(vSide)));
        gl_FragColor = vec4(color, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.layers.set(FOCUS_LAYER)
  mesh.frustumCulled = false
  mesh.visible = false
  const half = ROUTE.width / 2
  return {
    mesh,
    uniforms,
    lay(start, points, along) {
      let count = 0
      let walked = 0
      let from = start
      along.length = 0
      const put = (x: number, z: number, nx: number, nz: number, at: number) => {
        if (count >= n) return
        for (const k of [-1, 1]) {
          const px = x + nx * half * k
          const pz = z + nz * half * k
          position.setXYZ(count * 2 + (k + 1) / 2, px, surface(px, pz) + ROUTE.lift, pz)
          distance.setX(count * 2 + (k + 1) / 2, at)
        }
        count++
      }
      for (const to of points) {
        const dx = to.x - from.x
        const dz = to.z - from.z
        const length = Math.hypot(dx, dz)
        if (length > 0.01) {
          const nx = -dz / length
          const nz = dx / length
          const steps = Math.ceil(length / ROUTE.step)
          for (let i = count ? 1 : 0; i <= steps; i++)
            put(from.x + (dx * i) / steps, from.z + (dz * i) / steps, nx, nz, walked + (length * i) / steps)
        }
        walked += length
        along.push(walked)
        from = to
      }
      geometry.setDrawRange(0, Math.max(0, count - 1) * 6)
      position.needsUpdate = true
      distance.needsUpdate = true
    },
  }
}

/**
 * What draws the eye to the devices at work in the main view: a ring breathing on the ground under
 * each device while it runs a call, in its caller's colour; and for a call that moves it, its way
 * ahead on the ground as a dashed line to a small ring at the destination, shortening as it goes.
 * Drawn on the main view's layer only, and only while a call runs, so a base at rest costs nothing.
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
    // A device that moves gets a route line and a small ring for where it is going.
    const way = place.at ? undefined : routeLine()
    const goal = way ? new THREE.Mesh(geometry, material) : undefined
    if (way && goal) {
      goal.layers.set(FOCUS_LAYER)
      goal.scale.setScalar(1.3)
      goal.visible = false
      scene.add(way.mesh, goal)
    }
    return [
      {
        device,
        anchor,
        place,
        mesh,
        material,
        fade: 0,
        way,
        goal,
        route: undefined as { points: Point[]; next: number } | undefined,
        along: [] as number[],
        routeFade: 0,
      },
    ]
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
      for (const ring of rings) {
        const { way, goal } = ring
        if (!way || !goal) continue
        // The route of the call that moves the device, laid when it sets off or plans anew.
        const route = ring.device.current ? routes.get(ring.device.id) : undefined
        if (route && route !== ring.route) {
          ring.anchor.getWorldPosition(at)
          way.lay({ x: at.x, z: at.z }, route.points, ring.along)
          const end = route.points[route.points.length - 1] as Point
          goal.position.set(end.x, surface(end.x, end.z) + ROUTE.lift + 0.02, end.z)
        }
        if (route) ring.route = route
        ring.routeFade = route ? Math.min(1, ring.routeFade + dt * 5) : Math.max(0, ring.routeFade - dt * 4)
        way.mesh.visible = goal.visible = ring.routeFade > 0 && ring.route !== undefined
        if (!way.mesh.visible || !ring.route) {
          ring.route = undefined
          continue
        }
        // How far along it the device is: the legs behind it, and how much of this one it has done.
        const { points, next } = ring.route
        const to = points[next] as Point
        const legStart = next > 0 ? (ring.along[next - 1] ?? 0) : 0
        const leg = (ring.along[next] ?? 0) - legStart
        ring.anchor.getWorldPosition(at)
        const left = Math.hypot(to.x - at.x, to.z - at.z)
        way.uniforms.from.value = legStart + Math.max(0, Math.min(leg, leg - left))
        way.uniforms.time.value = t
        way.uniforms.color.value.copy(ring.material.color)
        way.uniforms.opacity.value = 0.9 * ring.routeFade
      }
    },
  }
}
