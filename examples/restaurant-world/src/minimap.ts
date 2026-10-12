import * as THREE from 'three'
import { BACK_OF_HOUSE_Y, BAR_X, DOOR, FIXTURES, ROOM, TABLES } from './layout.js'
import type { Service } from './live/service.js'

/** The part of the floor map the minimap shows, in map coordinates (x east, y north, metres). */
const VIEW = { x0: -0.6, x1: ROOM.w + 0.6, y0: -1.8, y1: ROOM.d + 0.6 }
const SCALE = 12 // CSS pixels per metre
const W = (VIEW.x1 - VIEW.x0) * SCALE
const H = (VIEW.y1 - VIEW.y0) * SCALE
const TEXT = '#f7eee3'
const MUTED = 'rgba(205, 180, 154, 0.85)'
const ACCENT = '#ffb45c'
const GUEST = '#ffd34d'
const STATUS: Record<string, string> = {
  free: 'rgba(247, 238, 227, 0.35)',
  reserved: 'rgba(255, 180, 92, 0.75)',
  occupied: 'rgba(142, 162, 255, 0.85)',
  needs_clearing: 'rgba(255, 107, 87, 0.8)',
}

export interface Mark {
  id: string
  label: string
  object: THREE.Object3D
  moving: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Canvas position of a world point (x east, z south). */
const at = (x: number, z: number) => ({ cx: (x - VIEW.x0) * SCALE, cy: (VIEW.y1 + z) * SCALE })
/** Canvas position of a plan point (x east, y north). */
const plan = (x: number, y: number) => at(x, -y)

/**
 * A small plan of the room in the top-right corner: walls, counters, the tables coloured by their
 * status, the guest, and every device where it is now, redrawn a few times a second. `M` toggles
 * it; ?minimap=0 hides it.
 */
export function buildMinimap(
  marks: Mark[],
  guest: THREE.Object3D,
  service: () => Service | undefined,
  words: () => { title: string; axes: string },
): HTMLCanvasElement {
  const dpr = Math.min(devicePixelRatio, 2)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.id = 'minimap'
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '14px',
    right: '14px',
    width: `${W}px`,
    height: `${H}px`,
    borderRadius: '8px',
    border: '1px solid rgba(226, 160, 120, 0.35)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
  })
  const background = drawBackground(dpr)
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  const p = new THREE.Vector3()
  const dot = (x: number, y: number, r: number, fill: string) => {
    g.fillStyle = fill
    g.strokeStyle = 'rgba(22, 16, 13, 0.9)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
  const draw = () => {
    if (canvas.hidden) return
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, canvas.width, canvas.height)
    g.drawImage(background, 0, 0)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Tables, coloured by what floor-01 would report for them.
    const s = service()
    for (const t of TABLES) {
      g.fillStyle = STATUS[s?.status(t.id) ?? 'free'] as string
      const top = t.top
      if ('r' in top) {
        const { cx, cy } = plan(top.x, top.y)
        g.beginPath()
        g.arc(cx, cy, top.r * SCALE, 0, Math.PI * 2)
        g.fill()
      } else {
        const { cx, cy } = plan(top.x - top.w / 2, top.y + top.d / 2)
        g.fillRect(cx, cy, top.w * SCALE, top.d * SCALE)
      }
      const { cx, cy } = plan(t.x, t.y)
      g.fillStyle = '#17110e'
      g.font = '700 9px ui-monospace, "SF Mono", Menlo, monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(t.id.slice(1), cx, cy)
    }
    const { title, axes } = words()
    g.fillStyle = TEXT
    g.font = '600 10px ui-sans-serif, system-ui, sans-serif'
    // Under the room, along the street: what the map is, and which way its axes run.
    g.textAlign = 'left'
    g.textBaseline = 'bottom'
    g.fillText(title, 6, H - 4)
    g.font = '9px ui-monospace, "SF Mono", Menlo, monospace'
    g.fillStyle = MUTED
    g.textAlign = 'right'
    g.fillText(axes, W - 6, H - 4)
    // Devices, moving ones larger and with a heading; then the guest.
    const shown = marks.map((m) => {
      m.object.getWorldPosition(p)
      const { cx, cy } = at(p.x, p.z)
      return { ...m, x: clamp(cx, 4, W - 4), y: clamp(cy, 4, H - 4) }
    })
    const taken: [number, number, number, number][] = []
    for (const { object, moving, x, y } of shown) {
      dot(x, y, moving ? 3.6 : 2.6, moving ? ACCENT : TEXT)
      taken.push([x - 3, y - 3, 6, 6])
      if (moving) {
        // rotation.y of the model: 0 faces +z, south, which is down the map.
        const h = object.rotation.y
        g.strokeStyle = ACCENT
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + Math.sin(h) * 9, y + Math.cos(h) * 9)
        g.stroke()
      }
    }
    if (guest.visible) {
      guest.getWorldPosition(p)
      const { cx, cy } = at(p.x, p.z)
      dot(cx, cy, 4, GUEST)
      taken.push([cx - 4, cy - 4, 8, 8])
    }
    // Labels, the moving devices first, each where it covers no other label or dot.
    g.font = '600 9px ui-monospace, "SF Mono", Menlo, monospace'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    for (const { label, moving, x, y } of [...shown].sort((a, b) => Number(b.moving) - Number(a.moving))) {
      const w = g.measureText(label).width + 4
      const spots: [number, number][] = [
        [x + 6, y - 6],
        [x + 6, y + 6],
        [x - 6 - w, y - 6],
        [x - 6 - w, y + 6],
        [x - w / 2, y - 12],
        [x - w / 2, y + 12],
      ]
      const fits = (sx: number, sy: number) =>
        sx >= 2 &&
        sx + w <= W - 2 &&
        sy - 5 >= 2 &&
        sy + 5 <= H - 16 &&
        !taken.some(([tx, ty, tw, th]) => sx < tx + tw && sx + w > tx && sy - 5 < ty + th && sy + 5 > ty)
      const spot = spots.find(([sx, sy]) => fits(sx, sy))
      if (!spot) continue
      const [sx, sy] = spot
      taken.push([sx, sy - 5, w, 10])
      g.fillStyle = 'rgba(22, 16, 13, 0.7)'
      g.fillRect(sx, sy - 5, w, 10)
      g.fillStyle = moving ? ACCENT : TEXT
      g.fillText(label, sx + 2, sy)
    }
  }
  draw()
  setInterval(draw, 250)
  return canvas
}

/** The walls and counters, drawn once. */
function drawBackground(dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.scale(dpr, dpr)
  g.fillStyle = 'rgba(22, 16, 13, 0.8)'
  g.fillRect(0, 0, W, H)
  // The floor, then the kitchen and the bar a shade darker behind the low wall.
  const floor = plan(0, ROOM.d)
  g.fillStyle = 'rgba(160, 104, 70, 0.22)'
  g.fillRect(floor.cx, floor.cy, ROOM.w * SCALE, ROOM.d * SCALE)
  const back = plan(0, ROOM.d)
  g.fillStyle = 'rgba(120, 120, 128, 0.18)'
  g.fillRect(back.cx, back.cy, ROOM.w * SCALE, (ROOM.d - BACK_OF_HOUSE_Y) * SCALE)
  // Walls, with the door's gap.
  g.strokeStyle = 'rgba(247, 238, 227, 0.7)'
  g.lineWidth = 2
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const a = plan(x0, y0)
    const b = plan(x1, y1)
    g.beginPath()
    g.moveTo(a.cx, a.cy)
    g.lineTo(b.cx, b.cy)
    g.stroke()
  }
  line(0, 0, DOOR.x0, 0)
  line(DOOR.x1, 0, ROOM.w, 0)
  line(ROOM.w, 0, ROOM.w, ROOM.d)
  line(ROOM.w, ROOM.d, 0, ROOM.d)
  line(0, ROOM.d, 0, 0)
  g.lineWidth = 1
  line(0, BACK_OF_HOUSE_Y, ROOM.w, BACK_OF_HOUSE_Y)
  line(BAR_X, BACK_OF_HOUSE_Y, BAR_X, ROOM.d)
  // Counters and furniture.
  g.fillStyle = 'rgba(233, 222, 205, 0.32)'
  for (const f of Object.values(FIXTURES)) {
    const { cx, cy } = plan(f.x - f.w / 2, f.y + f.d / 2)
    g.fillRect(cx, cy, f.w * SCALE, f.d * SCALE)
  }
  return canvas
}
