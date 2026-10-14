import * as THREE from 'three'
import { AGNES_MARK } from './agnes-mark.js'
import {
  ARM_BASE,
  BACK_OF_HOUSE_Y,
  BAR_X,
  BARTENDER,
  DOOR,
  FIXTURES,
  HOMES,
  PRIVATE_ROOM,
  PRIVATE_SPEAKER,
} from './layout.js'
import type { Look } from './menu.js'
import { box, cylinder, drawn, mat, place } from './shapes.js'

/**
 * Everyone who moves in the restaurant, made in code: the guest the person plays and one robot of
 * each kind (the host at the door, the runner, the cleaner, the kitchen arm, the bar's robot and the play robot),
 * and the dishes and drinks they carry. Every model faces +z with its origin on the floor; the
 * joints the devices drive are handed out by name.
 */

const M = {
  shell: mat(0xf2f0eb, { roughness: 0.35 }),
  shellDark: mat(0x2b3138, { roughness: 0.45, metalness: 0.2 }),
  trim: mat(0xd6a84e, { metalness: 0.7, roughness: 0.3 }),
  orange: mat(0xe8742a, { roughness: 0.45 }),
  teal: mat(0x2f8f87, { roughness: 0.5 }),
  rubber: mat(0x1d1f22, { roughness: 0.9 }),
  glowCyan: mat(0x000000, { emissive: 0x58e1ff, emissiveIntensity: 2 }),
  glowGreen: mat(0x000000, { emissive: 0x52e08a, emissiveIntensity: 2 }),
  glowAmber: mat(0x000000, { emissive: 0xffb347, emissiveIntensity: 2 }),
  bow: mat(0xb3261e, { roughness: 0.6 }),
  skin: mat(0xf0c6a0, { roughness: 0.8 }),
  hair: mat(0x2e1d14, { roughness: 0.9 }),
  shirt: mat(0xf2b632, { roughness: 0.85 }),
  jeans: mat(0x34507a, { roughness: 0.9 }),
  shoe: mat(0x3a2418, { roughness: 0.7 }),
  you: mat(0x52e08a, { emissive: 0x2fbf68, emissiveIntensity: 1.2, roughness: 0.3 }),
  porcelain: mat(0xf8f6f0, { roughness: 0.25 }),
  claypot: mat(0x4a2a1c, { roughness: 0.6 }),
  bamboo: mat(0xd2ad62, { roughness: 0.8 }),
  glass: mat(0xcfeaf5, { roughness: 0.05, transparent: true, opacity: 0.35 }),
  celadon: mat(0x9ec9b4, { roughness: 0.3 }),
  candle: mat(0xfff0c8, { emissive: 0xffa040, emissiveIntensity: 2.5 }),
}

/** Puts `object` at (x, y, z) in its parent's frame (y up, z forward). */
function at<T extends THREE.Object3D>(object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z)
  return object
}

function sphere(r: number, material: THREE.Material, segments = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segments, Math.round(segments * 0.75)), material)
  mesh.castShadow = true
  return mesh
}

function capsule(r: number, length: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, length, 4, 10), material)
  mesh.castShadow = true
  return mesh
}

/** A joint: an empty group its child links hang from, turned to pose them. */
function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = at(new THREE.Group(), x, y, z)
  parent.add(g)
  return g
}

/** The deep indigo of the Agnes logo. */
const AGNES_BLUE = '#3d4194'

/** The Agnes mark as a decal `size` metres square, in `color` on nothing, facing +z. */
function markDecal(size: number, color: string): THREE.Mesh {
  const texture = drawn(256, 256, (g) => {
    g.scale(256, 256)
    g.fillStyle = color
    g.fill(new Path2D(AGNES_MARK), 'evenodd')
  })
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.5,
      roughness: 0.4,
      metalness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  )
}

type Mood = 'happy' | 'cat' | 'calm'

/** A robot's face on a dark screen: round eyes and a smile, a cat's ^ ^ eyes and whiskers, or a calm line. */
function face(w: number, h: number, mood: Mood, color = '#7ef0ff'): THREE.Mesh {
  const texture = drawn(256, Math.round((256 * h) / w), (g) => {
    const { width, height } = g.canvas
    g.fillStyle = '#0f1822'
    g.fillRect(0, 0, width, height)
    g.strokeStyle = color
    g.fillStyle = color
    g.lineWidth = height * 0.07
    g.lineCap = 'round'
    const ey = height * 0.42
    for (const ex of [width * 0.32, width * 0.68]) {
      g.beginPath()
      if (mood === 'happy') g.ellipse(ex, ey, width * 0.07, height * 0.14, 0, 0, Math.PI * 2)
      if (mood === 'happy') g.fill()
      else if (mood === 'cat') {
        g.moveTo(ex - width * 0.08, ey + height * 0.06)
        g.lineTo(ex, ey - height * 0.08)
        g.lineTo(ex + width * 0.08, ey + height * 0.06)
        g.stroke()
      } else {
        g.moveTo(ex - width * 0.07, ey)
        g.lineTo(ex + width * 0.07, ey)
        g.stroke()
      }
    }
    if (mood !== 'calm') {
      g.beginPath()
      g.arc(width / 2, height * 0.6, width * 0.08, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    }
    if (mood === 'cat') {
      g.lineWidth = height * 0.025
      for (const side of [-1, 1])
        for (const k of [-1, 1]) {
          g.beginPath()
          g.moveTo(width / 2 + side * width * 0.2, height * 0.66)
          g.lineTo(width / 2 + side * width * 0.4, height * (0.66 + k * 0.06))
          g.stroke()
        }
    }
  })
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.9,
    }),
  )
}

export interface Guest {
  object: THREE.Group
  /** Swings the legs and arms for a walk; `phase` advances π a stride. */
  walk(phase: number): void
  /** Stands still, arms at the sides. */
  stand(): void
  /** Sits on a chair or bench whose seat is under the origin, hands toward the table ahead. */
  sit(): void
  /** The "you" marker over their head. */
  marker: THREE.Object3D
}

const HIP_H = 0.92
const SEAT_HIP_H = 0.56

/** The guest the person plays: a chunky figure in a mustard top, with a green marker overhead. */
/** What a guest wears, as colours. */
export interface Outfit {
  shirt: number
  pants: number
  hair: number
}

/** The people who come with the guest, each dressed their own way; the child last. */
export const OUTFITS: Outfit[] = [
  { shirt: 0x4f8fd8, pants: 0x2b2b30, hair: 0x1b1410 },
  { shirt: 0xd8566a, pants: 0x4a3a2c, hair: 0x5a3a22 },
  { shirt: 0x5fae7a, pants: 0x34507a, hair: 0x101010 },
  { shirt: 0xe7e2d6, pants: 0x6b5a48, hair: 0x8a6a48 },
  { shirt: 0x9a6ad0, pants: 0x2b2b30, hair: 0x2e1d14 },
  { shirt: 0xe58a3a, pants: 0x34507a, hair: 0x1b1410 },
  { shirt: 0x3fb8b0, pants: 0x4a3a2c, hair: 0x5a3a22 },
]
export const CHILD_OUTFIT: Outfit = { shirt: 0xff8fb0, pants: 0x6fb3ff, hair: 0x3a2418 }

/** A figure of the guest, or with `outfit` someone in their party; a child is a little over half the size. */
export function guest(outfit?: Outfit, child = false): Guest {
  const shirt = outfit ? mat(outfit.shirt, { roughness: 0.85 }) : M.shirt
  const jeans = outfit ? mat(outfit.pants, { roughness: 0.9 }) : M.jeans
  const hairMat = outfit ? mat(outfit.hair, { roughness: 0.9 }) : M.hair
  const object = new THREE.Group()
  const hips = joint(object, 0, HIP_H, 0)
  const legs = [-1, 1].map((side) => {
    const hip = joint(hips, side * 0.1, 0, 0)
    hip.add(at(capsule(0.075, 0.3, jeans), 0, -0.22, 0))
    const knee = joint(hip, 0, -0.45, 0)
    knee.add(at(capsule(0.065, 0.32, jeans), 0, -0.22, 0))
    knee.add(at(box(0.11, 0.07, 0.22, M.shoe), 0, -0.43, 0.04))
    return { hip, knee }
  })
  const torso = at(cylinder(0.2, 0.17, 0.58, shirt, 20), 0, 0.27, 0)
  torso.scale.z = 0.62
  hips.add(torso)
  hips.add(at(cylinder(0.05, 0.05, 0.08, M.skin, 10), 0, 0.6, 0))
  const head = at(sphere(0.125, M.skin, 20), 0, 0.72, 0)
  hips.add(head)
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat,
  )
  hair.castShadow = true
  hair.rotation.x = -0.35
  hips.add(at(hair, 0, 0.74, -0.015))
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(hips, side * 0.24, 0.5, 0)
    shoulder.add(at(capsule(0.055, 0.25, shirt), 0, -0.17, 0))
    const elbow = joint(shoulder, 0, -0.33, 0)
    elbow.add(at(capsule(0.048, 0.2, M.skin), 0, -0.14, 0))
    elbow.add(at(sphere(0.055, M.skin, 10), 0, -0.3, 0))
    shoulder.rotation.z = side * 0.08
    return { shoulder, elbow }
  })
  const marker = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.12), M.you), 0, 2.15, 0)
  marker.scale.y = 1.5
  object.add(marker)
  marker.visible = !outfit
  // A child: the same figure, smaller, with a rounder head.
  if (child) {
    hips.scale.setScalar(0.58)
    head.scale.setScalar(1.25)
    hair.scale.setScalar(1.25)
    hair.position.y = 0.76
  }
  const size = child ? 0.58 : 1

  const pose = (hipH: number, hipZ: number) => {
    hips.position.set(0, hipH * size, hipZ * size)
  }
  return {
    object,
    marker,
    walk(phase) {
      pose(HIP_H + Math.abs(Math.sin(phase)) * 0.025, 0)
      legs.forEach(({ hip, knee }, k) => {
        const s = Math.sin(phase + k * Math.PI)
        hip.rotation.x = s * 0.45
        knee.rotation.x = Math.max(0, Math.sin(phase + k * Math.PI + Math.PI / 2)) * 0.55
      })
      arms.forEach(({ shoulder, elbow }, k) => {
        shoulder.rotation.x = -Math.sin(phase + k * Math.PI) * 0.4
        elbow.rotation.x = -0.25
      })
    },
    stand() {
      pose(HIP_H, 0)
      for (const { hip, knee } of legs) hip.rotation.x = knee.rotation.x = 0
      for (const { shoulder, elbow } of arms) shoulder.rotation.x = elbow.rotation.x = 0
    },
    sit() {
      pose(SEAT_HIP_H, -0.08)
      for (const { hip, knee } of legs) {
        hip.rotation.x = -Math.PI / 2
        knee.rotation.x = Math.PI / 2
      }
      for (const { shoulder, elbow } of arms) {
        shoulder.rotation.x = -0.35
        elbow.rotation.x = -1.1
      }
    },
  }
}

export interface Host {
  object: THREE.Group
  /** Turns to look; rotation.x nods. */
  head: THREE.Object3D
}

/** The host robot at the door: a slim white body on a dark base, a smiling screen face and a red bow tie. */
function host(): Host {
  const object = new THREE.Group()
  object.add(at(cylinder(0.3, 0.32, 0.12, M.shellDark, 28), 0, 0.06, 0))
  object.add(at(cylinder(0.305, 0.305, 0.02, M.glowCyan, 28), 0, 0.13, 0))
  object.add(at(cylinder(0.2, 0.27, 0.72, M.shell, 28), 0, 0.5, 0))
  object.add(at(cylinder(0.21, 0.21, 0.04, M.trim, 28), 0, 0.88, 0))
  // A tray at the front holds menus for the guest.
  object.add(at(box(0.3, 0.02, 0.18, M.shellDark), 0, 0.72, 0.24))
  object.add(at(box(0.22, 0.03, 0.15, M.bow), 0, 0.745, 0.24))
  const bow = new THREE.Group()
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), M.bow)
    wing.rotation.z = (side * Math.PI) / 2
    bow.add(at(wing, side * 0.05, 0, 0))
  }
  bow.add(sphere(0.022, M.bow, 8))
  object.add(at(bow, 0, 0.84, 0.205))
  // The Agnes mark on the chest, leaning back with the tapered body.
  const chest = at(markDecal(0.18, AGNES_BLUE), 0, 0.5, 0.237)
  chest.rotation.x = -Math.atan2(0.07, 0.72)
  object.add(chest)
  for (const side of [-1, 1]) {
    const arm = at(capsule(0.04, 0.22, M.shell), side * 0.25, 0.62, 0.02)
    arm.rotation.z = side * 0.25
    object.add(arm)
  }
  const head = joint(object, 0, 1.1, 0)
  head.add(at(box(0.46, 0.34, 0.2, M.shell), 0, 0, 0))
  head.add(at(face(0.4, 0.27, 'happy'), 0, 0, 0.101))
  for (const side of [-1, 1]) head.add(at(sphere(0.045, M.glowCyan, 10), side * 0.24, 0.02, 0))
  object.add(at(cylinder(0.05, 0.06, 0.1, M.shellDark, 12), 0, 0.93, 0))
  return { object, head }
}

export interface Runner {
  object: THREE.Group
  /** The three trays, top to bottom: add a dish to one and it rides along. */
  trays: THREE.Object3D[]
}

/** The runner: a delivery robot with three trays on two back posts and a cat face on top. */
function runner(): Runner {
  const object = new THREE.Group()
  object.add(at(box(0.52, 0.16, 0.56, M.shell), 0, 0.1, 0))
  object.add(at(box(0.54, 0.03, 0.58, M.glowAmber), 0, 0.03, 0))
  // Two slim posts at the back hold the trays, so the dishes show from every side.
  for (const side of [-1, 1]) object.add(at(box(0.05, 1.02, 0.07, M.shell), side * 0.21, 0.69, -0.2))
  object.add(at(box(0.18, 0.1, 0.08, M.shell), 0, 1.15, -0.2))
  const trays = [0.92, 0.66, 0.4].map((h) => {
    object.add(at(box(0.48, 0.025, 0.42, M.shellDark), 0, h, 0.0))
    object.add(at(box(0.48, 0.01, 0.42, M.orange), 0, h + 0.017, 0.0))
    return joint(object, 0, h + 0.022, 0.02)
  })
  // The Agnes mark on both sides of the base, under the trays.
  const mark = markDecal(0.15, AGNES_BLUE)
  for (const side of [-1, 1]) {
    const decal = at(side < 0 ? mark : mark.clone(), side * 0.261, 0.1, 0)
    decal.rotation.y = (side * Math.PI) / 2
    object.add(decal)
  }
  const head = joint(object, 0, 1.28, -0.12)
  head.add(at(box(0.44, 0.32, 0.2, M.shell), 0, 0, 0))
  head.add(at(face(0.38, 0.25, 'cat', '#ffd36e'), 0, 0, 0.101))
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), M.shell)
    ear.castShadow = true
    ear.rotation.y = Math.PI / 4
    head.add(at(ear, side * 0.15, 0.2, 0))
  }
  return { object, trays }
}

export interface Cleaner {
  object: THREE.Group
  /** The side brush at the front corner; spin it while it cleans. */
  brush: THREE.Object3D
}

/** The cleaner: a low teal floor scrubber with a lidar on top, a front brush and a status light. */
function cleaner(): Cleaner {
  const object = new THREE.Group()
  const body = at(cylinder(0.3, 0.32, 0.36, M.teal, 32), 0, 0.22, 0)
  body.scale.z = 1.15
  object.add(body)
  const top = at(cylinder(0.31, 0.31, 0.04, M.shell, 32), 0, 0.42, 0)
  top.scale.z = 1.15
  object.add(top)
  object.add(at(cylinder(0.07, 0.08, 0.08, M.shellDark, 16), 0, 0.48, -0.08))
  object.add(at(cylinder(0.075, 0.075, 0.015, M.glowGreen, 16), 0, 0.53, -0.08))
  object.add(at(box(0.5, 0.06, 0.06, M.rubber), 0, 0.08, 0.36))
  // A water tank window and a status bar on the front.
  object.add(at(box(0.22, 0.12, 0.02, M.glass), 0, 0.27, 0.355))
  object.add(at(box(0.2, 0.025, 0.02, M.glowGreen), 0, 0.37, 0.35))
  // A side brush sweeps dirt in from the front corner, out where it can be seen spinning.
  const brush = joint(object, 0.24, 0.02, 0.3)
  brush.add(cylinder(0.05, 0.05, 0.03, M.rubber, 12))
  for (let k = 0; k < 4; k++) {
    const bristle = box(0.3, 0.012, 0.025, M.orange)
    bristle.rotation.y = (k * Math.PI) / 4
    brush.add(bristle)
  }
  return { object, brush }
}

export interface Playmate {
  object: THREE.Group
  /** The arms, hung from the shoulders: rotation.x swings one forward and up. */
  arms: THREE.Object3D[]
  /** The bubble wand in its right hand, shown while it blows bubbles; bubbles come off its ring. */
  wand: THREE.Object3D
  head: THREE.Object3D
}

/** The play robot: a small round yellow and pink robot with a smiling face and an antenna. */
function playmate(): Playmate {
  const object = new THREE.Group()
  const pink = mat(0xff8fb0, { roughness: 0.45 })
  const yellow = mat(0xffd166, { roughness: 0.45 })
  const glowPink = mat(0x000000, { emissive: 0xff6fa8, emissiveIntensity: 2 })
  object.add(at(cylinder(0.22, 0.24, 0.1, M.shellDark, 24), 0, 0.05, 0))
  object.add(at(cylinder(0.225, 0.225, 0.02, glowPink, 24), 0, 0.11, 0))
  const belly = at(sphere(0.23, M.shell, 24), 0, 0.38, 0)
  belly.scale.y = 1.2
  object.add(belly)
  object.add(at(cylinder(0.235, 0.235, 0.06, pink, 24), 0, 0.38, 0))
  const head = joint(object, 0, 0.78, 0)
  head.add(box(0.36, 0.28, 0.28, yellow))
  head.add(at(face(0.3, 0.2, 'happy', '#ffd6e8'), 0, 0, 0.141))
  for (const side of [-1, 1]) {
    const ear = at(cylinder(0.05, 0.05, 0.05, pink, 12), side * 0.19, 0.02, 0)
    ear.rotation.z = Math.PI / 2
    head.add(ear)
  }
  head.add(at(cylinder(0.01, 0.01, 0.14, M.shellDark, 6), 0, 0.2, 0))
  head.add(at(sphere(0.04, glowPink, 10), 0, 0.28, 0))
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(object, side * 0.25, 0.5, 0)
    shoulder.add(at(capsule(0.045, 0.18, pink), 0, -0.13, 0))
    shoulder.add(at(sphere(0.06, yellow, 10), 0, -0.28, 0))
    shoulder.rotation.z = side * 0.15
    return shoulder
  })
  // The wand: a stick and a ring, held up in the right hand.
  const wand = joint(arms[1] as THREE.Object3D, 0, -0.3, 0.04)
  wand.add(at(cylinder(0.008, 0.008, 0.2, yellow, 6), 0, -0.1, 0))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), pink)
  wand.add(at(ring, 0, -0.24, 0))
  wand.rotation.x = Math.PI
  wand.visible = false
  return { object, arms, wand, head }
}

/** A soap bubble, its rainbow sheen faked by a faint emissive tint. */
const BUBBLE = new THREE.MeshStandardMaterial({
  color: 0xe8f6ff,
  emissive: 0x8fb8ff,
  emissiveIntensity: 0.25,
  roughness: 0.05,
  metalness: 0.3,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
})
export function bubble(r: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), BUBBLE)
}

/** A toy building block, `size` metres a side. */
export function toyBlock(color: number, size = 0.11): THREE.Mesh {
  return box(size, size, size, mat(color, { roughness: 0.55 }))
}

export interface Arm {
  object: THREE.Group
  /** Turntable (rotation.y), shoulder and elbow (rotation.x, + leans forward), and the wrist. */
  base: THREE.Object3D
  shoulder: THREE.Object3D
  elbow: THREE.Object3D
  wrist: THREE.Object3D
  /** Where a held dish goes, between the fingers. */
  grip: THREE.Object3D
  /** Set while it works, so it stops idling. */
  busy: boolean
  /** Sets the shoulder and elbow and turns the wrist so the fingers point straight down. */
  pose(shoulder: number, elbow: number): void
}

/** The kitchen arm's measures: the shoulder's height over the floor (on its plinth), its links, and the grip below the wrist. */
export const ARM_LINKS = { shoulder: 0.14 + 0.55 + 0.22, upper: 1.15, fore: 1.05, grip: 0.3 }

/** The kitchen arm: an orange and white industrial arm on a column, long enough for the wok, the stove and the pass. */
function arm(): Arm {
  const object = new THREE.Group()
  object.add(at(cylinder(0.16, 0.18, 0.55, M.shellDark, 24), 0, 0.275, 0))
  const base = joint(object, 0, 0.55, 0)
  base.add(at(cylinder(0.2, 0.2, 0.16, M.orange, 28), 0, 0.08, 0))
  const shoulder = joint(base, 0, 0.22, 0)
  const link = (length: number, r: number, look: THREE.Material) => {
    const g = new THREE.Group()
    const side = sphere(r * 1.25, M.shellDark, 16)
    side.scale.x = 1.3
    g.add(side)
    g.add(at(box(r * 1.6, length, r * 1.6, look), 0, length / 2, 0))
    return g
  }
  shoulder.add(link(ARM_LINKS.upper, 0.09, M.orange))
  const elbow = joint(shoulder, 0, ARM_LINKS.upper, 0)
  elbow.add(link(ARM_LINKS.fore, 0.07, M.shell))
  const wrist = joint(elbow, 0, ARM_LINKS.fore, 0)
  wrist.add(sphere(0.07, M.shellDark, 12))
  wrist.add(at(cylinder(0.05, 0.05, 0.12, M.orange, 12), 0, 0.08, 0))
  wrist.add(at(box(0.16, 0.03, 0.06, M.shellDark), 0, 0.15, 0))
  for (const side of [-1, 1]) wrist.add(at(box(0.025, 0.12, 0.04, M.shell), side * 0.065, 0.22, 0))
  wrist.add(at(sphere(0.02, M.glowCyan, 8), 0, 0.15, 0.035))
  // The fingers point down while it works; the grip is turned back over so a held dish sits upright.
  const grip = joint(wrist, 0, ARM_LINKS.grip, 0)
  grip.rotation.x = Math.PI
  const result: Arm = {
    object,
    base,
    shoulder,
    elbow,
    wrist,
    grip,
    busy: false,
    pose(s, e) {
      shoulder.rotation.x = s
      elbow.rotation.x = e
      wrist.rotation.x = Math.PI - s - e
    },
  }
  result.pose(0.45, 1.25)
  return result
}

export interface Bartender {
  object: THREE.Group
  /** Set while it works, so it stops idling. */
  busy: boolean
  /** Each arm's shoulder and elbow (rotation.x, − reaches forward) and its hand. */
  arms: { shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D }[]
}

/** The bar's robot: a white two-armed torso on a pedestal, with a calm face, behind the counter. */
function bartender(): Bartender {
  const object = new THREE.Group()
  object.add(at(cylinder(0.24, 0.3, 0.55, M.shellDark, 24), 0, 0.275, 0))
  object.add(at(cylinder(0.25, 0.25, 0.03, M.glowCyan, 24), 0, 0.56, 0))
  object.add(at(box(0.5, 0.5, 0.3, M.shell), 0, 0.82, 0))
  object.add(at(box(0.52, 0.06, 0.32, M.trim), 0, 0.6, 0))
  // A black apron over the front.
  object.add(at(box(0.36, 0.42, 0.01, M.shellDark), 0, 0.8, 0.156))
  object.add(at(cylinder(0.06, 0.07, 0.1, M.shellDark, 12), 0, 1.12, 0))
  const head = joint(object, 0, 1.3, 0)
  head.add(at(box(0.38, 0.28, 0.22, M.shell), 0, 0, 0))
  head.add(at(face(0.32, 0.21, 'happy', '#9cffc8'), 0, 0, 0.111))
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(object, side * 0.3, 1.0, 0)
    shoulder.add(sphere(0.07, M.shellDark, 12))
    shoulder.add(at(capsule(0.05, 0.24, M.shell), 0, -0.16, 0))
    const elbow = joint(shoulder, 0, -0.32, 0)
    elbow.add(sphere(0.055, M.shellDark, 10))
    elbow.add(at(capsule(0.045, 0.22, M.shell), 0, -0.15, 0))
    const hand = joint(elbow, 0, -0.3, 0)
    for (const f of [-1, 1]) hand.add(at(box(0.02, 0.08, 0.04, M.shellDark), f * 0.035, -0.03, 0))
    shoulder.rotation.x = -0.3
    elbow.rotation.x = -1.2
    return { shoulder, elbow, hand }
  })
  return { object, arms, busy: false }
}

export interface Prep {
  object: THREE.Group
  /** Set while it works, so it stops idling. */
  busy: boolean
  /** Each arm's shoulder and elbow (rotation.x, − reaches forward) and its hand. */
  arms: { shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D }[]
  /** The tray at its front: a bowl set here rides along. */
  tray: THREE.Object3D
}

/** The prep robot: a white two-armed torso in a chef's hat on a wheeled base, with a tray in front. */
function prep(): Prep {
  const object = new THREE.Group()
  object.add(at(cylinder(0.28, 0.3, 0.14, M.shellDark, 24), 0, 0.07, 0))
  object.add(at(cylinder(0.285, 0.285, 0.02, M.glowGreen, 24), 0, 0.15, 0))
  object.add(at(cylinder(0.17, 0.22, 0.5, M.shell, 20), 0, 0.42, 0))
  object.add(at(box(0.44, 0.42, 0.28, M.shell), 0, 0.86, 0))
  // A green apron and a tray at waist height for what it carries.
  object.add(at(box(0.32, 0.36, 0.01, M.teal), 0, 0.84, 0.146))
  object.add(at(box(0.36, 0.02, 0.24, M.shellDark), 0, 0.62, 0.26))
  const tray = joint(object, 0, 0.64, 0.26)
  object.add(at(cylinder(0.05, 0.06, 0.08, M.shellDark, 12), 0, 1.11, 0))
  const head = joint(object, 0, 1.28, 0)
  head.add(at(box(0.36, 0.26, 0.22, M.shell), 0, 0, 0))
  head.add(at(face(0.3, 0.19, 'happy', '#9cffc8'), 0, 0, 0.111))
  // A chef's hat: a band and a puffed top.
  head.add(at(cylinder(0.13, 0.13, 0.1, M.porcelain, 20), 0, 0.18, 0))
  head.add(at(sphere(0.16, M.porcelain, 16), 0, 0.3, 0))
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(object, side * 0.27, 1.0, 0)
    shoulder.add(sphere(0.065, M.shellDark, 12))
    shoulder.add(at(capsule(0.045, 0.22, M.shell), 0, -0.15, 0))
    const elbow = joint(shoulder, 0, -0.3, 0)
    elbow.add(sphere(0.05, M.shellDark, 10))
    elbow.add(at(capsule(0.04, 0.2, M.shell), 0, -0.14, 0))
    const hand = joint(elbow, 0, -0.28, 0)
    for (const f of [-1, 1]) hand.add(at(box(0.02, 0.07, 0.035, M.shellDark), f * 0.03, -0.03, 0))
    shoulder.rotation.x = -0.3
    elbow.rotation.x = -1.2
    return { shoulder, elbow, hand }
  })
  // A knife in the right hand.
  const knife = at(box(0.012, 0.03, 0.16, M.porcelain), 0, -0.07, 0.07)
  arms[1]?.hand.add(knife)
  return { object, arms, tray, busy: false }
}

/** A dark hair curled on top of a dish. */
export function hairOnDish(): THREE.Mesh {
  const strand = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 4, 24, Math.PI * 1.4), M.hair)
  strand.rotation.x = -Math.PI / 2
  strand.position.y = 0.075
  return strand
}

/** A steel bowl of washed, cut ingredients, in the dish's colour among greens. */
export function prepped(color = 0xc4622d): THREE.Group {
  const g = new THREE.Group()
  g.add(at(cylinder(0.11, 0.07, 0.07, M.porcelain, 18), 0, 0.035, 0))
  const pieces = [color, 0x6aa84f, 0xf2f0eb, color, 0x6aa84f, 0xe8742a]
  pieces.forEach((c, k) => {
    const a = (k / pieces.length) * Math.PI * 2
    g.add(at(box(0.04, 0.03, 0.04, mat(c, { roughness: 0.7 })), Math.cos(a) * 0.05, 0.08, Math.sin(a) * 0.05))
  })
  return g
}

/** A dish or drink, its base on the origin, about as wide as the real thing. */
export function dish(look: Look, color = 0xc4622d): THREE.Group {
  const g = new THREE.Group()
  const food = mat(color, { roughness: 0.55 })
  const plate = (r: number) => g.add(at(cylinder(r, r * 0.8, 0.02, M.porcelain, 24), 0, 0.01, 0))
  const mound = (r: number, h: number, material: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), material)
    m.scale.y = h / r
    m.castShadow = true
    g.add(at(m, 0, 0.02, 0))
  }
  const bits = (n: number, r: number, h: number, colors: number[], size = 0.025) => {
    for (let k = 0; k < n; k++) {
      const a = k * 2.4
      const d = r * Math.sqrt((k + 0.5) / n)
      const bit = box(size, size, size, mat(colors[k % colors.length] as number))
      bit.rotation.set(a, a * 1.3, 0)
      g.add(at(bit, Math.cos(a) * d, h, Math.sin(a) * d))
    }
  }
  const bowl = (r: number, h: number, look: THREE.Material, surface: THREE.Material) => {
    g.add(at(cylinder(r, r * 0.65, h, look, 24), 0, h / 2, 0))
    g.add(at(cylinder(r * 0.9, r * 0.9, 0.005, surface, 24), 0, h - 0.01, 0))
  }
  switch (look) {
    case 'stirfry':
    case 'greens':
      plate(0.15)
      mound(0.1, 0.045, food)
      bits(10, 0.08, 0.055, look === 'greens' ? [0x3f8a35, 0x6db34f] : [0xd8452f, 0x6db34f, 0xe8c27a])
      break
    case 'braise':
      bowl(0.11, 0.08, M.claypot, food)
      bits(9, 0.07, 0.075, [0xf4efe0], 0.03)
      break
    case 'fish': {
      const oval = at(cylinder(0.13, 0.11, 0.02, M.porcelain, 24), 0, 0.01, 0)
      oval.scale.x = 1.7
      g.add(oval)
      const fish = at(sphere(0.06, mat(0xd9d4c4, { roughness: 0.4 }), 16), 0, 0.045, 0)
      fish.scale.set(2.9, 0.75, 1)
      g.add(fish)
      const tail = at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4), fish.material), -0.2, 0.045, 0)
      tail.rotation.z = -Math.PI / 2
      g.add(tail)
      bits(8, 0.12, 0.08, [0x6db34f, 0xd8452f], 0.018)
      break
    }
    case 'steamer':
      g.add(at(cylinder(0.12, 0.12, 0.07, M.bamboo, 24), 0, 0.035, 0))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const bun = at(sphere(0.035, M.porcelain, 12), Math.cos(a) * 0.065, 0.075, Math.sin(a) * 0.065)
        bun.scale.y = 0.75
        g.add(bun)
      }
      g.add(at(sphere(0.035, M.porcelain, 12), 0, 0.075, 0))
      break
    case 'rice':
      plate(0.14)
      mound(0.095, 0.06, mat(0xf0cf62, { roughness: 0.8 }))
      bits(12, 0.08, 0.06, [0x6db34f, 0xd8452f, 0xf7f2e0], 0.018)
      break
    case 'bowl': {
      g.add(at(cylinder(0.065, 0.042, 0.06, M.porcelain, 18), 0, 0.03, 0))
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        M.porcelain,
      )
      top.scale.y = 0.5
      g.add(at(top, 0, 0.058, 0))
      break
    }
    case 'noodles':
    case 'soup':
      bowl(0.12, 0.09, M.porcelain, look === 'soup' ? mat(0xe8c890, { roughness: 0.2 }) : food)
      if (look === 'noodles') bits(8, 0.08, 0.085, [0x6db34f, 0xa8653a], 0.022)
      break
    case 'tea': {
      const pot = at(sphere(0.07, M.celadon, 18), 0, 0.06, 0)
      pot.scale.y = 0.85
      g.add(pot)
      const spout = at(cylinder(0.012, 0.018, 0.08, M.celadon, 8), 0.08, 0.075, 0)
      spout.rotation.z = -0.8
      g.add(spout)
      g.add(at(sphere(0.015, M.celadon, 8), 0, 0.125, 0))
      g.add(at(cylinder(0.03, 0.024, 0.045, M.celadon, 12), -0.06, 0.0225, 0.09))
      break
    }
    case 'glass':
      g.add(at(cylinder(0.04, 0.034, 0.14, M.glass, 16), 0, 0.07, 0))
      g.add(at(cylinder(0.036, 0.031, 0.11, food, 16), 0, 0.058, 0))
      break
    case 'cake':
      plate(0.17)
      g.add(at(cylinder(0.14, 0.14, 0.1, M.porcelain, 32), 0, 0.07, 0))
      g.add(at(cylinder(0.1, 0.1, 0.07, M.porcelain, 32), 0, 0.155, 0))
      g.add(at(cylinder(0.142, 0.142, 0.02, food, 32), 0, 0.115, 0))
      g.add(at(cylinder(0.102, 0.102, 0.015, food, 32), 0, 0.19, 0))
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        g.add(
          at(cylinder(0.006, 0.006, 0.06, mat(0xf2a3c0), 6), Math.cos(a) * 0.06, 0.22, Math.sin(a) * 0.06),
        )
        g.add(at(sphere(0.012, M.candle, 6), Math.cos(a) * 0.06, 0.26, Math.sin(a) * 0.06))
      }
      break
  }
  return g
}

/** How high a balloon's string rises from its weight, and how far it leans sideways at the top, in metres. */
const BALLOON_STRING = 1.0
const BALLOON_LEAN = 0.2

/** A supply the runner brings: a napkin pack, a pair of chopsticks, a bowl, a spoon, a cup, a takeaway box, a baby chair, a balloon. */
export function supplyModel(item: string): THREE.Group {
  const g = new THREE.Group()
  const red = mat(0xb3261e)
  switch (item) {
    case 'napkins':
      g.add(at(box(0.16, 0.06, 0.12, M.porcelain), 0, 0.03, 0))
      g.add(at(box(0.165, 0.015, 0.04, red), 0, 0.045, 0))
      break
    case 'chopsticks':
      for (const dx of [-0.012, 0.012]) g.add(at(box(0.01, 0.01, 0.24, red), dx, 0.006, 0))
      g.add(at(box(0.05, 0.01, 0.03, M.porcelain), 0, 0.012, -0.08))
      break
    case 'bowl':
      g.add(at(cylinder(0.065, 0.042, 0.06, M.porcelain, 18), 0, 0.03, 0))
      break
    case 'spoon':
      g.add(at(box(0.04, 0.02, 0.14, M.porcelain), 0, 0.01, 0))
      break
    case 'cup':
      g.add(at(cylinder(0.04, 0.032, 0.07, M.celadon, 14), 0, 0.035, 0))
      break
    case 'takeaway_box':
      g.add(at(box(0.18, 0.08, 0.14, M.porcelain), 0, 0.04, 0))
      g.add(at(box(0.06, 0.04, 0.005, red), 0, 0.045, 0.071))
      break
    case 'baby_chair': {
      // A small high chair: four legs, a seat with a tray, a back.
      const wood = mat(0xd2ad62)
      for (const [dx, dz] of [
        [-0.15, -0.15],
        [0.15, -0.15],
        [-0.15, 0.15],
        [0.15, 0.15],
      ] as const)
        g.add(at(box(0.03, 0.7, 0.03, wood), dx, 0.35, dz))
      g.add(at(box(0.34, 0.04, 0.34, wood), 0, 0.7, 0))
      g.add(at(box(0.34, 0.3, 0.03, wood), 0, 0.86, -0.16))
      g.add(at(box(0.36, 0.03, 0.16, red), 0, 0.82, 0.22))
      break
    }
    case 'balloon': {
      // A red balloon on a string tied to a small gold weight, the string leaning a little toward +x.
      // userData.sway is what bobs (live/supplies.ts): the string and balloon, pivoting at the weight.
      g.add(
        at(cylinder(0.03, 0.036, 0.03, mat(0xe0b44a, { metalness: 0.5, roughness: 0.35 }), 12), 0, 0.015, 0),
      )
      const sway = new THREE.Group()
      const top = new THREE.Vector3(BALLOON_LEAN, BALLOON_STRING, 0)
      sway.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.03, 0), top]),
          new THREE.LineBasicMaterial({ color: 0xf4efe6 }),
        ),
      )
      const skin = mat(0xf0283c, { roughness: 0.22, emissive: 0xf0283c, emissiveIntensity: 0.12 })
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.03, 8), skin)
      sway.add(at(knot, top.x, top.y + 0.012, 0))
      const ball = sphere(0.11, skin, 20)
      ball.scale.y = 1.18
      sway.add(at(ball, top.x, top.y + 0.02 + 0.11 * 1.18, 0))
      g.add(sway)
      g.userData.sway = sway
      break
    }
  }
  return g
}

/** A spill on the floor: a flat brown puddle with a lighter edge. */
export function puddle(): THREE.Group {
  const g = new THREE.Group()
  const wet = mat(0x6b4423, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 })
  for (const [dx, dz, r] of [
    [0, 0, 0.32],
    [0.25, 0.12, 0.18],
    [-0.2, -0.15, 0.15],
  ] as const) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), wet)
    m.rotation.x = -Math.PI / 2
    g.add(at(m, dx, 0.006, dz))
  }
  return g
}

/** Effects the kitchen and the rooms switch on: fire under the wok, steam over the stove, music notes in the dining room and in the private room. */
export interface Effects {
  fire: THREE.Group
  steam: THREE.Group
  notes: THREE.Group
  privateNotes: THREE.Group
  update(t: number): void
}

/** Four glowing music notes, risen and drifted by `update`. */
function musicNotes(): THREE.Group {
  const notes = new THREE.Group()
  const ink = mat(0x000000, { emissive: 0xffd36e, emissiveIntensity: 1.6 })
  for (let k = 0; k < 4; k++) {
    const note = new THREE.Group()
    note.add(at(sphere(0.06, ink, 10), 0, 0, 0))
    note.add(at(box(0.015, 0.22, 0.015, ink), 0.05, 0.11, 0))
    note.add(at(box(0.08, 0.02, 0.015, ink), 0.09, 0.21, 0))
    notes.add(at(note, k * 0.4, k * 0.3, 0))
  }
  notes.visible = false
  return notes
}

export function buildEffects(): Effects {
  const fire = new THREE.Group()
  const flame = mat(0xff7a1a, { emissive: 0xff4a00, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 })
  // Tongues from the burner ring, leaning out to lick up round the outside of the wok.
  const tongueShape = new THREE.ConeGeometry(0.05, 0.18, 8).translate(0, 0.09, 0)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2
    const tongue = at(new THREE.Mesh(tongueShape, flame), Math.cos(a) * 0.25, 0.01, Math.sin(a) * 0.25)
    tongue.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), 0.35)
    fire.add(tongue)
  }
  fire.visible = false
  const steam = new THREE.Group()
  const puff = mat(0xffffff, { transparent: true, opacity: 0.45, roughness: 1 })
  for (let k = 0; k < 6; k++)
    steam.add(at(sphere(0.09, puff, 10), (k % 3) * 0.12 - 0.12, k * 0.12, (k % 2) * 0.1))
  steam.visible = false
  const notes = musicNotes()
  const privateNotes = musicNotes()
  return {
    fire,
    steam,
    notes,
    privateNotes,
    update(t) {
      if (fire.visible)
        fire.children.forEach((c, k) => {
          c.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + k * 1.7))
        })
      if (steam.visible)
        steam.children.forEach((c, k) => {
          const phase = (t * 0.6 + k / 6) % 1
          c.position.y = phase * 0.8
          c.scale.setScalar(0.6 + phase)
        })
      for (const group of [notes, privateNotes])
        if (group.visible)
          group.children.forEach((c, k) => {
            const phase = (t * 0.35 + k / 4) % 1
            c.position.set(k * 0.4 - 0.6 + Math.sin(t + k) * 0.15, phase * 1.1, phase * 1.2)
            c.visible = phase < 0.9
          })
    },
  }
}

/**
 * The private room's sliding door: two panels, cut low like its walls, that slide apart into the
 * wall while anyone is near the doorway.
 */
function slidingDoor(group: THREE.Group, near: THREE.Object3D[]): (dt: number) => void {
  const { x0, door } = PRIVATE_ROOM
  const mid = (door.y0 + door.y1) / 2
  const half = (door.y1 - door.y0) / 2
  const wood = mat(0x4a241a, { roughness: 0.45 })
  const paper = mat(0xf6ead2, { roughness: 0.9, emissive: 0x3a2410, emissiveIntensity: 0.2 })
  const panels = [-1, 1].map((side) => {
    const g = new THREE.Group()
    g.add(place(box(0.05, 1.0, half, wood), 0, 0, 0.5))
    g.add(place(box(0.06, 0.8, half - 0.1, paper), 0, 0, 0.5))
    group.add(place(g, x0 + 0.09, mid + (side * half) / 2, 0))
    return { g, side }
  })
  let open = 0
  const p = new THREE.Vector3()
  return (dt) => {
    const someone = near.some((o) => {
      if (!o.visible) return false
      o.getWorldPosition(p)
      return Math.hypot(p.x - x0, -p.z - mid) < 1.6
    })
    open += ((someone ? 1 : 0) - open) * Math.min(1, dt * 6)
    // Plan y is −z; each panel slides out by its own width, behind the wall beside the doorway.
    for (const { g, side } of panels) g.position.z = -(mid + side * (half / 2 + open * half * 0.95))
  }
}

export interface Actors {
  group: THREE.Group
  guest: Guest
  host: Host
  runner: Runner
  cleaner: Cleaner
  arm: Arm
  bartender: Bartender
  prep: Prep
  playmate: Playmate
  effects: Effects
  /** Idle motion: the marker spins, the arm and the bar's robot sway while nobody drives them; the private room's door opens for whoever comes near. */
  update(t: number): void
}

/** Builds everyone at their starting places: the robots at home, the guest outside the door. */
export function buildActors(): Actors {
  const group = new THREE.Group()
  const g = guest()
  g.stand()
  group.add(place(g.object, (DOOR.x0 + DOOR.x1) / 2, -1.6, 0, 90))
  const h = host()
  group.add(place(h.object, HOMES.host.x, HOMES.host.y, 0, HOMES.host.yaw))
  const r = runner()
  group.add(place(r.object, HOMES.runner.x, HOMES.runner.y, 0.02, HOMES.runner.yaw))
  const c = cleaner()
  group.add(place(c.object, HOMES.cleaner.x, HOMES.cleaner.y, 0.02, HOMES.cleaner.yaw))
  const a = arm()
  // On the plinth, facing the pass.
  group.add(place(a.object, ARM_BASE.x, ARM_BASE.y, 0.14, 270))
  const b = bartender()
  group.add(place(b.object, BARTENDER.x, BARTENDER.y, 0.01, BARTENDER.yaw))
  const p = prep()
  group.add(place(p.object, HOMES.prep.x, HOMES.prep.y, 0.02, HOMES.prep.yaw))
  const pm = playmate()
  group.add(place(pm.object, HOMES.play.x, HOMES.play.y, 0.02, HOMES.play.yaw))
  const effects = buildEffects()
  group.add(place(effects.fire, FIXTURES.wok.x - 0.25, FIXTURES.wok.y, 0.95))
  group.add(place(effects.steam, FIXTURES.stove.x + 0.1, FIXTURES.stove.y, 1.4))
  // Music notes rise from the speaker on the low wall and drift out over the dining room.
  group.add(place(effects.notes, BAR_X - 1.5, BACK_OF_HOUSE_Y - 0.2, 1.75))
  group.add(place(effects.privateNotes, PRIVATE_SPEAKER.x, PRIVATE_SPEAKER.y - 0.2, 1.75))
  const door = slidingDoor(group, [g.object, h.object, r.object, c.object])
  let last = 0
  return {
    group,
    guest: g,
    host: h,
    runner: r,
    cleaner: c,
    arm: a,
    bartender: b,
    prep: p,
    playmate: pm,
    effects,
    update(t) {
      effects.update(t)
      door(Math.min(0.1, t - last))
      last = t
      g.marker.rotation.y = t * 2
      g.marker.position.y = 2.15 + Math.sin(t * 3) * 0.05
      h.head.rotation.x = Math.sin(t * 0.8) * 0.04
      pm.head.rotation.z = Math.sin(t * 1.3) * 0.06
      // Idle motion eases in from wherever work left the joints.
      if (!a.busy) {
        a.base.rotation.y += (Math.sin(t * 0.25) * 0.9 - a.base.rotation.y) * 0.05
        const s = a.shoulder.rotation.x + (0.45 + Math.sin(t * 0.4) * 0.08 - a.shoulder.rotation.x) * 0.05
        a.pose(s, a.elbow.rotation.x + (1.25 - a.elbow.rotation.x) * 0.05)
      }
      for (const robot of [b, p])
        if (!robot.busy)
          robot.arms.forEach((arm, k) => {
            arm.shoulder.rotation.x += (-0.3 - arm.shoulder.rotation.x) * 0.1
            arm.elbow.rotation.x += (-1.2 + Math.sin(t * 1.1 + k * 1.7) * 0.1 - arm.elbow.rotation.x) * 0.1
          })
    },
  }
}
