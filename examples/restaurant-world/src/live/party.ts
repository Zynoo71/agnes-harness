import { CHILD_OUTFIT, guest, OUTFITS } from '../actors.js'
import { babyChairSpot, besideSeat, type Seat, TABLES } from '../layout.js'
import { rotY } from '../shapes.js'
import { fromMap, type Point, planNear } from './route.js'
import type { Companion, World } from './world.js'

/** Metres between people walking in a line, and how fast the others can catch up. */
const GAP = 0.75
const SPEED = 2.4
/** How high a child sits on the baby chair. */
const HIGH_CHAIR = 0.42

/**
 * The guest's party: the others who came with them, built at every reset from `world.party`. They
 * walk in a line behind the guest along the way the guest went, take the seats nearest the guest's
 * once the guest sits, and leave behind them. A small child stands beside the guest's seat until a
 * baby chair is served there, then sits on it. Page-side only: devices see the party through
 * host-01's state.
 */
export function partyOf(world: World): void {
  const lead = world.actors.guest.object
  /** Where the guest has been, newest first. */
  let trail: Point[] = []
  let members: Companion[] = []

  const build = () => {
    for (const m of members) m.figure.object.removeFromParent()
    const { size, kid } = world.party
    const n = Math.max(0, Math.min(7, size - 1))
    members = Array.from({ length: n }, (_, k) => {
      const child = kid && k === n - 1
      const figure = guest(child ? CHILD_OUTFIT : OUTFITS[k % OUTFITS.length], child)
      world.actors.group.add(figure.object)
      return { figure, child, held: false, odometer: 0, path: [] }
    })
    world.companions = members
    // In a line behind the guest, out in the street to the south.
    trail = Array.from({ length: n + 2 }, (_, k) => ({ x: lead.position.x, z: lead.position.z + k * GAP }))
    members.forEach((m, k) => {
      const p = trail[k + 1] as Point
      m.figure.object.position.set(p.x, 0, p.z)
      m.figure.object.rotation.y = lead.rotation.y
      m.figure.stand()
    })
  }

  /** The point `d` metres back along the guest's way. */
  const along = (d: number): Point => {
    let left = d
    let prev: Point = { x: lead.position.x, z: lead.position.z }
    for (const p of trail) {
      const seg = Math.hypot(p.x - prev.x, p.z - prev.z)
      if (seg >= left) {
        const f = left / Math.max(seg, 1e-6)
        return { x: prev.x + (p.x - prev.x) * f, z: prev.z + (p.z - prev.z) * f }
      }
      left -= seg
      prev = p
    }
    return prev
  }

  /** A way round the furniture from `from` to plan point `to`, as the guest walks it. */
  const route = (from: Point, to: { x: number; y: number }): Point[] => {
    const plan = planNear(world.planGrid(), from, fromMap(to.x, to.y), [], 0.22, 1)
    return plan ? plan.path : [fromMap(to.x, to.y)]
  }

  const step = (dt: number) => {
    const s = world.service
    const head = trail[0]
    if (!head || Math.hypot(lead.position.x - head.x, lead.position.z - head.z) > 0.1) {
      trail.unshift({ x: lead.position.x, z: lead.position.z })
      trail.length = Math.min(trail.length, 400)
    }
    const t = s.guest === 'seated' ? TABLES.find((x) => x.id === s.table) : undefined
    const mine = t && s.seat
    const chairAt = mine ? babyChairSpot(t, mine) : undefined
    const kid = members.some((m) => m.child)
    const chair = s.supplies.some((x) => x.item === 'baby_chair' && x.stage === 'served')
    members.forEach((m, k) => {
      const o = m.figure.object
      o.visible = lead.visible
      if (m.held) return
      const at = { x: o.position.x, z: o.position.z }
      let rest: { yaw: number; sit: boolean; h: number } | undefined
      if (mine && t) {
        // Seated: each takes the free seat nearest the guest's, the child the spot for a baby chair;
        // they walk round to behind it and step in.
        if (!m.seat) {
          const taken = members.map((x) => x.seat).filter(Boolean)
          const free = t.seats
            .filter((x) => Math.hypot(x.x - mine.x, x.y - mine.y) > 0.05 && !taken.includes(x))
            .filter((x) => !kid || !chairAt || Math.hypot(x.x - chairAt.x, x.y - chairAt.y) > 0.6)
            .sort((a, b) => Math.hypot(a.x - mine.x, a.y - mine.y) - Math.hypot(b.x - mine.x, b.y - mine.y))
          const seat: Seat | undefined = m.child && chairAt ? { ...chairAt, yaw: mine.yaw } : free[0]
          if (seat) {
            m.seat = seat
            m.table = t
            m.path = [...route(at, m.child ? seat : besideSeat(t, seat)), fromMap(seat.x, seat.y)]
          }
        }
        if (m.seat) rest = { yaw: m.seat.yaw, sit: !m.child || chair, h: m.child && chair ? HIGH_CHAIR : 0 }
      } else if (m.seat && m.table) {
        // Getting up: back out from behind the seat, then round to the guest's way.
        const out = m.child ? m.seat : besideSeat(m.table, m.seat)
        m.path = [
          fromMap(out.x, out.y),
          ...route(fromMap(out.x, out.y), { x: lead.position.x, y: -lead.position.z }),
        ]
        m.seat = undefined
        m.table = undefined
      }
      const next = m.path[0]
      if (next && Math.hypot(next.x - at.x, next.z - at.z) < 0.05) m.path.shift()
      const target = m.path[0] ?? (m.seat ? fromMap(m.seat.x, m.seat.y) : along((k + 1) * GAP))
      if (m.path.length) rest = undefined
      const dx = target.x - o.position.x
      const dz = target.z - o.position.z
      const d = Math.hypot(dx, dz)
      if (d > 0.04) {
        const v = Math.min(d, SPEED * dt)
        const want = Math.atan2(dx, dz)
        const turn = Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y))
        o.rotation.y += Math.sign(turn) * Math.min(Math.abs(turn), 8 * dt)
        o.position.x += (dx / d) * v
        o.position.z += (dz / d) * v
        o.position.y = 0
        m.odometer += v
        m.figure.walk((m.odometer / (m.child ? 0.4 : 0.7)) * Math.PI)
      } else if (rest) {
        o.rotation.y = rotY(rest.yaw)
        o.position.y = rest.h
        if (rest.sit) m.figure.sit()
        else m.figure.stand()
      } else m.figure.stand()
    })
  }

  build()
  world.onReset(build)
  let last = performance.now()
  const tick = () => {
    const now = performance.now()
    step(Math.min(0.1, (now - last) / 1000))
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
