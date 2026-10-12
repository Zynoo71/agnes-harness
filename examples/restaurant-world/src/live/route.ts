/**
 * Plain geometry on the ground plane, without three.js, so it can be tested on its own. World
 * coordinates: x east, z south, metres. The map frame devices report in is x east, y north (y = −z),
 * with yaw in degrees counter-clockwise from east.
 */

export interface Point {
  x: number
  z: number
}

export interface Circle extends Point {
  r: number
}

export const toMap = (p: Point) => ({ x: round(p.x), y: round(-p.z) })
export const fromMap = (x: number, y: number): Point => ({ x, z: -y })
export const round = (n: number, digits = 2) => Number(n.toFixed(digits))

/** A heading in three.js terms (rotation.y of a model facing +z) toward `to`. */
export const headingTo = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z)

/** Map yaw in degrees for a model facing +z turned by `heading` (rotation.y). */
export const yawOf = (heading: number) => {
  const deg = (Math.atan2(-Math.cos(heading), Math.sin(heading)) * 180) / Math.PI
  return round(((deg % 360) + 360) % 360, 1)
}

/** Distance from point c to the segment a–b, and the closest point on it. */
export function toSegment(a: Point, b: Point, c: Point): { d: number; p: Point; t: number } {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2))
  const p = { x: a.x + t * dx, z: a.z + t * dz }
  return { d: Math.hypot(c.x - p.x, c.z - p.z), p, t }
}

/** The first obstacle, along a → b, that a body of half-width `clearance` would touch. */
export function firstBlocking(
  a: Point,
  b: Point,
  obstacles: Circle[],
  clearance: number,
): Circle | undefined {
  let best: { o: Circle; t: number } | undefined
  for (const o of obstacles) {
    const { d, t } = toSegment(a, b, o)
    if (d < o.r + clearance && (!best || t < best.t)) best = { o, t }
  }
  return best?.o
}

/**
 * The first obstacle a body of half-width `halfWidth` would touch going `reach` metres straight
 * ahead from its nose, `nose` metres in front of `at`.
 */
export function ahead<T extends Circle>(
  at: Point,
  heading: number,
  obstacles: T[],
  nose: number,
  halfWidth: number,
  reach: number,
): T | undefined {
  const dx = Math.sin(heading)
  const dz = Math.cos(heading)
  const from = { x: at.x + dx * nose, z: at.z + dz * nose }
  const r = Math.max(0, reach)
  return firstBlocking(from, { x: from.x + dx * r, z: from.z + dz * r }, obstacles, halfWidth) as
    | T
    | undefined
}

/** A grid of 1-byte cells in the map frame, top row first (as GridMap in map.ts): 0 is occupied. */
export interface Cells {
  resolution: number
  origin: [number, number]
  w: number
  h: number
  cells: Uint8Array
}

/**
 * A path on the ground from `from` to `to` (world points; the result excludes `from` and ends at
 * `to`) that keeps `body` metres from every occupied cell of `grid` and stays outside every circle
 * of `keepouts` (radii already include their clearance): A* over the cells, eight ways, then
 * shortened to the fewest straight legs that stay clear. Undefined when there is no such path.
 * Ground within `body` metres of `from` counts as free, so a robot can always leave where it is.
 */
export function planPath(
  grid: Cells,
  from: Point,
  to: Point,
  keepouts: Circle[],
  body: number,
): Point[] | undefined {
  const { w, h, resolution: res } = grid
  const [x0, y0] = grid.origin
  const top = y0 + h * res
  const col = (x: number) => Math.floor((x - x0) / res)
  const row = (z: number) => Math.floor((top + z) / res)
  const centre = (i: number, j: number) => ({ x: x0 + (i + 0.5) * res, z: -(top - (j + 0.5) * res) })
  // Blocked cells: occupied ones grown by `body`, and the keep-out circles.
  const blocked = new Uint8Array(w * h)
  const grow = Math.ceil(body / res)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (grid.cells[j * w + i] !== 0) continue
      for (let b = -grow; b <= grow; b++)
        for (let a = -grow; a <= grow; a++) {
          const ii = i + a
          const jj = j + b
          if (ii >= 0 && jj >= 0 && ii < w && jj < h && Math.hypot(a, b) * res <= body + res / 2)
            blocked[jj * w + ii] = 1
        }
    }
  for (const k of keepouts)
    for (let j = Math.max(0, row(k.z - k.r)); j <= Math.min(h - 1, row(k.z + k.r)); j++)
      for (let i = Math.max(0, col(k.x - k.r)); i <= Math.min(w - 1, col(k.x + k.r)); i++) {
        const c = centre(i, j)
        if (Math.hypot(c.x - k.x, c.z - k.z) < k.r) blocked[j * w + i] = 1
      }
  const free = (i: number, j: number) =>
    i >= 0 &&
    j >= 0 &&
    i < w &&
    j < h &&
    (blocked[j * w + i] === 0 || Math.hypot(centre(i, j).x - from.x, centre(i, j).z - from.z) <= body)
  const si = col(from.x)
  const sj = row(from.z)
  const gi = col(to.x)
  const gj = row(to.z)
  if (!free(gi, gj) || si < 0 || sj < 0 || si >= w || sj >= h) return undefined
  // A* with an octile distance; a binary heap of cell indices ordered by f.
  const g = new Float64Array(w * h).fill(Number.POSITIVE_INFINITY)
  const f = new Float64Array(w * h)
  const came = new Int32Array(w * h).fill(-1)
  const heap: number[] = []
  const push = (n: number) => {
    heap.push(n)
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if ((f[heap[p] as number] as number) <= (f[n] as number)) break
      heap[k] = heap[p] as number
      k = p
    }
    heap[k] = n
  }
  const pop = () => {
    const first = heap[0] as number
    const last = heap.pop() as number
    if (heap.length > 0) {
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        if (l >= heap.length) break
        const r = l + 1
        const c =
          r < heap.length && (f[heap[r] as number] as number) < (f[heap[l] as number] as number) ? r : l
        if ((f[heap[c] as number] as number) >= (f[last] as number)) break
        heap[k] = heap[c] as number
        k = c
      }
      heap[k] = last
    }
    return first
  }
  const octile = (i: number, j: number) => {
    const a = Math.abs(i - gi)
    const b = Math.abs(j - gj)
    return (Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b)) * res
  }
  const start = sj * w + si
  const goal = gj * w + gi
  g[start] = 0
  f[start] = octile(si, sj)
  push(start)
  const done = new Uint8Array(w * h)
  while (heap.length > 0) {
    const n = pop()
    if (n === goal) break
    if (done[n]) continue
    done[n] = 1
    const i = n % w
    const j = (n - i) / w
    for (let b = -1; b <= 1; b++)
      for (let a = -1; a <= 1; a++) {
        if ((a === 0 && b === 0) || !free(i + a, j + b)) continue
        // No cutting corners between two blocked cells.
        if (a !== 0 && b !== 0 && (!free(i + a, j) || !free(i, j + b))) continue
        const m = (j + b) * w + i + a
        const cost = (g[n] as number) + (a !== 0 && b !== 0 ? Math.SQRT2 : 1) * res
        if (cost < (g[m] as number)) {
          g[m] = cost
          f[m] = cost + octile(i + a, j + b)
          came[m] = n
          push(m)
        }
      }
  }
  if (goal !== start && came[goal] === -1) return undefined
  const cells: Point[] = []
  for (let n = goal; n !== -1 && n !== start; n = came[n] as number) {
    const i = n % w
    cells.push(centre(i, (n - i) / w))
  }
  cells.reverse()
  cells[cells.length - 1] = to
  // Shorten: from each point, go straight to the furthest later point the way to which is clear.
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (res / 4))
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      if (!free(col(a.x + (b.x - a.x) * t), row(a.z + (b.z - a.z) * t))) return false
    }
    return true
  }
  const path: Point[] = []
  let at = from
  let k = 0
  while (k < cells.length) {
    let next = k
    for (let m = cells.length - 1; m > k; m--)
      if (clear(at, cells[m] as Point)) {
        next = m
        break
      }
    at = cells[next] as Point
    path.push({ x: round(at.x, 1), z: round(at.z, 1) })
    k = next + 1
  }
  path[path.length - 1] = to
  return path
}

/** Whether nothing occupied in `grid` and no circle of `keepouts` lies within `r` metres of `p`. */
export function openAround(grid: Cells, keepouts: Circle[], p: Point, r: number): boolean {
  const { w, h, resolution: res } = grid
  const [x0, y0] = grid.origin
  const top = y0 + h * res
  for (
    let j = Math.max(0, Math.floor((top + p.z - r) / res));
    j <= Math.min(h - 1, Math.floor((top + p.z + r) / res));
    j++
  )
    for (
      let i = Math.max(0, Math.floor((p.x - r - x0) / res));
      i <= Math.min(w - 1, Math.floor((p.x + r - x0) / res));
      i++
    ) {
      if (grid.cells[j * w + i] !== 0) continue
      const cx = x0 + (i + 0.5) * res
      const cz = -(top - (j + 0.5) * res)
      if (Math.hypot(cx - p.x, cz - p.z) <= r + res / 2) return false
    }
  return !keepouts.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < k.r + r)
}

/**
 * A path from `from` to `to` like planPath, or, when `to` itself cannot be reached (under a
 * table, behind the counter), to the nearest point within `within` metres of it that can. `end` is
 * where the path ends.
 */
export function planNear(
  grid: Cells,
  from: Point,
  to: Point,
  keepouts: Circle[],
  body: number,
  within = 4,
): { path: Point[]; end: Point } | undefined {
  const direct = planPath(grid, from, to, keepouts, body)
  if (direct) return { path: direct, end: to }
  for (let r = 0.5; r <= within; r += 0.5) {
    const ring = Array.from({ length: 16 }, (_, k) => ({
      x: round(to.x + Math.cos((k / 16) * Math.PI * 2) * r, 1),
      z: round(to.z + Math.sin((k / 16) * Math.PI * 2) * r, 1),
    })).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))
    for (const end of ring) {
      const path = planPath(grid, from, end, keepouts, body)
      if (path) return { path, end }
    }
  }
  return undefined
}
