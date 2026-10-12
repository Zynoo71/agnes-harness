import * as THREE from 'three'
import {
  ARM_BASE,
  BACK_OF_HOUSE_Y,
  BAR_X,
  type Box,
  DOOR,
  FIXTURES,
  HOMES,
  ROOM,
  TABLES,
  type Table,
} from './layout.js'

/**
 * The restaurant's room and everything fixed in it, made in code: floors, walls (the two nearest the
 * view cut low, as in a management game, so the room shows), the low wall with the pass, the dish
 * return and the bar counter, the kitchen's stations, the bar, the supplies cabinet, the cashier,
 * the tables with chairs or benches, plants and the robots' charging pads. Plan coordinates are the
 * floor map's (x east, y north); the scene's z is −y.
 */

const WALL_H = 2.6
const LOW_H = 1.05
const CUT_H = 0.28

const mat = (color: number, options: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options })

const M = {
  wall: mat(0xf1e4cf),
  wallTop: mat(0x7a4a33),
  skirting: mat(0x5c3a2a),
  tileWall: mat(0xe9eef0, { roughness: 0.4 }),
  wood: mat(0xb07a4c),
  woodDark: mat(0x6b4330),
  lacquer: mat(0xb8382e, { roughness: 0.55 }),
  cushion: mat(0x9e2f2a, { roughness: 0.9 }),
  steel: mat(0xc9ced2, { metalness: 0.6, roughness: 0.35 }),
  steelDark: mat(0x6f767c, { metalness: 0.6, roughness: 0.4 }),
  black: mat(0x232323, { roughness: 0.5 }),
  white: mat(0xf7f5f0),
  glass: mat(0x9fd3ea, { roughness: 0.1, emissive: 0x2c5566, emissiveIntensity: 0.6 }),
  leaf: mat(0x4f8f45),
  pot: mat(0xd9c3a3),
  heat: mat(0xffb070, { emissive: 0xff8a3d, emissiveIntensity: 1.6 }),
  screen: mat(0x2b3a4a, { emissive: 0x4fa3ff, emissiveIntensity: 0.6 }),
  pad: mat(0x3a3f44),
  padGlow: mat(0x7be0a0, { emissive: 0x3ccf7a, emissiveIntensity: 1.2 }),
  mat: mat(0x8f2b26, { roughness: 1 }),
  bamboo: mat(0xd8b46a),
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  segments = 20,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Puts `object` at plan point (x, y), its base `h` metres above the floor. */
function place<T extends THREE.Object3D>(object: T, x: number, y: number, h = 0): T {
  object.position.set(x, h, -y)
  return object
}

/** A box standing on the floor over plan box `b`, `h` tall. */
function block(b: Box, h: number, material: THREE.Material): THREE.Mesh {
  return place(box(b.w, h, b.d, material), b.x, b.y, h / 2)
}

/** A floor texture: planks of wood, or square tiles, drawn on a canvas. */
function floorTexture(kind: 'planks' | 'tiles', w: number, d: number): THREE.CanvasTexture {
  const px = 64
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * px)
  canvas.height = Math.round(d * px)
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  if (kind === 'planks') {
    g.fillStyle = '#9c6b45'
    g.fillRect(0, 0, canvas.width, canvas.height)
    const plank = 0.2 * px
    for (let row = 0; row * plank < canvas.height; row++) {
      let x = -((row * 37) % 5) * 0.4 * px
      while (x < canvas.width) {
        const len = (1.2 + ((row * 13 + x) % 7) * 0.15) * px
        const shade = 0.88 + (((row * 29 + Math.round(x)) % 11) / 11) * 0.2
        g.fillStyle = `rgb(${Math.round(160 * shade)}, ${Math.round(110 * shade)}, ${Math.round(72 * shade)})`
        g.fillRect(x + 1, row * plank + 1, len - 2, plank - 2)
        x += len
      }
    }
  } else {
    const tile = 0.3 * px
    g.fillStyle = '#b9c0c4'
    g.fillRect(0, 0, canvas.width, canvas.height)
    for (let j = 0; j * tile < canvas.height; j++)
      for (let i = 0; i * tile < canvas.width; i++) {
        g.fillStyle = (i + j) % 2 ? '#e4e8ea' : '#d6dcdf'
        g.fillRect(i * tile + 1, j * tile + 1, tile - 2, tile - 2)
      }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function floor(b: Box, kind: 'planks' | 'tiles'): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w, b.d),
    new THREE.MeshStandardMaterial({ map: floorTexture(kind, b.w, b.d), roughness: 0.8 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return place(mesh, b.x, b.y, 0)
}

/** A wall along plan box `b`, `h` tall, with a dark top so the cut edge reads. */
function wall(b: Box, h: number, material = M.wall): THREE.Group {
  const g = new THREE.Group()
  g.add(block(b, h, material))
  g.add(place(box(b.w + 0.01, 0.03, b.d + 0.01, M.wallTop), b.x, b.y, h))
  g.add(place(box(b.w + 0.02, 0.1, b.d + 0.02, M.skirting), b.x, b.y, 0.05))
  return g
}

/** A sign drawn on a canvas: `text` on lacquer red, `w` × `h` metres. */
function sign(text: string, w: number, h: number): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = Math.round((512 * h) / w)
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#9e2f2a'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.strokeStyle = '#e7c27d'
  g.lineWidth = 6
  g.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
  g.fillStyle = '#f6dfa8'
  g.font = `600 ${Math.round(canvas.height * 0.5)}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, canvas.width / 2, canvas.height * 0.54)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, emissive: 0x4a1410, emissiveIntensity: 0.4 }),
  )
}

function chair(x: number, y: number, yaw: number): THREE.Group {
  const g = new THREE.Group()
  g.add(place(box(0.42, 0.06, 0.42, M.lacquer), 0, 0, 0.45))
  for (const [dx, dz] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const)
    g.add(place(box(0.04, 0.45, 0.04, M.woodDark), dx, dz, 0.225))
  // The back, on the side away from the table.
  g.add(place(box(0.42, 0.45, 0.05, M.lacquer), 0, -0.2, 0.7))
  g.position.set(x, 0, -y)
  g.rotation.y = ((yaw - 90) * Math.PI) / 180
  return g
}

function bench(x: number, y: number, w: number, yaw: number): THREE.Group {
  const g = new THREE.Group()
  g.add(place(box(w, 0.45, 0.5, M.woodDark), 0, 0, 0.225))
  g.add(place(box(w, 0.1, 0.48, M.cushion), 0, 0, 0.5))
  g.add(place(box(w, 0.7, 0.14, M.cushion), 0, -0.22, 0.8))
  g.position.set(x, 0, -y)
  g.rotation.y = ((yaw - 90) * Math.PI) / 180
  return g
}

/** A card standing on the table with its number. */
function numberCard(n: number): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#f7f5f0'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#9e2f2a'
  g.font = '700 46px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(n), 32, 35)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshStandardMaterial({ map: texture }),
  )
  return card
}

function diningTable(t: Table, n: number): THREE.Group {
  const g = new THREE.Group()
  g.add(place(box(t.w, 0.05, t.d, M.wood), t.x, t.y, 0.74))
  g.add(place(cylinder(0.05, 0.05, 0.72, M.woodDark), t.x, t.y, 0.36))
  g.add(place(box(t.w * 0.5, 0.03, t.d * 0.5, M.woodDark), t.x, t.y, 0.015))
  if (t.booth) {
    g.add(bench(t.x, t.y + 0.75, t.w + 0.2, 270))
    g.add(bench(t.x, t.y - 0.75, t.w + 0.2, 90))
  } else for (const s of t.seats) g.add(chair(s.x, s.y, s.yaw))
  // The number faces the view (from the south-east).
  const card = numberCard(n)
  card.rotation.y = Math.PI / 4
  g.add(place(card, t.x + t.w / 2 - 0.12, t.y - t.d / 2 + 0.14, 0.87))
  return g
}

function plant(x: number, y: number, size = 1): THREE.Group {
  const g = new THREE.Group()
  g.add(place(cylinder(0.2 * size, 0.16 * size, 0.4 * size, M.pot), 0, 0, 0.2 * size))
  for (let k = 0; k < 5; k++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * size, 0), M.leaf)
    leaf.castShadow = true
    const a = (k / 5) * Math.PI * 2
    leaf.position.set(Math.cos(a) * 0.12 * size, (0.55 + (k % 2) * 0.18) * size, Math.sin(a) * 0.12 * size)
    g.add(leaf)
  }
  g.position.set(x, 0, -y)
  return g
}

/** The kitchen: tiled floor and back wall, cold store, prep counter, wok, stove, dishwasher. */
function kitchen(): THREE.Group {
  const g = new THREE.Group()
  const F = FIXTURES
  g.add(
    floor(
      { x: BAR_X / 2, y: (BACK_OF_HOUSE_Y + ROOM.d) / 2, w: BAR_X, d: ROOM.d - BACK_OF_HOUSE_Y },
      'tiles',
    ),
  )
  // Cold store: a tall steel cabinet with two doors.
  g.add(block(F.coldStore, 2.1, M.steel))
  for (const dx of [-0.35, 0.35])
    g.add(place(box(0.03, 0.5, 0.04, M.steelDark), F.coldStore.x + dx * 0.25, F.coldStore.y - 0.42, 1.1))
  // Prep counter with two boards and a knife block.
  g.add(block(F.prep, 0.9, M.steel))
  g.add(place(box(0.5, 0.03, 0.35, M.wood), F.prep.x - 0.8, F.prep.y, 0.915))
  g.add(place(box(0.5, 0.03, 0.35, M.wood), F.prep.x + 0.3, F.prep.y, 0.915))
  // Wok station: a counter with a burner ring and a wok on it, an extractor hood above.
  g.add(block(F.wok, 0.9, M.steelDark))
  g.add(place(cylinder(0.24, 0.24, 0.04, M.black), F.wok.x, F.wok.y, 0.92))
  const wok = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.6),
    new THREE.MeshStandardMaterial({
      color: 0x1d1d1d,
      metalness: 0.7,
      roughness: 0.35,
      side: THREE.DoubleSide,
    }),
  )
  wok.castShadow = true
  g.add(place(wok, F.wok.x, F.wok.y, 1.2))
  g.add(place(box(1.5, 0.35, 0.8, M.steel), F.wok.x, F.wok.y + 0.05, 2.1))
  // Stove: two pots and a stack of bamboo steamers.
  g.add(block(F.stove, 0.9, M.steelDark))
  g.add(place(cylinder(0.2, 0.2, 0.3, M.steel), F.stove.x - 0.45, F.stove.y, 1.05))
  for (let k = 0; k < 3; k++)
    g.add(place(cylinder(0.2, 0.2, 0.1, M.bamboo), F.stove.x + 0.4, F.stove.y, 0.95 + k * 0.11))
  g.add(place(box(1.7, 0.35, 0.8, M.steel), F.stove.x, F.stove.y + 0.05, 2.1))
  // Dishwasher behind the dish return.
  g.add(block(F.dishwasher, 0.9, M.steel))
  g.add(place(box(0.7, 0.05, 0.02, M.steelDark), F.dishwasher.x, F.dishwasher.y - 0.36, 0.7))
  // Where the arm stands: a round plinth (the arm itself is a device).
  g.add(place(cylinder(0.3, 0.34, 0.12, M.steelDark), ARM_BASE.x, ARM_BASE.y, 0.06))
  return g
}

/** The drinks bar: dark floor, counter, back shelves of bottles and a tea urn. */
function bar(): THREE.Group {
  const g = new THREE.Group()
  const F = FIXTURES
  g.add(
    floor(
      {
        x: (BAR_X + ROOM.w) / 2,
        y: (BACK_OF_HOUSE_Y + ROOM.d) / 2,
        w: ROOM.w - BAR_X,
        d: ROOM.d - BACK_OF_HOUSE_Y,
      },
      'planks',
    ),
  )
  // Open shelves against the wall: a back board, three shelves, bottles on them.
  const S = F.barShelves
  g.add(place(box(S.w, 1.9, 0.04, M.woodDark), S.x, S.y + S.d / 2 - 0.02, 0.95))
  const colours = [0x3f7f4e, 0xc0892f, 0x8a2f3a, 0x2f5f8a, 0xe0d7b8]
  for (const [row, h] of [0.9, 1.3, 1.7].entries()) {
    g.add(place(box(S.w, 0.04, S.d, M.wood), S.x, S.y, h))
    for (let k = 0; k < 11; k++) {
      const colour = colours[(k + row * 2) % colours.length] as number
      const bottle = cylinder(0.045, 0.05, 0.26, mat(colour, { roughness: 0.3 }), 10)
      g.add(place(bottle, S.x - S.w / 2 + 0.2 + k * 0.28, S.y - 0.02, h + 0.15))
    }
  }
  g.add(block({ ...S, d: S.d }, 0.85, M.woodDark))
  g.add(place(cylinder(0.16, 0.16, 0.45, M.steel), F.bar.x + 1.2, F.bar.y + 0.55, 0.95))
  return g
}

/** The low wall between the dining room and the back of house, with its counters. */
function lowWall(): THREE.Group {
  const g = new THREE.Group()
  const F = FIXTURES
  const y = BACK_OF_HOUSE_Y
  // Wall pieces between the counters (x ranges).
  const openings = [F.dishReturn, F.pass, F.bar].map((b) => [b.x - b.w / 2, b.x + b.w / 2] as const)
  let x = 0
  for (const [a, b] of openings) {
    if (a > x) g.add(wall({ x: (x + a) / 2, y, w: a - x, d: 0.2 }, LOW_H))
    x = b
  }
  if (x < ROOM.w) g.add(wall({ x: (x + ROOM.w) / 2, y, w: ROOM.w - x, d: 0.2 }, LOW_H))
  // Dish return: a steel shelf with a bin.
  g.add(block(F.dishReturn, 0.9, M.steel))
  g.add(place(box(0.6, 0.18, 0.4, M.steelDark), F.dishReturn.x, F.dishReturn.y, 0.99))
  // The pass: a steel counter under a bar of heat lamps.
  g.add(block(F.pass, 0.95, M.steel))
  g.add(place(box(F.pass.w, 0.08, 0.16, M.steelDark), F.pass.x, F.pass.y, 1.75))
  for (const dx of [-1.2, -0.4, 0.4, 1.2])
    g.add(place(box(0.5, 0.03, 0.1, M.heat), F.pass.x + dx, F.pass.y, 1.7))
  for (const dx of [-1.7, 1.7]) g.add(place(box(0.04, 0.8, 0.04, M.steelDark), F.pass.x + dx, F.pass.y, 1.35))
  // The bar counter, wood with a lacquer front.
  g.add(block(F.bar, 1.05, M.woodDark))
  g.add(place(box(F.bar.w, 0.6, 0.02, M.lacquer), F.bar.x, F.bar.y - F.bar.d / 2 - 0.01, 0.5))
  // The side wall between the kitchen and the bar.
  g.add(wall({ x: BAR_X, y: (y + ROOM.d) / 2, w: 0.15, d: ROOM.d - y }, LOW_H + 0.5))
  return g
}

/** The dining room's fixtures: supplies cabinet, cashier, door mat, charging pads, plants. */
function diningFixtures(): THREE.Group {
  const g = new THREE.Group()
  const F = FIXTURES
  // Supplies cabinet: open shelves with napkin packs, bowls and a cup of chopsticks.
  g.add(block(F.supplies, 1.1, M.wood))
  for (let k = 0; k < 4; k++)
    g.add(place(box(0.28, 0.1, 0.22, M.white), F.supplies.x - 0.75 + k * 0.32, F.supplies.y, 1.15))
  g.add(place(cylinder(0.07, 0.06, 0.18, M.lacquer), F.supplies.x + 0.65, F.supplies.y, 1.19))
  // Cashier: counter, screen.
  g.add(block(F.cashier, 1.0, M.woodDark))
  g.add(
    place(box(F.cashier.w, 0.5, 0.02, M.lacquer), F.cashier.x, F.cashier.y + F.cashier.d / 2 + 0.01, 0.45),
  )
  const screen = box(0.4, 0.28, 0.03, M.screen)
  screen.rotation.x = -0.25
  g.add(place(screen, F.cashier.x + 0.3, F.cashier.y - 0.05, 1.2))
  // A red mat inside the door.
  g.add(place(box(DOOR.x1 - DOOR.x0, 0.01, 0.9, M.mat), (DOOR.x0 + DOOR.x1) / 2, 0.55, 0.005))
  // Charging pads by the east wall.
  for (const home of [HOMES.runner1, HOMES.runner2, HOMES.cleaner]) {
    g.add(place(box(0.8, 0.02, 0.8, M.pad), home.x, home.y, 0.01))
    g.add(place(box(0.06, 0.25, 0.5, M.padGlow), ROOM.w - 0.05, home.y, 0.15))
  }
  g.add(plant(0.45, 0.45))
  g.add(plant(ROOM.w - 0.45, BACK_OF_HOUSE_Y - 0.6))
  g.add(plant(5.6, BACK_OF_HOUSE_Y - 0.5, 0.8))
  return g
}

export interface Room {
  group: THREE.Group
}

export function buildRoom(): Room {
  const group = new THREE.Group()
  group.add(floor({ x: ROOM.w / 2, y: BACK_OF_HOUSE_Y / 2, w: ROOM.w, d: BACK_OF_HOUSE_Y }, 'planks'))
  // The far walls stand full height: the kitchen's back wall tiled, the west wall with windows.
  group.add(wall({ x: ROOM.w / 2, y: ROOM.d + 0.1, w: ROOM.w + 0.4, d: 0.2 }, WALL_H, M.tileWall))
  group.add(wall({ x: -0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }, WALL_H))
  for (const y of [1.6, 3.4, 5.2]) {
    const pane = box(0.04, 1.3, 1.4, M.glass)
    group.add(place(pane, 0.02, y, 1.45))
    group.add(place(box(0.06, 0.06, 1.5, M.woodDark), 0.03, y, 0.8))
    group.add(place(box(0.06, 0.06, 1.5, M.woodDark), 0.03, y, 2.1))
  }
  // The near walls are cut low, so the room shows from above.
  group.add(wall({ x: DOOR.x0 / 2, y: -0.1, w: DOOR.x0 + 0.4, d: 0.2 }, CUT_H))
  group.add(wall({ x: (DOOR.x1 + ROOM.w) / 2 + 0.1, y: -0.1, w: ROOM.w - DOOR.x1 + 0.2, d: 0.2 }, CUT_H))
  group.add(wall({ x: ROOM.w + 0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }, CUT_H))
  // The name over the kitchen.
  const name = sign('Agnes 餐厅', 3.2, 0.7)
  group.add(place(name, 3.4, ROOM.d - 0.005, 1.95))
  group.add(kitchen(), bar(), lowWall(), diningFixtures())
  for (const [i, t] of TABLES.entries()) group.add(diningTable(t, i + 1))
  return { group }
}
