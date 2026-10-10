import * as THREE from 'three'
import { seeded } from './assets.js'
import { heightAt } from './terrain.js'

/**
 * The small things that make the base look lived in: the oxygen plant and its tanks, radiators,
 * cargo, cable runs, light masts, route stakes and rover tracks. All of it is static and built from
 * a handful of looks, so bake() turns it into a few draw calls.
 */

/** Ground the details stand on, in world coordinates: rocks keep clear of these circles. */
export const DETAIL_AREAS: { x: number; z: number; r: number }[] = [
  { x: 13, z: -17, r: 7 },
  { x: 7, z: -8.5, r: 3.5 },
  { x: -26, z: -2, r: 5 },
  { x: 18, z: 48, r: 3.5 },
  { x: 38, z: 30, r: 2.5 },
  { x: 34, z: -24, r: 5.5 },
  { x: -23, z: -8, r: 3 },
]

/** Footprints for the minimap: rectangles (centre, size) of the larger details. */
export const DETAIL_FOOTPRINTS: { x: number; z: number; w: number; d: number }[] = [
  { x: 13, z: -17, w: 10, d: 8 },
  { x: 7, z: -8.5, w: 4, d: 1.5 },
  { x: -26, z: -2, w: 6, d: 6 },
  { x: 34, z: -24, w: 6.4, d: 6.4 },
  { x: 18, z: -12.5, w: 2.6, d: 1.2 },
  { x: -23, z: -8, w: 3.4, d: 2.2 },
]

/** Light masts and the seismometer: small things that still block a rover. */
export const DETAIL_POSTS: [number, number][] = [
  [9, 13],
  [-11, -6],
  [30, -7],
  [-31, 7],
  [14, 36],
  [38, 30],
  [-16.5, -15.5],
]

const std = (color: number, roughness = 0.55, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })
const glow = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })

/** Shared looks, so the merged meshes stay few. */
const LOOK = {
  white: std(0xe6e1d8, 0.5, 0.05),
  metal: std(0x8d9298, 0.38, 0.75),
  dark: std(0x2b2d31, 0.5, 0.4),
  orange: std(0xd2671f, 0.55, 0.1),
  crate: std(0xb7aa92, 0.75, 0.05),
  radiator: std(0xf2efe8, 0.3, 0.2),
  lamp: glow(0xfff1d6, 3),
  stake: glow(0xff6a1a, 2.5),
  solar: std(0x0f1d38, 0.25, 0.5),
}

function box(w: number, h: number, d: number, look: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), look)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cylinder(
  r: number,
  h: number,
  look: THREE.Material,
  x: number,
  y: number,
  z: number,
  segments = 20,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), look)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function at(object: THREE.Object3D, x: number, z: number, turn = 0): THREE.Object3D {
  object.position.set(x, heightAt(x, z), z)
  object.rotation.y = turn
  return object
}

/** The oxygen plant: a boxy processor, three horizontal tanks on saddles and the pipes between. */
function oxygenPlant(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(3.2, 2.2, 2.4, LOOK.white, -3, 1.1, 0))
  g.add(box(3.4, 0.2, 2.6, LOOK.dark, -3, 0.1, 0))
  for (let i = 0; i < 6; i++) g.add(box(0.05, 0.6, 2.2, LOOK.metal, -4.4 + i * 0.55, 2.5, 0))
  g.add(box(0.3, 0.12, 0.05, glow(0x46ff7a, 4), -2.2, 1.7, 1.21))
  for (const [i, z] of [-2.2, 0, 2.2].entries()) {
    const tank = cylinder(0.85, 4.6, LOOK.white, 1.8, 1.25, z, 28)
    tank.rotation.z = Math.PI / 2
    g.add(tank)
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        LOOK.white,
      )
      cap.rotation.z = (-side * Math.PI) / 2
      cap.position.set(1.8 + side * 2.3, 1.25, z)
      cap.castShadow = cap.receiveShadow = true
      g.add(cap)
      g.add(box(0.25, 0.5, 1.3, LOOK.dark, 1.8 + side * 1.4, 0.25, z))
    }
    g.add(box(0.4, 0.12, 0.05, LOOK.orange, 1.8, 1.25, z + 0.86))
    // A pipe from the processor to each tank.
    const pipe = cylinder(0.07, 1.6 + i * 0.1, LOOK.metal, -0.8, 1.9, z, 8)
    pipe.rotation.z = Math.PI / 2
    g.add(pipe)
  }
  return g
}

/** Radiators that shed the habitat's heat: white fins on a frame. */
function radiators(): THREE.Group {
  const g = new THREE.Group()
  for (const x of [-1.6, 1.6]) g.add(cylinder(0.06, 2.6, LOOK.metal, x, 1.3, 0, 8))
  g.add(box(3.4, 0.08, 0.08, LOOK.metal, 0, 2.55, 0))
  for (let i = 0; i < 3; i++) {
    const fin = box(1.0, 1.9, 0.04, LOOK.radiator, -1.05 + i * 1.05, 1.5, 0)
    fin.rotation.y = 0.35
    g.add(fin)
  }
  return g
}

/** Cargo: crates and a container by the garage, some stacked. */
function cargo(): THREE.Group {
  const g = new THREE.Group()
  const random = seeded(21)
  g.add(box(2.4, 2.4, 5.6, LOOK.white, -2, 1.2, 0))
  g.add(box(2.42, 0.25, 0.08, LOOK.orange, -2, 2.0, 2.81))
  for (let i = 0; i < 7; i++) {
    const s = 0.7 + random() * 0.5
    const x = 0.8 + (i % 3) * 1.15
    const z = -2 + Math.floor(i / 3) * 1.6
    const crate = box(s, s * 0.8, s, LOOK.crate, x, (s * 0.8) / 2, z)
    crate.rotation.y = (random() - 0.5) * 0.4
    g.add(crate)
    if (i % 3 === 0) g.add(box(0.6, 0.5, 0.6, LOOK.crate, x, s * 0.8 + 0.25, z))
  }
  return g
}

/** A light mast with a lamp head. */
function lightMast(): THREE.Group {
  const g = new THREE.Group()
  g.add(cylinder(0.07, 5, LOOK.metal, 0, 2.5, 0, 8))
  g.add(box(0.5, 0.1, 0.5, LOOK.dark, 0, 0.05, 0))
  g.add(box(0.6, 0.2, 0.3, LOOK.dark, 0, 5.05, 0))
  g.add(box(0.5, 0.05, 0.22, LOOK.lamp, 0, 4.93, 0))
  return g
}

/** A seismometer under its dome, with a cable to a small solar box. */
function seismometer(): THREE.Group {
  const g = new THREE.Group()
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    LOOK.white,
  )
  dome.castShadow = dome.receiveShadow = true
  g.add(dome, box(1.3, 0.04, 1.3, LOOK.dark, 0, 0.02, 0))
  g.add(box(0.5, 0.4, 0.4, LOOK.white, 1.6, 0.2, 0.4), box(0.7, 0.03, 0.5, LOOK.solar, 1.6, 0.45, 0.4))
  g.add(box(1.0, 0.03, 0.05, LOOK.dark, 1.0, 0.02, 0.2))
  return g
}

/** A cargo lander that brought the base's first loads and stays where it set down: four legs, its
 * body, two solar wings and the engine bell underneath. */
function lander(): THREE.Group {
  const g = new THREE.Group()
  const body = cylinder(1.7, 1.3, LOOK.white, 0, 2.3, 0, 8)
  g.add(body, cylinder(1.75, 0.12, LOOK.orange, 0, 2.95, 0, 8), cylinder(1.2, 0.5, LOOK.dark, 0, 1.45, 0, 8))
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 0.9, 16, 1, true), LOOK.dark)
  bell.position.y = 0.95
  bell.castShadow = true
  g.add(bell)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const foot = new THREE.Vector3(Math.cos(a) * 2.9, 0.05, Math.sin(a) * 2.9)
    const hip = new THREE.Vector3(Math.cos(a) * 1.5, 2.0, Math.sin(a) * 1.5)
    const leg = cylinder(0.08, foot.distanceTo(hip), LOOK.metal, 0, 0, 0, 8)
    leg.position.copy(foot).add(hip).multiplyScalar(0.5)
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hip.clone().sub(foot).normalize())
    g.add(leg, cylinder(0.3, 0.08, LOOK.metal, foot.x, 0.04, foot.z, 12))
  }
  for (const side of [-1, 1]) {
    const wing = box(2.6, 0.05, 1.5, LOOK.solar, side * 3.1, 3.2, 0)
    wing.rotation.z = side * 0.25
    g.add(wing, box(0.9, 0.06, 0.08, LOOK.metal, side * 1.95, 3.0, 0))
  }
  g.add(cylinder(0.04, 1.2, LOOK.metal, 0.6, 3.5, 0.6, 6), box(0.3, 0.3, 0.3, LOOK.white, -0.7, 3.15, -0.5))
  return g
}

/** Gas bottles for the oxygen plant, standing in a rack. */
function gasBottles(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(2.4, 0.08, 1.0, LOOK.metal, 0, 1.3, -0.3), box(2.4, 0.1, 1.0, LOOK.dark, 0, 0.05, 0))
  for (let i = 0; i < 7; i++) {
    const x = -1.0 + i * 0.33
    g.add(cylinder(0.14, 1.5, i % 3 === 1 ? LOOK.orange : LOOK.white, x, 0.85, 0, 14))
    g.add(cylinder(0.05, 0.12, LOOK.metal, x, 1.66, 0, 8))
  }
  return g
}

/** Spare parts by the garage: rover wheels on a pallet, another leaning on it, and a tool cabinet. */
function spareParts(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(1.4, 0.14, 1.1, LOOK.crate, -0.6, 0.07, 0))
  for (const [x, y] of [
    [-0.95, 0.4],
    [-0.25, 0.4],
    [-0.6, 0.85],
  ] as [number, number][]) {
    const wheel = cylinder(0.32, 0.28, LOOK.metal, x, y, 0, 18)
    wheel.rotation.x = Math.PI / 2
    g.add(wheel)
  }
  const leaning = cylinder(0.32, 0.28, LOOK.metal, 0.35, 0.33, 0.5, 18)
  leaning.rotation.set(Math.PI / 2, 0, 0.35)
  g.add(leaning)
  g.add(box(0.9, 1.4, 0.6, LOOK.orange, 1.1, 0.7, -0.2), box(0.8, 0.04, 0.02, LOOK.dark, 1.1, 1.1, 0.11))
  return g
}

/** A mast of whip antennas for the base radio, beside the comms dish. */
function antennaMast(): THREE.Group {
  const g = new THREE.Group()
  g.add(cylinder(0.06, 4.2, LOOK.metal, 0, 2.1, 0, 8), box(0.4, 0.08, 0.4, LOOK.dark, 0, 0.04, 0))
  for (const [y, l] of [
    [4.2, 1.6],
    [3.2, 1.1],
  ] as [number, number][]) {
    g.add(box(1.0, 0.05, 0.05, LOOK.metal, 0, y, 0))
    for (const x of [-0.5, 0.5]) g.add(cylinder(0.015, l, LOOK.dark, x, y + l / 2, 0, 5))
  }
  g.add(box(0.3, 0.4, 0.2, LOOK.white, 0, 1.0, 0.12))
  return g
}

/** Metal plates laid along a path, a walkway kept clear of dust. */
function walkway(path: [number, number][]): THREE.Group {
  const g = new THREE.Group()
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)))
  const points = curve.getSpacedPoints(Math.round(curve.getLength() / 0.95))
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as THREE.Vector3
    const b = points[i] as THREE.Vector3
    const x = (a.x + b.x) / 2
    const z = (a.z + b.z) / 2
    const plate = box(0.8, 0.04, 0.85, LOOK.metal, x, heightAt(x, z) + 0.02, z)
    plate.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
    plate.castShadow = false
    g.add(plate)
  }
  return g
}

/** A cable laid on the ground from a to b, in short segments that follow the terrain. */
function cable(a: [number, number], b: [number, number], look: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3))
  for (let i = 0; i < n; i++) {
    const x0 = a[0] + ((b[0] - a[0]) * i) / n
    const z0 = a[1] + ((b[1] - a[1]) * i) / n
    const x1 = a[0] + ((b[0] - a[0]) * (i + 1)) / n
    const z1 = a[1] + ((b[1] - a[1]) * (i + 1)) / n
    const p0 = new THREE.Vector3(x0, heightAt(x0, z0) + 0.05, z0)
    const p1 = new THREE.Vector3(x1, heightAt(x1, z1) + 0.05, z1)
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, p0.distanceTo(p1), 6), look)
    seg.position.copy(p0).add(p1).multiplyScalar(0.5)
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize())
    seg.receiveShadow = true
    g.add(seg)
  }
  return g
}

/** Orange-tipped stakes every few metres along a path, marking a safe way. */
function stakes(path: [number, number][], every = 5): THREE.Group {
  const g = new THREE.Group()
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1] as [number, number]
    const [bx, bz] = path[i] as [number, number]
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / every))
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n
      const z = az + ((bz - az) * k) / n
      const y = heightAt(x, z)
      g.add(
        cylinder(0.03, 0.9, LOOK.metal, x, y + 0.45, z, 6),
        box(0.08, 0.14, 0.08, LOOK.stake, x, y + 0.95, z),
      )
    }
  }
  return g
}

/** Two faint wheel tracks along a path: darker, flattened regolith. */
function tracks(path: [number, number][]): THREE.Mesh {
  const positions: number[] = []
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)))
  const points = curve.getSpacedPoints(Math.round(curve.getLength() / 0.8))
  for (const side of [-1, 1])
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as THREE.Vector3
      const b = points[i] as THREE.Vector3
      const nx = -(b.z - a.z)
      const nz = b.x - a.x
      const n = Math.hypot(nx, nz) || 1
      const quad = [-0.22, 0.22].flatMap((w) =>
        [a, b].map((p) => {
          const x = p.x + (nx / n) * (side * 1.1 + w)
          const z = p.z + (nz / n) * (side * 1.1 + w)
          return [x, heightAt(x, z) + 0.025, z]
        }),
      ) as [number, number, number][]
      const [p0, p1, p2, p3] = quad as [
        [number, number, number],
        [number, number, number],
        [number, number, number],
        [number, number, number],
      ]
      positions.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3)
    }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x3a1e12,
      roughness: 1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    }),
  )
  mesh.receiveShadow = true
  return mesh
}

export function buildDetails(): THREE.Group {
  const group = new THREE.Group()
  group.add(at(oxygenPlant(), 13, -17, 0.15))
  group.add(at(radiators(), 7, -8.5, 0.2))
  group.add(at(cargo(), -26, -2, 0.1))
  group.add(at(seismometer(), 38, 30, 0.6))
  for (const [x, z] of DETAIL_POSTS.slice(0, 5)) group.add(at(lightMast(), x, z))
  group.add(at(lander(), 34, -24, 0.4))
  group.add(at(gasBottles(), 18, -12.5, 0.15))
  group.add(at(spareParts(), -23, -8, -0.2))
  group.add(at(antennaMast(), -16.5, -15.5))
  // Walkways from the airlock to the garage door and to the hopper pad.
  group.add(
    walkway([
      [-1.5, 12.8],
      [-4, 10.4],
      [-10, 8.6],
      [-16, 7.6],
    ]),
    walkway([
      [2.2, 13.4],
      [10, 12.4],
      [18, 10.6],
      [23.5, 9.2],
    ]),
  )
  const power = std(0x4a4846, 0.7, 0.2)
  group.add(cable([8, 20], [3, 7], power), cable([-12, -11], [-5, -6], power))
  group.add(cable([-4.5, -14.6], [-2, -6.8], power), cable([8.5, -16.5], [4.5, -6.2], power))
  // Stakes mark the way from the base to the landing pad and out to the west field.
  group.add(
    stakes([
      [4, 14],
      [5, 32],
    ]),
    stakes([
      [-20, 23],
      [-28, 30],
    ]),
  )
  group.add(
    tracks([
      [-15.5, 21],
      [-17, 28],
      [-22, 33],
      [-29, 38],
      [-37, 40],
    ]),
    tracks([
      [-12, 6],
      [-4, 18],
      [2, 30],
      [5, 40],
    ]),
  )
  return group
}
