import * as THREE from 'three'
import { model, pbr } from './assets.js'
import { bake } from './bake.js'
import {
  ARM_BASE,
  BACK_OF_HOUSE_Y,
  BAR_X,
  BARTENDER,
  type Box,
  DOOR,
  FIXTURES,
  HOMES,
  PLANTS,
  PLAY,
  PLAY_AREA,
  PRIVATE_ROOM,
  PRIVATE_SPEAKER,
  playFence,
  privateWalls,
  ROOM,
  STREET_D,
  TABLES,
  type Table,
} from './layout.js'
import { box, cylinder, drawn, mat, place, rotY } from './shapes.js'

/**
 * The restaurant's room and everything fixed in it: floors, walls (the two nearest the view cut low,
 * as in a management game, so the room shows), the street outside, the foyer with its waiting area
 * and cashier, the dining room's tables laid for guests, the low wall with the dish return, the pass
 * and the bar counter, the kitchen's stations and stores, and the bar. Furniture and props come from
 * Poly Haven (CC0); the rest is made in code. Plan coordinates are the floor map's (x east, y
 * north); the scene's z is −y.
 */

const WALL_H = 3
const LOW_H = 1.05
const CUT_H = 0.3
const F = FIXTURES

const M = {
  wallTop: mat(0x6b3f2c),
  skirting: mat(0x4e2f22),
  tileWall: mat(0xe8eef0, { roughness: 0.35 }),
  wood: mat(0xa8713f),
  rosewood: mat(0x4a241a, { roughness: 0.45 }),
  lacquer: mat(0xa82e26, { roughness: 0.45 }),
  gold: mat(0xd6a84e, { metalness: 0.8, roughness: 0.3 }),
  cushion: mat(0x8f2a26, { roughness: 0.95 }),
  steel: mat(0xc9ced2, { metalness: 0.65, roughness: 0.3 }),
  steelDark: mat(0x6c737a, { metalness: 0.6, roughness: 0.4 }),
  black: mat(0x1f1f1f, { roughness: 0.5 }),
  porcelain: mat(0xf8f6f0, { roughness: 0.25 }),
  celadon: mat(0x9ec9b4, { roughness: 0.3 }),
  glass: mat(0xa9d8ee, { roughness: 0.05, transparent: true, opacity: 0.35 }),
  sky: mat(0xbfe3f2, { emissive: 0x6fb6d6, emissiveIntensity: 0.5 }),
  heat: mat(0xffb070, { emissive: 0xff8a3d, emissiveIntensity: 1.8 }),
  flame: mat(0x6fb3ff, { emissive: 0x3d8bff, emissiveIntensity: 1.2 }),
  screen: mat(0x223040, { emissive: 0x4fa3ff, emissiveIntensity: 0.7 }),
  pad: mat(0x30353a),
  padGlow: mat(0x7be0a0, { emissive: 0x3ccf7a, emissiveIntensity: 1.4 }),
  mat: mat(0x8f2b26, { roughness: 1 }),
  bamboo: mat(0xd2ad62),
  lantern: mat(0xd8382c, { emissive: 0xc0201a, emissiveIntensity: 0.9, roughness: 0.6 }),
  soy: mat(0x2a1208, { roughness: 0.2 }),
  vinegar: mat(0x5a2d10, { roughness: 0.2 }),
  paper: mat(0xfbfaf6),
  asphalt: mat(0x3a3a3c, { roughness: 0.95 }),
  curb: mat(0xa7a39b),
  ticket: mat(0xf4efe2),
  rubber: mat(0x3d4a3f),
  leaf: mat(0x4f8f45),
}

/** A box standing on the floor over plan box `b`, `h` tall. */
function block(b: Box, h: number, material: THREE.Material): THREE.Mesh {
  return place(box(b.w, h, b.d, material), b.x, b.y, h / 2)
}

/** Loads a Poly Haven model and puts it at plan point (x, y), facing `yaw`, `h` above the floor. */
async function prop(group: THREE.Group, id: string, x: number, y: number, yaw = 270, h = 0, scale = 1) {
  const m = await model(id)
  m.scale.setScalar(scale)
  group.add(place(m, x, y, h, yaw))
  return m
}

function floor(b: Box, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return place(mesh, b.x, b.y, 0)
}

/** A wall along plan box `b`, `h` tall, with a dark top so the cut edge reads and a skirting. */
function wall(b: Box, h: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  g.add(block(b, h, material))
  g.add(place(box(b.w + 0.01, 0.04, b.d + 0.01, M.wallTop), b.x, b.y, h))
  g.add(place(box(b.w + 0.02, 0.12, b.d + 0.02, M.skirting), b.x, b.y, 0.06))
  return g
}

/** A signboard: `text` in gold on lacquer red with a gold border, `w` × `h` metres. */
function sign(text: string, w: number, h: number): THREE.Mesh {
  const texture = drawn(1024, Math.round((1024 * h) / w), (g) => {
    const { width, height } = g.canvas
    g.fillStyle = '#9e2a22'
    g.fillRect(0, 0, width, height)
    g.strokeStyle = '#e2b866'
    g.lineWidth = 10
    g.strokeRect(14, 14, width - 28, height - 28)
    g.fillStyle = '#f5d68e'
    g.font = `600 ${Math.round(height * 0.52)}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, width / 2, height * 0.55)
  })
  const face = mat(0xffffff, { map: texture, emissive: 0x3a0e08, emissiveIntensity: 0.5 })
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [
    M.lacquer,
    M.lacquer,
    M.lacquer,
    M.lacquer,
    face,
    M.lacquer,
  ])
  board.castShadow = true
  return board
}

/** A red paper lantern with gold caps and a tassel, `r` metres round, glowing a little. */
function lantern(r = 0.22): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), M.lantern)
  body.scale.y = 0.85
  g.add(body)
  g.add(place(cylinder(r * 0.45, r * 0.45, 0.05, M.gold, 12), 0, 0, r * 0.82))
  g.add(place(cylinder(r * 0.45, r * 0.45, 0.05, M.gold, 12), 0, 0, -r * 0.88))
  g.add(place(cylinder(0.012, 0.03, r * 0.9, M.lantern, 6), 0, 0, -r * 1.4))
  return g
}

/** A chair facing map `yaw`: dark wood, a red seat, a back on the side away from the table. */
function chair(x: number, y: number, yaw: number): THREE.Group {
  const g = new THREE.Group()
  g.add(place(box(0.44, 0.05, 0.42, M.rosewood), 0, 0, 0.45))
  g.add(place(box(0.4, 0.03, 0.38, M.cushion), 0, 0, 0.49))
  for (const [dx, dy] of [
    [-0.18, -0.17],
    [0.18, -0.17],
    [-0.18, 0.17],
    [0.18, 0.17],
  ] as const)
    g.add(place(box(0.04, 0.45, 0.04, M.rosewood), dx, dy, 0.225))
  // The back stands behind the sitter, who faces +z before the chair is turned (plan y −).
  g.add(place(box(0.04, 0.5, 0.04, M.rosewood), -0.18, 0.19, 0.72))
  g.add(place(box(0.04, 0.5, 0.04, M.rosewood), 0.18, 0.19, 0.72))
  g.add(place(box(0.4, 0.08, 0.04, M.rosewood), 0, 0.19, 0.93))
  g.add(place(box(0.12, 0.36, 0.03, M.lacquer), 0, 0.19, 0.7))
  return place(g, x, y, 0, yaw)
}

/** One guest's place at seat `s`, toward the table's centre: a plate and bowl, chopsticks, a teacup. */
function setting(
  g: THREE.Group,
  s: { x: number; y: number; yaw: number },
  toward: { x: number; y: number },
  h: number,
) {
  const dx = toward.x - s.x
  const dy = toward.y - s.y
  const n = Math.hypot(dx, dy)
  const at = (k: number, side = 0) => ({
    x: s.x + (dx / n) * k - (dy / n) * side,
    y: s.y + (dy / n) * k + (dx / n) * side,
  })
  const plate = at(0.4)
  g.add(place(cylinder(0.11, 0.09, 0.015, M.porcelain, 18), plate.x, plate.y, h + 0.008))
  g.add(place(cylinder(0.065, 0.04, 0.045, M.porcelain, 16), plate.x, plate.y, h + 0.035))
  const sticks = at(0.38, 0.17)
  const chopsticks = box(0.012, 0.012, 0.24, M.lacquer)
  chopsticks.rotation.y = rotY(s.yaw)
  g.add(place(chopsticks, sticks.x, sticks.y, h + 0.02))
  const cup = at(0.5, -0.17)
  g.add(place(cylinder(0.035, 0.028, 0.06, M.celadon, 12), cup.x, cup.y, h + 0.03))
}

/** A card standing on the table with its number. */
function numberCard(n: number): THREE.Mesh {
  const texture = drawn(96, 96, (g) => {
    g.fillStyle = '#f7f1e3'
    g.fillRect(0, 0, 96, 96)
    g.strokeStyle = '#9e2a22'
    g.lineWidth = 6
    g.strokeRect(5, 5, 86, 86)
    g.fillStyle = '#9e2a22'
    g.font = '700 64px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), 48, 54)
  })
  return new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), mat(0xffffff, { map: texture }))
}

/** A table laid for its guests, with chairs, a number card and soy, vinegar and napkins. */
function diningTable(t: Table, n: number): THREE.Group {
  const g = new THREE.Group()
  const H = 0.75
  if ('r' in t.top) {
    g.add(place(cylinder(t.top.r, t.top.r, 0.05, M.rosewood, 40), t.x, t.y, H - 0.025))
    // A lazy Susan in the middle, on a pedestal.
    g.add(place(cylinder(0.38, 0.38, 0.02, M.glass, 32), t.x, t.y, H + 0.012))
    g.add(place(cylinder(0.08, 0.12, H - 0.05, M.rosewood, 16), t.x, t.y, (H - 0.05) / 2))
    g.add(place(cylinder(0.4, 0.45, 0.04, M.rosewood, 24), t.x, t.y, 0.02))
  } else {
    const top = t.top
    g.add(place(box(top.w, 0.05, top.d, M.rosewood), t.x, t.y, H - 0.025))
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      g.add(
        place(
          box(0.05, H - 0.05, 0.05, M.rosewood),
          t.x + sx * (top.w / 2 - 0.06),
          t.y + sy * (top.d / 2 - 0.06),
          (H - 0.05) / 2,
        ),
      )
    // A runner of red cloth down the middle.
    g.add(place(box(top.w * 0.98, 0.004, 0.24, M.lacquer), t.x, t.y, H + 0.002))
  }
  for (const s of t.seats) g.add(chair(s.x, s.y, s.yaw))
  for (const s of t.seats) setting(g, s, t, H)
  // Soy sauce, vinegar and a box of napkins in the middle; the number toward the view.
  const cx = t.x + ('r' in t.top ? 0.18 : 0)
  g.add(place(cylinder(0.025, 0.03, 0.12, M.soy, 10), cx - 0.05, t.y + 0.03, H + 0.06))
  g.add(place(cylinder(0.025, 0.03, 0.12, M.vinegar, 10), cx + 0.02, t.y + 0.05, H + 0.06))
  g.add(place(box(0.12, 0.06, 0.08, M.paper), cx - 0.02, t.y - 0.07, H + 0.03))
  const card = numberCard(n)
  card.rotation.y = Math.PI / 4
  const edge =
    'r' in t.top
      ? { x: t.x + 0.35, y: t.y - 0.35 }
      : { x: t.x + t.top.w / 2 - 0.15, y: t.y - t.top.d / 2 + 0.15 }
  g.add(place(card, edge.x, edge.y, H + 0.1))
  return g
}

/** A rug: round when `d` is 0 (`w` its diameter), else `w` × `d`; lacquer red with a gold border. */
function rug(w: number, d: number): THREE.Mesh {
  const round = d === 0
  const texture = drawn(512, round ? 512 : Math.round((512 * d) / w), (g) => {
    const { width, height } = g.canvas
    g.fillStyle = '#8c2621'
    g.fillRect(0, 0, width, height)
    g.strokeStyle = '#d9ad5b'
    g.lineWidth = 10
    if (round) {
      for (const r of [0.47, 0.4]) {
        g.beginPath()
        g.arc(width / 2, height / 2, width * r, 0, Math.PI * 2)
        g.stroke()
      }
    } else {
      g.strokeRect(18, 18, width - 36, height - 36)
      g.strokeRect(38, 38, width - 76, height - 76)
    }
    // A coin pattern in the middle.
    g.beginPath()
    g.arc(width / 2, height / 2, Math.min(width, height) * 0.14, 0, Math.PI * 2)
    g.stroke()
    g.strokeRect(width / 2 - 18, height / 2 - 18, 36, 36)
  })
  const material = mat(0xffffff, { map: texture, roughness: 1 })
  const mesh = new THREE.Mesh(
    round ? new THREE.CircleGeometry(w / 2, 48) : new THREE.PlaneGeometry(w, d),
    material,
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return mesh
}

/** A board hanging over a counter, `lines` of dishes or drinks in gold on dark wood. */
function menuBoard(title: string, lines: string[], w: number): THREE.Mesh {
  const h = 0.62
  const texture = drawn(1024, Math.round((1024 * h) / w), (g) => {
    const { width, height } = g.canvas
    g.fillStyle = '#3b1e14'
    g.fillRect(0, 0, width, height)
    g.strokeStyle = '#c99a4a'
    g.lineWidth = 6
    g.strokeRect(8, 8, width - 16, height - 16)
    g.fillStyle = '#f2cf86'
    g.textBaseline = 'middle'
    g.font = `700 ${Math.round(height * 0.3)}px "PingFang SC", system-ui, sans-serif`
    g.fillText(title, 28, height * 0.32)
    g.font = `500 ${Math.round(height * 0.2)}px "PingFang SC", system-ui, sans-serif`
    g.fillStyle = '#f7ead0'
    g.fillText(lines.join('   '), 28, height * 0.72)
  })
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [
    M.rosewood,
    M.rosewood,
    M.rosewood,
    M.rosewood,
    mat(0xffffff, { map: texture, emissive: 0x1a0c06, emissiveIntensity: 0.4 }),
    M.rosewood,
  ])
  board.castShadow = true
  return board
}

/** A fish tank on a cabinet: blue glowing water, rocks, weed and a few goldfish. */
async function fishTank(group: THREE.Group) {
  const T = F.fishTank
  group.add(block(T, 0.75, M.rosewood))
  group.add(
    place(
      box(
        T.w - 0.04,
        0.7,
        T.d - 0.06,
        mat(0x5fb6d8, {
          emissive: 0x2a7fa8,
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.6,
          roughness: 0.1,
        }),
      ),
      T.x,
      T.y,
      1.12,
    ),
  )
  group.add(place(box(T.w, 0.04, T.d, M.rosewood), T.x, T.y, 1.49))
  group.add(place(box(T.w - 0.1, 0.05, T.d - 0.1, mat(0xcdb48a)), T.x, T.y, 0.8))
  const fish = mat(0xff8a2a, { emissive: 0x803a00, emissiveIntensity: 0.4 })
  for (const [dx, h, yaw] of [
    [-0.5, 1.05, 0],
    [-0.1, 1.25, 180],
    [0.35, 0.98, 20],
    [0.6, 1.3, 200],
  ] as const) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), fish))
    g.children[0]?.scale.set(1.6, 0.8, 0.6)
    g.add(place(box(0.05, 0.06, 0.01, fish), 0.09, 0, -0.03))
    group.add(place(g, T.x + dx, T.y, h, yaw))
  }
  for (let k = 0; k < 5; k++)
    group.add(place(box(0.015, 0.3 + (k % 3) * 0.1, 0.015, M.leaf), T.x - 0.7 + k * 0.33, T.y + 0.1, 0.95))
}

/** The outer walls: the far two full height with windows, pictures and a clock; the near two cut. */
async function walls(group: THREE.Group) {
  const plaster = pbr('plastered_wall_04', [6, 1], { color: 0xf3e3c8 })
  group.add(wall({ x: ROOM.w / 2, y: ROOM.d + 0.1, w: ROOM.w + 0.4, d: 0.2 }, WALL_H, M.tileWall))
  group.add(wall({ x: -0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }, WALL_H, plaster))
  // A band of red tiles along the kitchen's back wall.
  group.add(place(box(BAR_X, 0.12, 0.02, M.lacquer), BAR_X / 2, ROOM.d - 0.01, 1.55))
  // Two big windows in the west wall, with lattices.
  for (const y of [4.6, 7.8]) {
    const g = new THREE.Group()
    g.add(place(box(0.03, 1.6, 2.2, M.sky), 0.01, 0, 1.6))
    for (const k of [-1.1, 0, 1.1]) g.add(place(box(0.06, 1.7, 0.06, M.rosewood), 0.03, k, 1.6))
    for (const h of [0.8, 1.6, 2.4]) g.add(place(box(0.06, 0.06, 2.26, M.rosewood), 0.03, 0, h))
    g.add(place(box(0.2, 0.06, 2.4, M.rosewood), 0.08, 0, 0.77))
    group.add(place(g, 0, y))
  }
  // Pictures between the windows and by the door, a clock near the kitchen.
  await prop(group, 'hanging_picture_frame_02', 0.03, 6.2, 0, 1.25)
  await prop(group, 'hanging_picture_frame_01', 0.03, 2.4, 0, 1.0, 0.8)
  await prop(group, 'wall_clock', 0.04, 11.8, 0, 2.05)
  // The near walls are cut low, so the room shows from above.
  group.add(wall({ x: DOOR.x0 / 2, y: -0.1, w: DOOR.x0 + 0.4, d: 0.2 }, CUT_H, plaster))
  group.add(
    wall({ x: (DOOR.x1 + ROOM.w) / 2 + 0.1, y: -0.1, w: ROOM.w - DOOR.x1 + 0.2, d: 0.2 }, CUT_H, plaster),
  )
  group.add(wall({ x: ROOM.w + 0.1, y: ROOM.d / 2, w: 0.2, d: ROOM.d + 0.4 }, CUT_H, plaster))
  // The door posts.
  for (const x of [DOOR.x0, DOOR.x1])
    group.add(place(box(0.14, CUT_H + 0.1, 0.26, M.rosewood), x, -0.1, (CUT_H + 0.1) / 2))
}

/** The street outside the south wall: pavement, a kerb, the road, lamps, planters, the shop sign. */
async function street(group: THREE.Group) {
  group.add(
    floor(
      { x: ROOM.w / 2, y: -STREET_D / 2 + 0.6, w: ROOM.w + 6, d: STREET_D - 1.2 },
      pbr('patterned_paving', [7, 1.2]),
    ),
  )
  group.add(place(box(ROOM.w + 6, 0.12, 0.25, M.curb), ROOM.w / 2, -STREET_D + 1.2, 0.06))
  group.add(floor({ x: ROOM.w / 2, y: -STREET_D - 1, w: ROOM.w + 6, d: 4.4 }, M.asphalt))
  for (const x of [1.5, ROOM.w - 1.5]) await prop(group, 'street_lamp_01', x, -STREET_D + 1.6, 90, 0, 0.75)
  for (const x of [4, 7.5, 14.5, 18]) await prop(group, 'planter_box_02', x, -0.75, 90, 0, 0.9)
  // By the door: the name on a standing lacquered board, red lanterns on two posts either side.
  const sx = DOOR.x0 - 1.4
  group.add(place(box(0.08, 0.5, 0.08, M.rosewood), sx - 0.6, -0.5, 0.25))
  group.add(place(box(0.08, 0.5, 0.08, M.rosewood), sx + 0.6, -0.5, 0.25))
  group.add(place(sign('Agnes 餐厅', 1.6, 0.5), sx, -0.5, 0.75))
  for (const x of [DOOR.x0 - 0.35, DOOR.x1 + 0.35]) {
    group.add(place(box(0.08, 1.7, 0.08, M.rosewood), x, -0.35, 0.85))
    group.add(place(box(0.4, 0.05, 0.05, M.rosewood), x, -0.5, 1.68))
    group.add(place(lantern(0.2), x, -0.62, 1.35))
  }
}

/** The foyer: door mat, waiting area with sofa, tea table and screens, menu board, cashier, plants. */
async function foyer(group: THREE.Group) {
  group.add(place(box(DOOR.x1 - DOOR.x0 + 0.4, 0.01, 1.3, M.mat), (DOOR.x0 + DOOR.x1) / 2, 0.75, 0.005))
  await prop(group, 'chinese_sofa', F.sofa.x, F.sofa.y, 90)
  await prop(group, 'chinese_tea_table', F.teaTable.x, F.teaTable.y, 90)
  await prop(group, 'tea_set_01', F.teaTable.x, F.teaTable.y, 120, 0.5)
  await prop(group, 'chinese_stool', F.stoolWest.x, F.stoolWest.y, 0)
  await prop(group, 'chinese_stool', F.stoolEast.x, F.stoolEast.y, 180)
  for (const dx of [-1.3, 0, 1.3])
    await prop(group, 'chinese_screen_panels', F.screens.x + dx, F.screens.y, 270)
  await prop(group, 'standing_chalkboard_01', F.menuBoard.x, F.menuBoard.y, 45, 0, 0.8)
  // The cashier: a lacquered counter, a screen, a till, a lucky cat, a little plant.
  group.add(block(F.cashier, 1.0, M.rosewood))
  group.add(
    place(box(F.cashier.w, 0.55, 0.02, M.lacquer), F.cashier.x, F.cashier.y + F.cashier.d / 2 + 0.01, 0.5),
  )
  group.add(place(box(F.cashier.w + 0.1, 0.05, F.cashier.d + 0.1, M.wood), F.cashier.x, F.cashier.y, 1.02))
  const screen = box(0.42, 0.3, 0.03, M.screen)
  screen.rotation.x = 0.25
  group.add(place(screen, F.cashier.x + 0.4, F.cashier.y - 0.05, 1.25))
  group.add(place(box(0.32, 0.12, 0.26, M.black), F.cashier.x - 0.2, F.cashier.y, 1.1))
  const cat = new THREE.Group()
  cat.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), M.porcelain), 0, 0, 0.08))
  cat.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), M.porcelain), 0, 0, 0.2))
  cat.add(place(cylinder(0.02, 0.02, 0.09, M.porcelain, 8), 0.07, 0, 0.24))
  cat.add(place(box(0.05, 0.03, 0.01, M.lacquer), 0, -0.06, 0.13))
  group.add(place(cat, F.cashier.x - 0.95, F.cashier.y, 1.045, 270))
  await prop(group, 'potted_plant_04', F.cashier.x + 0.95, F.cashier.y, 270, 1.045)
  for (const [i, p] of PLANTS.entries())
    await prop(group, i < 2 ? 'potted_plant_02' : 'potted_plant_04', p.x, p.y, i * 70, 0, i < 2 ? 1 : 2.4)
}

/** The dining room: the tables, the display cabinet, the supplies cabinet, lanterns along the wall. */
async function dining(group: THREE.Group) {
  for (const [i, t] of TABLES.entries()) group.add(diningTable(t, i + 1))
  // A round red rug under the round table, an oblong one under the waiting area's tea table.
  group.add(place(rug(1.95, 0), TABLES[4]?.x ?? 0, TABLES[4]?.y ?? 0, 0.004))
  group.add(place(rug(3.2, 2.2), F.teaTable.x, F.teaTable.y - 0.2, 0.004))
  await fishTank(group)
  await prop(group, 'chinese_cabinet', F.cabinet.x, F.cabinet.y, 0, 0, 0.7)
  await prop(group, 'antique_ceramic_vase_01', 1.0, 9.35, 0)
  // The supplies cabinet: open shelves of napkin packs, bowls, a cup of chopsticks.
  const S = F.supplies
  group.add(block(S, 1.1, M.wood))
  group.add(place(box(S.w + 0.06, 0.04, S.d + 0.04, M.rosewood), S.x, S.y, 1.12))
  for (let k = 0; k < 4; k++) group.add(place(box(0.3, 0.1, 0.24, M.paper), S.x - 0.65 + k * 0.33, S.y, 1.19))
  for (let k = 0; k < 3; k++)
    group.add(place(cylinder(0.07, 0.05, 0.05, M.porcelain, 14), S.x - 0.5 + k * 0.17, S.y - 0.1, 1.27))
  group.add(place(cylinder(0.06, 0.05, 0.16, M.lacquer, 12), S.x + 0.7, S.y + 0.05, 1.22))
  for (let k = 0; k < 12; k++)
    group.add(
      place(
        box(0.008, 0.25, 0.008, M.bamboo),
        S.x + 0.67 + (k % 4) * 0.02,
        S.y + 0.03 + Math.floor(k / 4) * 0.02,
        1.32,
      ),
    )
  // Lanterns along the west wall and over the waiting area, high so they keep out of the view.
  for (const [x, y] of [
    [0.5, 3.0],
    [0.5, 6.2],
    [0.5, 9.0],
    [5.0, 1.6],
    [9.0, 1.6],
  ] as const) {
    group.add(place(lantern(0.2), x, y, 2.45))
    group.add(place(box(0.01, 0.4, 0.01, M.black), x, y, 2.8))
  }
}

/** The low wall between the dining room and the back of house, with its counters. */
function lowWall(group: THREE.Group) {
  const y = BACK_OF_HOUSE_Y
  const plaster = mat(0xf0e2c9)
  const openings = [F.dishReturn, F.pass, F.bar].map((b) => [b.x - b.w / 2, b.x + b.w / 2] as const)
  let x = 0
  for (const [a, b] of openings) {
    if (a > x) group.add(wall({ x: (x + a) / 2, y, w: a - x, d: 0.2 }, LOW_H, plaster))
    x = b
  }
  if (x < ROOM.w) group.add(wall({ x: (x + ROOM.w) / 2, y, w: ROOM.w - x, d: 0.2 }, LOW_H, plaster))
  // Dish return: a steel shelf with racks, and a grey bin for scraps beside it.
  group.add(block(F.dishReturn, 0.9, M.steel))
  group.add(place(box(0.5, 0.12, 0.4, M.steelDark), F.dishReturn.x - 0.25, F.dishReturn.y, 0.96))
  group.add(
    place(cylinder(0.16, 0.14, 0.35, M.rubber, 14), F.dishReturn.x + 0.85, F.dishReturn.y - 0.4, 0.175),
  )
  // The pass: a steel counter under heat lamps, a rail of order tickets above.
  group.add(block(F.pass, 0.95, M.steel))
  group.add(place(box(F.pass.w, 0.08, 0.18, M.steelDark), F.pass.x, F.pass.y, 1.8))
  for (const dx of [-1.4, -0.47, 0.47, 1.4])
    group.add(place(box(0.55, 0.03, 0.12, M.heat), F.pass.x + dx, F.pass.y, 1.75))
  for (const dx of [-1.9, 1.9])
    group.add(place(box(0.05, 0.85, 0.05, M.steelDark), F.pass.x + dx, F.pass.y, 1.38))
  for (let k = 0; k < 5; k++)
    group.add(place(box(0.08, 0.12, 0.005, M.ticket), F.pass.x - 1.2 + k * 0.5, F.pass.y - 0.1, 1.68))
  // The dining room's speaker, on the low wall over the supplies cabinet, facing the guests.
  group.add(speaker(BAR_X - 1.5, y))
  // Today's dishes hang over the low wall's west end, clear of the pass and the arm behind it.
  const today = { x: 2.6, y: BACK_OF_HOUSE_Y }
  for (const dx of [-1.6, 1.6])
    group.add(place(box(0.05, 0.8, 0.05, M.rosewood), today.x + dx, today.y, LOW_H + 0.4))
  group.add(
    place(
      menuBoard('今日推荐 Today', ['宫保鸡丁', '麻婆豆腐', '清蒸鲈鱼', '小笼包', '扬州炒饭'], 3.8),
      today.x,
      today.y,
      LOW_H + 0.8 + 0.31,
    ),
  )
  // The bar counter: dark wood, a lacquer front with gold edging.
  group.add(block(F.bar, 1.05, M.rosewood))
  group.add(place(box(F.bar.w, 0.7, 0.02, M.lacquer), F.bar.x, F.bar.y - F.bar.d / 2 - 0.01, 0.5))
  group.add(place(box(F.bar.w, 0.03, 0.03, M.gold), F.bar.x, F.bar.y - F.bar.d / 2 - 0.02, 0.86))
  group.add(place(box(F.bar.w + 0.1, 0.05, F.bar.d + 0.1, M.wood), F.bar.x, F.bar.y, 1.07))
  // The wall between the kitchen and the bar.
  group.add(wall({ x: BAR_X, y: (y + ROOM.d) / 2, w: 0.15, d: ROOM.d - y }, 1.9, plaster))
  // The drinks board on the wall's bar side, facing the room.
  group.add(
    place(
      menuBoard('茶 · 饮 Drinks', ['菊花茶', '酸梅汤', '豆浆', '鲜榨橙汁', '可乐'], 3.6),
      BAR_X + 0.1,
      (y + ROOM.d) / 2,
      1.45,
      0,
    ),
  )
}

/** The kitchen: tiled floor, cold store, shelves of produce, prep counter, wok, stove, sink, dishwasher. */
async function kitchen(group: THREE.Group) {
  group.add(
    floor(
      { x: BAR_X / 2, y: (BACK_OF_HOUSE_Y + ROOM.d) / 2, w: BAR_X, d: ROOM.d - BACK_OF_HOUSE_Y },
      pbr('anti_skid_tiles', [8, 2.2]),
    ),
  )
  // Cold store: a tall steel cabinet with two doors and a little display.
  group.add(block(F.coldStore, 2.3, M.steel))
  for (const dx of [-0.07, 0.07])
    group.add(place(box(0.03, 0.6, 0.05, M.steelDark), F.coldStore.x + dx, F.coldStore.y - 0.47, 1.2))
  group.add(place(box(0.25, 0.1, 0.01, M.screen), F.coldStore.x + 0.5, F.coldStore.y - 0.455, 1.8))
  // Steel shelves of produce: crates, a basket, onions, pots.
  await prop(group, 'steel_frame_shelves_01', F.shelves.x - 0.6, F.shelves.y, 270)
  await prop(group, 'steel_frame_shelves_01', F.shelves.x + 0.6, F.shelves.y, 270)
  await prop(group, 'wooden_crate_01', F.shelves.x - 0.6, F.shelves.y, 270, 0.06, 0.95)
  await prop(group, 'plastic_crate_01', F.shelves.x + 0.4, F.shelves.y, 270, 0.06)
  await prop(group, 'plastic_crate_01', F.shelves.x + 0.85, F.shelves.y, 270, 0.06)
  await prop(group, 'wicker_basket_01', F.shelves.x - 0.6, F.shelves.y, 270, 0.82)
  await prop(group, 'brass_pot_01', F.shelves.x + 0.6, F.shelves.y, 270, 0.82)
  await prop(group, 'pot_enamel_01', F.shelves.x + 0.6, F.shelves.y, 270, 1.6)
  for (let k = 0; k < 6; k++)
    await prop(
      group,
      'yellow_onion',
      F.shelves.x - 0.8 + (k % 3) * 0.1,
      F.shelves.y - 0.05 + Math.floor(k / 3) * 0.1,
      k * 50,
      0.88,
    )
  // Prep counter: a tiled splashback, two boards, vegetables, a knife.
  group.add(block(F.prep, 0.9, M.steel))
  group.add(place(box(F.prep.w, 0.6, 0.02, M.tileWall), F.prep.x, F.prep.y + F.prep.d / 2 - 0.01, 1.2))
  await prop(group, 'wooden_cutting_board', F.prep.x - 0.7, F.prep.y - 0.05, 270, 0.9)
  await prop(group, 'wooden_cutting_board', F.prep.x + 0.6, F.prep.y - 0.05, 270, 0.9)
  await prop(group, 'food_ginger_01', F.prep.x - 0.7, F.prep.y - 0.05, 30, 0.94, 0.6)
  await prop(group, 'sweet_potato', F.prep.x + 0.5, F.prep.y - 0.05, 10, 0.94)
  await prop(group, 'sweet_potato', F.prep.x + 0.7, F.prep.y, 80, 0.94)
  await prop(group, 'food_pears_asian_01', F.prep.x + 1.2, F.prep.y + 0.1, 270, 0.9)
  group.add(place(box(0.03, 0.012, 0.22, M.steel), F.prep.x - 0.45, F.prep.y - 0.1, 0.95))
  // A rail of ladles and strainers on the wall above the stations.
  group.add(place(box(5.2, 0.03, 0.03, M.steelDark), 11, ROOM.d - 0.06, 2.1))
  for (let k = 0; k < 9; k++) {
    const x = 8.8 + k * 0.55
    group.add(place(box(0.015, 0.4, 0.015, M.steel), x, ROOM.d - 0.08, 1.9))
    group.add(place(cylinder(0.06, 0.04, 0.04, k % 3 ? M.steel : M.steelDark, 10), x, ROOM.d - 0.1, 1.7))
  }
  // The wok station: burner ring with a blue flame, the wok, two seasoning pots, an extractor hood.
  group.add(block(F.wok, 0.9, M.steelDark))
  group.add(place(cylinder(0.26, 0.26, 0.04, M.black), F.wok.x - 0.25, F.wok.y, 0.92))
  group.add(place(cylinder(0.2, 0.2, 0.02, M.flame, 24), F.wok.x - 0.25, F.wok.y, 0.95))
  const wok = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.6),
    new THREE.MeshStandardMaterial({
      color: 0x1d1d1d,
      metalness: 0.7,
      roughness: 0.35,
      side: THREE.DoubleSide,
    }),
  )
  wok.castShadow = true
  group.add(place(wok, F.wok.x - 0.25, F.wok.y, 1.25))
  group.add(place(cylinder(0.12, 0.1, 0.18, M.steel, 12), F.wok.x + 0.5, F.wok.y + 0.1, 0.99))
  group.add(place(cylinder(0.12, 0.1, 0.18, M.steel, 12), F.wok.x + 0.5, F.wok.y - 0.18, 0.99))
  group.add(place(box(F.wok.w + 0.1, 0.4, 0.85, M.steel), F.wok.x, F.wok.y + 0.05, 2.25))
  // The stove: a stock pot, a stack of bamboo steamers, a rice cooker, an extractor hood.
  group.add(block(F.stove, 0.9, M.steelDark))
  group.add(place(cylinder(0.22, 0.22, 0.36, M.steel), F.stove.x - 0.5, F.stove.y, 1.08))
  for (let k = 0; k < 4; k++)
    group.add(place(cylinder(0.21, 0.21, 0.1, M.bamboo), F.stove.x + 0.1, F.stove.y, 0.95 + k * 0.105))
  group.add(place(cylinder(0.18, 0.16, 0.24, M.porcelain), F.stove.x + 0.62, F.stove.y, 1.02))
  group.add(place(box(F.stove.w + 0.1, 0.4, 0.85, M.steel), F.stove.x, F.stove.y + 0.05, 2.25))
  // The sink: two basins, a tap, a drying rack.
  group.add(block(F.sink, 0.9, M.steel))
  for (const dx of [-0.5, 0.15])
    group.add(place(box(0.55, 0.02, 0.45, M.steelDark), F.sink.x + dx, F.sink.y, 0.905))
  group.add(place(cylinder(0.015, 0.015, 0.35, M.steel, 8), F.sink.x - 0.17, F.sink.y + 0.27, 1.07))
  group.add(place(box(0.5, 0.25, 0.35, M.steelDark), F.sink.x + 0.8, F.sink.y, 1.03))
  // The dishwasher behind the dish return.
  group.add(block(F.dishwasher, 1.5, M.steel))
  group.add(place(box(0.9, 0.05, 0.02, M.steelDark), F.dishwasher.x, F.dishwasher.y - 0.36, 1.2))
  // Where the arm stands: a round steel plinth (the arm itself is a device).
  group.add(place(cylinder(0.32, 0.38, 0.14, M.steelDark), ARM_BASE.x, ARM_BASE.y, 0.07))
  // A prep island: steel, with bowls of chopped vegetables, a stack of plates and a scale.
  group.add(block(F.island, 0.9, M.steel))
  const veg = [0x5aa04a, 0xd8452f, 0xf0d060, 0xf3efe0, 0x7a4a2a]
  for (let k = 0; k < 5; k++) {
    const x = F.island.x - 0.9 + k * 0.38
    group.add(place(cylinder(0.12, 0.08, 0.08, M.steel, 14), x, F.island.y - 0.15, 0.94))
    group.add(
      place(
        cylinder(0.1, 0.1, 0.03, mat(veg[k] as number, { roughness: 0.8 }), 14),
        x,
        F.island.y - 0.15,
        0.97,
      ),
    )
  }
  for (let k = 0; k < 6; k++)
    group.add(
      place(
        cylinder(0.12, 0.1, 0.012, M.porcelain, 18),
        F.island.x + 0.8,
        F.island.y + 0.2,
        0.91 + k * 0.014,
      ),
    )
  group.add(place(box(0.25, 0.06, 0.2, M.steelDark), F.island.x - 0.6, F.island.y + 0.22, 0.93))
  // A bin and stacked crates by the cold store.
  group.add(place(cylinder(0.22, 0.2, 0.6, M.rubber, 16), 2.4, 11.4, 0.3))
  await prop(group, 'wooden_crate_01', 1.0, 12.2, 10, 0, 0.9)
  await prop(group, 'wooden_crate_01', 1.0, 12.25, 25, 0.33, 0.9)
}

/** The drinks bar: dark planks, back shelves of bottles and jars, a tea urn, a juicer, glasses. */
async function bar(group: THREE.Group) {
  group.add(
    floor(
      {
        x: (BAR_X + ROOM.w) / 2,
        y: (BACK_OF_HOUSE_Y + ROOM.d) / 2,
        w: ROOM.w - BAR_X,
        d: ROOM.d - BACK_OF_HOUSE_Y,
      },
      pbr('dark_wooden_planks', [2.5, 2]),
    ),
  )
  const S = F.barShelves
  group.add(place(box(S.w, 2.4, 0.05, M.rosewood), S.x, S.y + S.d / 2 - 0.03, 1.2))
  group.add(block(S, 0.9, M.rosewood))
  for (const h of [1.35, 1.8, 2.25]) group.add(place(box(S.w, 0.04, S.d, M.wood), S.x, S.y, h))
  // Bottles on the two lower shelves: a few scanned ones in the middle, simple ones round them.
  const colours = [0x2f5a3a, 0x7a3b1c, 0x8a2f3a, 0x2f4f7a, 0xd8cfa8]
  for (const [row, h] of [1.37, 1.82].entries())
    for (let k = 0; k < 22; k++) {
      const x = S.x - S.w / 2 + 0.15 + k * 0.2
      if (k >= 9 && k <= 12) await prop(group, 'wine_bottles_01', x, S.y, 270, h)
      else {
        const colour = colours[(k + row * 3) % colours.length] as number
        group.add(place(cylinder(0.035, 0.038, 0.22, mat(colour, { roughness: 0.25 }), 10), x, S.y, h + 0.11))
        group.add(place(cylinder(0.012, 0.03, 0.08, mat(colour, { roughness: 0.25 }), 8), x, S.y, h + 0.26))
      }
    }
  for (let k = 0; k < 8; k++)
    await prop(group, 'ceramic_vase_01', S.x - 2 + k * 0.55, S.y, k * 40, 2.27, 0.45)
  // On the back counter: a tea urn, a juicer, rows of glasses.
  group.add(place(cylinder(0.18, 0.18, 0.5, M.steel), S.x - 1.6, S.y - 0.05, 1.15))
  group.add(place(box(0.3, 0.45, 0.3, M.porcelain), S.x - 0.9, S.y - 0.05, 1.12))
  for (let k = 0; k < 10; k++)
    group.add(
      place(
        cylinder(0.035, 0.03, 0.1, M.glass, 10),
        S.x + (k % 5) * 0.12,
        S.y - 0.1 + Math.floor(k / 5) * 0.12,
        0.95,
      ),
    )
  await prop(group, 'wooden_lantern_01', F.bar.x - 2, F.bar.y, 270, 1.1, 0.8)
  await prop(group, 'tea_set_01', F.bar.x + 1.2, F.bar.y, 250, 1.095)
  // Where the bar's robot stands: a mat.
  group.add(place(box(0.9, 0.01, 0.7, M.rubber), BARTENDER.x, BARTENDER.y, 0.005))
}

/** A speaker standing on a low wall at (x, y), facing south. */
function speaker(x: number, y: number): THREE.Group {
  const g = new THREE.Group()
  const h = LOW_H + 0.3
  g.add(place(box(0.42, 0.6, 0.3, M.black), x, y, h))
  for (const [dh, r] of [
    [-0.08, 0.13],
    [0.19, 0.05],
  ] as const) {
    const cone = cylinder(r, r, 0.02, M.steelDark, 18)
    cone.rotation.x = Math.PI / 2
    g.add(place(cone, x, y - 0.16, h + dh))
  }
  return g
}

/** The private room: low walls like the near ones, a door frame, its name toward the view, a carpet. */
function privateRoom(group: THREE.Group) {
  const { x0, x1, y0, y1, door } = PRIVATE_ROOM
  const plaster = mat(0xf0e2c9)
  for (const b of privateWalls()) group.add(wall(b, LOW_H, plaster))
  for (const y of [door.y0, door.y1]) group.add(place(box(0.14, 2.2, 0.14, M.rosewood), x0, y, 1.1))
  group.add(place(box(0.14, 0.12, door.y1 - door.y0 + 0.14, M.rosewood), x0, (door.y0 + door.y1) / 2, 2.2))
  group.add(place(sign('包间 · 牡丹厅', 1.6, 0.32), x0 + 1.4, y0 - 0.09, LOW_H - 0.3))
  group.add(place(rug(x1 - x0 - 0.4, y1 - y0 - 0.4), (x0 + x1) / 2, (y0 + y1) / 2, 0.004))
  group.add(speaker(PRIVATE_SPEAKER.x, PRIVATE_SPEAKER.y))
}

/** The children's play area: soft tiles, a low fence, a slide and a ball pit. */
function playArea(group: THREE.Group) {
  const { x0, x1, y0, y1 } = PLAY_AREA
  const colours = [0xff8fa3, 0xffd166, 0x7bd389, 0x6fb3ff, 0xb39ddb]
  const tiles = colours.map((c) => mat(c, { roughness: 1 }))
  const size = 0.6
  for (let i = 0; x0 + i * size < x1 - 0.05; i++)
    for (let j = 0; y0 + j * size < y1 - 0.05; j++) {
      const w = Math.min(size, x1 - (x0 + i * size)) - 0.02
      const d = Math.min(size, y1 - (y0 + j * size)) - 0.02
      const tile = box(w, 0.03, d, tiles[(i * 2 + j) % tiles.length] as THREE.Material)
      group.add(place(tile, x0 + i * size + w / 2 + 0.01, y0 + j * size + d / 2 + 0.01, 0.015))
    }
  // A low fence of white rails on bright posts.
  const rail = mat(0xfaf6ee, { roughness: 0.5 })
  for (const b of playFence()) {
    group.add(place(box(b.w, 0.05, b.d, rail), b.x, b.y, 0.55))
    group.add(place(box(b.w, 0.05, b.d, rail), b.x, b.y, 0.3))
    const along = b.w > b.d
    const n = Math.max(1, Math.round((along ? b.w : b.d) / 0.5))
    for (let k = 0; k <= n; k++) {
      const f = k / n - 0.5
      group.add(
        place(
          box(0.07, 0.62, 0.07, tiles[k % tiles.length] as THREE.Material),
          b.x + (along ? f * b.w : 0),
          b.y + (along ? 0 : f * b.d),
          0.31,
        ),
      )
    }
  }
  // The slide: a ladder up to a platform, and a chute down toward the east.
  const S = PLAY.slide
  const red = mat(0xe84a4a, { roughness: 0.5 })
  const yellow = mat(0xffcc33, { roughness: 0.5 })
  const top = 0.8
  for (const dy of [-0.2, 0.2]) {
    group.add(place(box(0.05, top + 0.5, 0.05, yellow), S.ladder.x, S.ladder.y + dy, (top + 0.5) / 2))
    group.add(place(box(0.05, top, 0.05, yellow), S.top.x + 0.15, S.top.y + dy, top / 2))
  }
  for (let k = 1; k <= 3; k++)
    group.add(place(box(0.04, 0.03, 0.42, yellow), S.ladder.x, S.ladder.y, k * 0.22))
  group.add(place(box(0.45, 0.06, 0.5, yellow), S.top.x, S.top.y, top))
  const run = S.foot.x - S.top.x - 0.2
  const chute = box(Math.hypot(run, top), 0.04, 0.42, red)
  chute.rotation.z = -Math.atan2(top, run)
  group.add(place(chute, S.top.x + 0.2 + run / 2, S.top.y, top / 2 + 0.03))
  for (const dy of [-0.22, 0.22]) {
    const side = box(Math.hypot(run, top), 0.1, 0.03, red)
    side.rotation.z = chute.rotation.z
    group.add(place(side, S.top.x + 0.2 + run / 2, S.top.y + dy, top / 2 + 0.08))
  }
  // The ball pit: a soft blue ring full of coloured balls.
  const P = PLAY.pit
  const ring = new THREE.Mesh(new THREE.TorusGeometry(P.r, 0.09, 10, 32), mat(0x4d8ee8, { roughness: 0.8 }))
  ring.rotation.x = Math.PI / 2
  group.add(place(ring, P.x, P.y, 0.22))
  group.add(place(cylinder(P.r, P.r, 0.2, mat(0x4d8ee8, { roughness: 0.8 }), 32), P.x, P.y, 0.1))
  const balls = colours.map((c) => mat(c, { roughness: 0.4 }))
  for (let k = 0; k < 40; k++) {
    const a = k * 2.4
    const r = Math.sqrt((k + 0.5) / 40) * (P.r - 0.08)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), balls[k % balls.length])
    group.add(place(ball, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 0.24 + (k % 3) * 0.03))
  }
}

/** Charging pads for the runner and the cleaner, by the east wall. */
function pads(group: THREE.Group) {
  for (const home of [HOMES.runner, HOMES.cleaner]) {
    group.add(place(box(0.85, 0.02, 0.85, M.pad), home.x, home.y, 0.01))
    group.add(place(box(0.86, 0.022, 0.04, M.padGlow), home.x, home.y - 0.41, 0.011))
    group.add(place(box(0.1, 0.5, 0.5, M.pad), ROOM.w - 0.08, home.y, 0.25))
    group.add(place(box(0.02, 0.08, 0.3, M.padGlow), ROOM.w - 0.14, home.y, 0.4))
  }
}

export interface Room {
  group: THREE.Group
}

export async function buildRoom(): Promise<Room> {
  const group = new THREE.Group()
  group.add(
    floor(
      { x: ROOM.w / 2, y: BACK_OF_HOUSE_Y / 2, w: ROOM.w, d: BACK_OF_HOUSE_Y },
      pbr('herringbone_parquet', [7, 3.5]),
    ),
  )
  await walls(group)
  await street(group)
  await foyer(group)
  await dining(group)
  lowWall(group)
  privateRoom(group)
  playArea(group)
  await kitchen(group)
  await bar(group)
  pads(group)
  // Hundreds of small parts, all still: one mesh per look.
  bake(group)
  return { group }
}
