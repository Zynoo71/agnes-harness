/**
 * The flow view: the LLM and the DM at the top, AgnesHub below them as a banner with its bus down the
 * middle, and the devices in two columns either side of it (one column, the bus down the left edge, in
 * a narrow panel), devices with a picture first. Each card is joined to the bus by two lanes: MHS, the
 * command channel (calls, control, state, results), and MOS, the Nerve data channel (data streams,
 * manual input).
 * It only moves when something is exchanged: a comet per call (bright, down) and per result (dim,
 * up) on MHS, particles at the rate AgnesHub counted on Nerve (hub/traffic), amber ones while a
 * person drives. A call rides down the line of whoever made it, the LLM's (accent) on the left or
 * the DM's (teal) on the right; a step the DM hands to the LLM crosses from its line to the LLM's.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ByIcon } from '../controls/ui.js'
import { type Rgb, rgba, rgbOf } from '../core/color.js'
import { busyBy, displayName, keyFields, primaryImage, runningNow, tone } from '../core/describe.js'
import type { BrainPulse, Traffic } from '../core/store.js'
import type { By, Device, HubEvent } from '../core/types.js'
import { num, t } from '../i18n/i18n.js'
import {
  useBrainPulses,
  useDevices,
  useDmMode,
  useEvents,
  useLocale,
  useNav,
  useTraffic,
} from '../react/hooks.js'
import { FieldView } from '../widgets/fields.js'
import { ImageView, VideoView } from '../widgets/image.js'
import type { Brain } from './panel.js'
import { Doing, EndedStamp, HealthText, PositionText, StatePill, useCallCues } from './parts.js'

/** In one column: the two bus lines down the left edge, and where the cards start. */
const MHS_X = 22
const NERVE_X = 34
const CARD_X = 56
/**
 * Either side of the bus from this width, and two columns a side from the next; each inner card's
 * edge this far from the bus, the outer ones' from the panel's, and this far between columns.
 */
const TWO_COLUMNS = 480
const FOUR_COLUMNS = 1100
const GUTTER = 30
const SIDE = 12
const COLUMN_GAP = 14
const BRAIN_Y = 10
const BRAIN_H = 48
const BRAIN_X = 36
const HUB_Y = 84
const HUB_H = 64
/** Where a step the DM hands to the LLM crosses, between the two nodes and AgnesHub. */
const HAND_Y = BRAIN_Y + BRAIN_H + 13
/** The DM's last decision stays on its node this long. */
const DM_SHOWN_MS = 15_000
/** A card's text part until the card is measured; a device with a picture shows it above, as wide as the card. */
const INFO_H = 150
const CARD_GAP = 14
const PICTURE_MAX = 260
const PICTURE_ACROSS_MAX = 360
/** Where each lane enters a card, from its top. */
const MHS_IN = 24
const NERVE_IN = 50
const TRIP_MS = 900
/** Data rides slower than calls, so a sparse stream stays visible. */
const tripOf = (d: { kind: string }) => (d.kind === 'data' || d.kind === 'drive' ? 1500 : TRIP_MS)
/** At most this many particles per lane per second, whatever the traffic. */
const MAX_DOTS = 6

/** `brain` is the LLM's line, `dm` the DM's, `hand` from the DM's line across to the LLM's. */
type Lane = 'mhs' | 'nerve' | 'brain' | 'dm' | 'hand'
type Kind = 'call' | 'result' | 'data' | 'drive'
interface Dot {
  lane: Lane
  kind: Kind
  device?: string | undefined
  up: boolean
  start: number
  by?: By
}

/** Where a card sits: its top and left edge, its size, and which side of the bus it is on, or across it. */
interface Slot {
  top: number
  left: number
  width: number
  height: number
  side: 'left' | 'right' | 'one' | 'across'
}

interface Geometry {
  width: number
  height: number
  cards: Map<string, Slot>
  /** Picture heights by device id: 0 for a device without one. */
  pictures: Map<string, number>
  /** The AgnesHub banner's top: under the brain, or at the top on a page without one. */
  hub: number
  /** The bus lines' x. */
  mhsX: number
  nerveX: number
}

/**
 * Devices with a picture first, in rows either side of the bus, the columns next to it filled first,
 * the cards in a row as tall as its tallest; pictures come in pairs, and an odd one out goes across
 * the bus at the top, its picture larger. In a narrow panel, one column to the right of a bus down
 * the left edge.
 */
function layout(devices: Device[], width: number, heights: Map<string, number>, hub: number): Geometry {
  const two = width >= TWO_COLUMNS
  const perSide = width >= FOUR_COLUMNS ? 2 : 1
  const mid = Math.round(width / 2)
  const cardWidth = two
    ? Math.floor((width - 2 * SIDE - 2 * GUTTER - 2 * (perSide - 1) * COLUMN_GAP) / (2 * perSide))
    : width - CARD_X - SIDE
  const cards = new Map<string, Slot>()
  const pictures = new Map<string, number>()
  const pictureOf = (w: number, max: number) => Math.min(max, Math.round(((w - 16) * 9) / 16))
  const withPicture = devices.filter((d) => primaryImage(d))
  const across = two && withPicture.length % 2 === 1 ? withPicture.at(-1) : undefined
  const ordered = [...withPicture, ...devices.filter((d) => !primaryImage(d))].filter((d) => d !== across)
  let y = hub + HUB_H + 20
  if (across) {
    const w = width - 2 * SIDE
    const h = pictureOf(w, PICTURE_ACROSS_MAX)
    const tall = heights.get(across.id) ?? h + INFO_H
    cards.set(across.id, { top: y, left: SIDE, width: w, height: tall, side: 'across' })
    pictures.set(across.id, h)
    y += tall + CARD_GAP
  }
  const perRow = two ? 2 * perSide : 1
  const step = cardWidth + COLUMN_GAP
  for (let i = 0; i < ordered.length; i += perRow) {
    const row = ordered.slice(i, i + perRow)
    const h = (d: Device) => (primaryImage(d) ? pictureOf(cardWidth, PICTURE_MAX) : 0)
    const tallest = Math.max(...row.map((d) => heights.get(d.id) ?? h(d) + INFO_H))
    for (const [k, d] of row.entries()) {
      // k: 0 next to the bus on the left, 1 on the right, 2 and 3 the columns beyond them.
      const side = !two ? 'one' : k % 2 === 0 ? 'left' : 'right'
      const column = Math.floor(k / 2)
      const left =
        side === 'one'
          ? CARD_X
          : side === 'left'
            ? mid - GUTTER - cardWidth - column * step
            : mid + GUTTER + column * step
      cards.set(d.id, { top: y, left, width: cardWidth, height: tallest, side })
      pictures.set(d.id, h(d))
    }
    y += tallest + CARD_GAP
  }
  return {
    width,
    height: y,
    cards,
    pictures,
    hub,
    mhsX: two ? mid - 5 : MHS_X,
    nerveX: two ? mid + 5 : NERVE_X,
  }
}

/**
 * The polyline a lane follows, from AgnesHub (t = 0) to the device, or up to the LLM or the DM
 * (t = 1); the hand-over line runs from the DM's line to the LLM's.
 */
function path(g: Geometry, lane: Lane, device?: string): [number, number][] {
  const dmX = g.width - BRAIN_X
  if (lane === 'brain' || lane === 'dm') {
    const x = lane === 'brain' ? BRAIN_X : dmX
    return [
      [x, g.hub],
      [x, BRAIN_Y + BRAIN_H],
    ]
  }
  if (lane === 'hand')
    return [
      [dmX, HAND_Y],
      [BRAIN_X, HAND_Y],
    ]
  const slot = g.cards.get(device ?? '')
  if (slot === undefined) return []
  const x = lane === 'mhs' ? g.mhsX : g.nerveX
  // A card across the bus takes its lanes in at its top.
  if (slot.side === 'across')
    return [
      [x, g.hub + HUB_H],
      [x, slot.top],
    ]
  const y = slot.top + (lane === 'mhs' ? MHS_IN : NERVE_IN)
  // A lane meets a card at its edge nearest the bus.
  const edge = slot.side === 'left' ? slot.left + slot.width : slot.left
  return [
    [x, g.hub + HUB_H],
    [x, y],
    [edge, y],
  ]
}

function pointAt(points: [number, number][], t: number): [number, number] {
  if (points.length < 2) return points[0] ?? [0, 0]
  const lengths = points.slice(1).map((p, i) => {
    const [x, y] = points[i] as [number, number]
    return Math.hypot(p[0] - x, p[1] - y)
  })
  let left = Math.max(0, Math.min(1, t)) * lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] as number
    const [ax, ay] = points[i] as [number, number]
    const [bx, by] = points[i + 1] as [number, number]
    if (left <= len || i === lengths.length - 1) {
      const f = len > 0 ? Math.min(1, left / len) : 0
      return [ax + (bx - ax) * f, ay + (by - ay) * f]
    }
    left -= len
  }
  return points[points.length - 1] as [number, number]
}

/** The stretch of a polyline from t = a to t = b, either way along it, keeping the corners between. */
function stretch(points: [number, number][], a: number, b: number): [number, number][] {
  const total = points.slice(1).reduce((sum, p, i) => {
    const [x, y] = points[i] as [number, number]
    return sum + Math.hypot(p[0] - x, p[1] - y)
  }, 0)
  const corners: [number, number][] = []
  let run = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i - 1] as [number, number]
    const p = points[i] as [number, number]
    run += Math.hypot(p[0] - x, p[1] - y)
    const t = total > 0 ? run / total : 0
    if (t > Math.min(a, b) && t < Math.max(a, b)) corners.push(p)
  }
  if (a > b) corners.reverse()
  return [pointAt(points, a), ...corners, pointAt(points, b)]
}

const line = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

function rate(n: number): string {
  return n > 0 ? `${num(n, 0)}/s` : '—'
}

function kbps(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes >= 1_000_000) return ` · ${num(bytes / 1_000_000, 1)} MB/s`
  return ` · ${num(bytes / 1000, bytes < 10_000 ? 1 : 0)} kB/s`
}

const THUMB_HZ = 5
/** A card's video plays at half a camera's usual rate: smooth enough small, and half the encoding. */
const THUMB_VIDEO_HZ = 15

function DeviceCard(props: {
  device: Device
  top: number
  left: number
  width: number
  height: number
  picture: number
  traffic: Traffic | undefined
  onHeight: (id: string, height: number) => void
}) {
  const nav = useNav()
  const d = props.device
  const tr = props.traffic
  const picture = props.picture > 0 ? primaryImage(d) : undefined
  const card = useRef<HTMLElement | null>(null)
  const { onHeight } = props
  const ended = useCallCues(d, card)
  const hasPicture = picture !== undefined
  const idle = (d.jobs ?? []).length === 0 && !runningNow(d)

  // The layout makes a row as tall as its tallest card's content: the picture, the text and the rates
  // stacked, and the border.
  useEffect(() => {
    const el = card.current
    if (!el) return
    const parts = [
      ...el.querySelectorAll<HTMLElement>(
        ':scope > .mhs-flow-thumb, :scope > .mhs-flow-info, :scope > .mhs-flow-rates',
      ),
    ]
    const measure = () =>
      onHeight(
        d.id,
        parts.reduce((sum, part) => sum + part.offsetHeight, 2),
      )
    const observer = new ResizeObserver(measure)
    for (const part of parts) observer.observe(part)
    return () => observer.disconnect()
  }, [d.id, onHeight, hasPicture])

  return (
    <article
      ref={card}
      className="mhs-flow-device"
      data-tone={tone(d)}
      data-running={runningNow(d) || undefined}
      data-by={busyBy(d)}
      data-ended={ended}
      style={{ left: props.left, top: props.top, width: props.width, height: props.height }}
    >
      <EndedStamp ended={ended} />
      {picture && (
        <div className="mhs-flow-thumb" style={{ height: props.picture }}>
          {picture.kind === 'video' ? (
            <VideoView device={d} source={picture} hz={THUMB_VIDEO_HZ} compact />
          ) : (
            <ImageView device={d} source={picture} hz={THUMB_HZ} compact />
          )}
        </div>
      )}
      <div className="mhs-flow-info">
        <button type="button" className="mhs-flow-name" onClick={() => nav.open(d.id)}>
          <span className="mhs-mark">{displayName(d)}</span>
        </button>
        <StatePill device={d} />
        {/* One quiet line: the id, where it is, idle; health only when it is not fine. */}
        <span className="mhs-flow-status">
          {d.health.level === 'ok' ? (
            <span className="mhs-dot" data-tone="ok" />
          ) : (
            <HealthText health={d.health} />
          )}
          <code>{d.id}</code>
          {d.position && <PositionText position={d.position} />}
          {idle && <span>{t('device.idle')}</span>}
        </span>
        {!idle && <Doing device={d} compact />}
        <span className="mhs-fields mhs-flow-fields">
          {keyFields(d, 2).map(([name, field]) => (
            <FieldView key={name} name={name} field={field} value={d.state.values[name]} />
          ))}
        </span>
      </div>
      <span className="mhs-flow-rates">
        <span title={t('flow.lane.mhs')}>
          <b className="mhs-lane" data-lane="mhs">
            MHS
          </b>{' '}
          ↓{rate(tr?.mhs_down ?? 0)} ↑{rate(tr?.mhs_up ?? 0)}
        </span>
        <span title={t('flow.lane.mos')}>
          <b className="mhs-lane" data-lane="nerve">
            MOS
          </b>{' '}
          ↑{rate(tr?.nerve_up ?? 0)}
          {kbps(tr?.bytes_up ?? 0)}
          {tr?.nerve_down ? ` ↓${rate(tr.nerve_down)}` : ''}
        </span>
      </span>
    </article>
  )
}

export function Flow(props: { brain?: Brain | undefined }) {
  useLocale()
  const devices = useDevices()
  const traffic = useTraffic()
  const pulses = useBrainPulses()
  const events = useEvents()
  const conversation = props.brain?.conversation
  const mode = useDmMode(conversation)
  const [width, setWidth] = useState(360)
  const [heights, setHeights] = useState(() => new Map<string, number>())
  const onHeight = useCallback(
    (id: string, h: number) => setHeights((m) => (m.get(id) === h ? m : new Map(m).set(id, h))),
    [],
  )
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const dots = useRef<Dot[]>([])
  const seenPulse = useRef(0)
  const seenEvent = useRef<HubEvent | null | undefined>(undefined)
  // A page without a session (the standalone page) has no brain to draw.
  const g = layout(devices, width, heights, props.brain ? HUB_Y : BRAIN_Y)
  const geometry = useRef(g)
  geometry.current = g

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Each traffic report becomes particles spread over the next second.
  useEffect(() => {
    const now = performance.now()
    for (const [device, tr] of Object.entries(traffic.devices)) {
      const lanes: [Lane, Kind, boolean, number][] = [
        ['mhs', 'result', true, tr.mhs_up],
        ['mhs', 'call', false, tr.mhs_down],
        ['nerve', 'data', true, tr.nerve_up],
        ['nerve', 'drive', false, tr.nerve_down],
      ]
      for (const [lane, kind, up, n] of lanes) {
        const shown = Math.min(n, MAX_DOTS)
        for (let i = 0; i < shown; i++)
          dots.current.push({ lane, kind, device, up, start: now + (i * 1000) / shown })
      }
    }
  }, [traffic])

  // A call rides down the line of whoever made it, then the device's MHS lane; results come back up.
  useEffect(() => {
    const now = performance.now()
    for (const p of pulses as BrainPulse[]) {
      if (p.id <= seenPulse.current) continue
      seenPulse.current = p.id
      const kind: Kind = p.dir === 'down' ? 'call' : 'result'
      const lane: Lane = p.by === 'dm' ? 'dm' : 'brain'
      const by = p.by
      if (p.dir === 'down') {
        dots.current.push({ lane, kind, up: false, start: now, by })
        if (p.device)
          dots.current.push({
            lane: 'mhs',
            kind,
            device: p.device,
            up: false,
            start: now + TRIP_MS * 0.6,
            by,
          })
      } else {
        if (p.device) dots.current.push({ lane: 'mhs', kind, device: p.device, up: true, start: now, by })
        dots.current.push({ lane, kind, up: true, start: now + TRIP_MS * 0.6, by })
      }
    }
  }, [pulses])

  // A step the DM hands to the LLM crosses from its line to the LLM's. Events from before the view
  // opened are history.
  useEffect(() => {
    const list = events as HubEvent[]
    const last = list[list.length - 1] ?? null
    if (seenEvent.current === undefined) {
      seenEvent.current = last
      return
    }
    const from = seenEvent.current ? list.indexOf(seenEvent.current) + 1 : 0
    seenEvent.current = last
    const now = performance.now()
    for (const e of list.slice(from))
      if (e.type === 'dm' && e.data.conversation === conversation && e.data.outcome !== 'did')
        dots.current.push({ lane: 'hand', kind: 'call', up: false, start: now, by: 'dm' })
  }, [events, conversation])

  // One animation loop draws every comet and particle, in the panel's own colours.
  useEffect(() => {
    let raf = 0
    let colors: { accent: Rgb; dm: Rgb; mos: Rgb; dim: Rgb; warn: Rgb; glow: boolean } = {
      accent: [50, 72, 175],
      dm: [15, 138, 122],
      mos: [124, 77, 214],
      dim: [66, 70, 86],
      warn: [128, 94, 33],
      glow: false,
    }
    let colorsAt = -Infinity
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      const geo = geometry.current
      if (!c) return
      const now = performance.now()
      const dpr = window.devicePixelRatio || 1
      if (c.width !== geo.width * dpr || c.height !== geo.height * dpr) {
        c.width = geo.width * dpr
        c.height = geo.height * dpr
      }
      const ctx = c.getContext('2d') as CanvasRenderingContext2D
      if (now - colorsAt > 1000) {
        const style = getComputedStyle(c)
        const read = (name: string, fallback: Rgb) =>
          rgbOf(ctx, style.getPropertyValue(name).trim() || rgba(fallback, 1), fallback)
        const glow = style.getPropertyValue('--mhs-glow').trim()
        colors = {
          accent: read('--mhs-accent', colors.accent),
          dm: read('--mhs-dm', colors.dm),
          mos: read('--mhs-mos', colors.mos),
          dim: read('--mhs-text-3', colors.dim),
          warn: read('--mhs-warn', colors.warn),
          glow: glow !== '' && glow !== 'transparent',
        }
        colorsAt = now
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, geo.width, geo.height)
      dots.current = dots.current.filter((d) => now - d.start < tripOf(d))
      for (const d of dots.current) {
        const t = (now - d.start) / tripOf(d)
        if (t < 0) continue
        const pts = path(geo, d.lane, d.device)
        if (pts.length === 0) continue
        // Lanes run from AgnesHub outwards; the LLM's and the DM's lines run from AgnesHub up.
        const at = (s: number) =>
          d.lane === 'brain' || d.lane === 'dm' ? (d.up ? s : 1 - s) : d.up ? 1 - s : s
        const [x, y] = pointAt(pts, at(t))
        if (d.kind === 'call' || d.kind === 'result') {
          // A comet: a head and a tail of the same colour fading out behind it, round the lane's corners.
          const tailPts = stretch(pts, at(Math.max(0, t - 0.14)), at(t))
          const [tx, ty] = tailPts[0] as [number, number]
          const color = d.kind === 'result' ? colors.dim : d.by === 'dm' ? colors.dm : colors.accent
          const tail = ctx.createLinearGradient(tx, ty, x, y)
          tail.addColorStop(0, rgba(color, 0))
          tail.addColorStop(1, rgba(color, 0.9))
          ctx.strokeStyle = tail
          ctx.lineWidth = d.kind === 'call' ? 2.5 : 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          for (const [px, py] of tailPts.slice(1)) ctx.lineTo(px, py)
          ctx.stroke()
          ctx.shadowColor = d.kind === 'call' && colors.glow ? rgba(color, 1) : 'rgba(0, 0, 0, 0)'
          ctx.shadowBlur = 8
          ctx.fillStyle = rgba(color, 1)
          ctx.beginPath()
          ctx.arc(x, y, d.kind === 'call' ? 3 : 2.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        } else {
          // A data particle: a small dot that fades in and out, so a busy stream stays a dotted line.
          const color = d.kind === 'drive' ? colors.warn : colors.mos
          const fade = Math.min(1, t * 6, (1 - t) * 6)
          ctx.shadowColor = colors.glow || d.kind === 'drive' ? rgba(color, 0.8) : 'rgba(0, 0, 0, 0)'
          ctx.shadowBlur = 5
          ctx.fillStyle = rgba(color, (d.kind === 'drive' ? 0.9 : 0.6) * fade)
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  const fresh = Date.now() - traffic.at < 2500
  const llmLast = (pulses as BrainPulse[]).filter((p) => p.by !== 'dm').at(-1)
  const thinking = props.brain?.thinking === true
  // The DM is drawn while a decision model is configured; its node dims while it is off here.
  const dm = props.brain && mode?.ready ? mode : undefined
  const decision = dm
    ? (events as HubEvent[]).findLast((e) => e.type === 'dm' && e.data.conversation === conversation)
    : undefined
  const recent = decision && Date.now() - decision.time * 1000 < DM_SHOWN_MS ? decision : undefined
  return (
    <div
      className="mhs-flow"
      ref={box}
      style={{ height: g.height }}
      data-active={devices.some(runningNow) || undefined}
    >
      <svg className="mhs-flow-lines" width={g.width} height={g.height} aria-hidden="true">
        {props.brain && <polyline points={line(path(g, 'brain'))} className="mhs-flow-brainline" />}
        {dm && (
          <>
            <polyline points={line(path(g, 'dm'))} className="mhs-flow-dmline" data-on={dm.on || undefined} />
            <polyline points={line(path(g, 'hand'))} className="mhs-flow-handline" />
          </>
        )}
        {devices.map((d) => {
          const mhs = path(g, 'mhs', d.id)
          const nerve = path(g, 'nerve', d.id)
          // Each lane's port sits where it leaves the bus.
          const [mx, my] = mhs[1] ?? [0, 0]
          const [nx, ny] = nerve[1] ?? [0, 0]
          return (
            <g key={d.id}>
              <polyline points={line(mhs)} className="mhs-flow-mhs" />
              <polyline points={line(nerve)} className="mhs-flow-nerve" />
              <circle cx={mx} cy={my} r={2.5} className="mhs-flow-port" />
              <rect
                x={nx - 2.5}
                y={ny - 2.5}
                width={5}
                height={5}
                transform={`rotate(45 ${nx} ${ny})`}
                className="mhs-flow-port"
                data-lane="nerve"
              />
            </g>
          )
        })}
      </svg>
      <canvas ref={canvas} className="mhs-flow-dots" style={{ width: g.width, height: g.height }} />
      {props.brain && (
        <div
          className="mhs-flow-brain"
          style={{ left: 12, top: BRAIN_Y }}
          data-thinking={thinking || undefined}
        >
          <span className="mhs-flow-core">
            <i />
            <i />
            <i />
          </span>
          <span className="mhs-flow-brain-text">
            <b>{t('flow.brain')}</b>
            <span>
              {thinking ? <em>{t('flow.thinking')}</em> : t('flow.idle')}
              {llmLast && Date.now() - llmLast.at < 15_000
                ? ` · ${llmLast.tool}${llmLast.device ? ` → ${llmLast.device}` : ''}`
                : ''}
            </span>
          </span>
        </div>
      )}
      {dm && (
        <div
          className="mhs-flow-brain mhs-flow-dm"
          style={{ right: 12, top: BRAIN_Y }}
          data-on={dm.on || undefined}
          data-flash={(recent && Date.now() - recent.time * 1000 < 1500) || undefined}
        >
          <span className="mhs-flow-core">
            <ByIcon by="dm" />
          </span>
          <span className="mhs-flow-brain-text">
            <b>{t('flow.dm')}</b>
            <span>{dmStatus(dm, recent)}</span>
          </span>
        </div>
      )}
      <div className="mhs-flow-hub" style={{ top: g.hub, left: 12, width: g.width - 24, height: HUB_H }}>
        <span className="mhs-flow-hub-mark" aria-hidden="true" />
        <span className="mhs-flow-hub-name">
          <b>{t('flow.hub')}</b>
          {t('flow.hub.sub') && <small>{t('flow.hub.sub')}</small>}
        </span>
        <span className="mhs-flow-hub-side">
          <span className="mhs-flow-hub-stats">
            {t('flow.hub.online', { n: devices.filter((d) => d.available).length, total: devices.length })}
            {fresh ? hubRates(traffic) : ''}
          </span>
          <span className="mhs-flow-hub-lanes">
            <span className="mhs-lane" data-lane="mhs" title={t('flow.lane.mhs')}>
              MHS <em>{t('flow.lane.mhs.short')}</em>
            </span>
            <span className="mhs-lane" data-lane="nerve" title={t('flow.lane.mos')}>
              MOS <em>{t('flow.lane.mos.short')}</em>
            </span>
          </span>
        </span>
      </div>
      {devices.map((d) => {
        const slot = g.cards.get(d.id)
        if (slot === undefined) return null
        return (
          <DeviceCard
            key={d.id}
            device={d}
            top={slot.top}
            left={slot.left}
            width={slot.width}
            height={slot.height}
            picture={g.pictures.get(d.id) ?? 0}
            traffic={fresh ? traffic.devices[d.id] : undefined}
            onHeight={onHeight}
          />
        )
      })}
    </div>
  )
}

/** All devices' calls and results a second on MHS, and data on MOS, each only while there is some. */
function hubRates(traffic: { devices: Record<string, Traffic> }): string {
  let calls = 0
  let bytes = 0
  for (const tr of Object.values(traffic.devices)) {
    calls += tr.mhs_down + tr.mhs_up
    bytes += tr.bytes_up
  }
  return `${calls > 0 ? ` · MHS ${rate(calls)}` : ''}${bytes > 0 ? ` · MOS${kbps(bytes).slice(2)}` : ''}`
}

/** What the DM's node says: off, on duty, or its last decision here. */
function dmStatus(mode: { on: boolean; model?: string | undefined }, recent: HubEvent | undefined): string {
  if (!mode.on) return t('flow.dm.off')
  const d = recent?.data
  if (!d) return t('flow.dm.on')
  const sure = Math.round(
    (((d.top as [string, number][] | undefined)?.[0]?.[1] as number | undefined) ?? 0) * 100,
  )
  if (d.outcome === 'error') return t('flow.dm.error')
  if (d.outcome !== 'did') return d.choice === 'ask_llm' ? t('flow.dm.handed') : t('flow.dm.unsure', { sure })
  const call = d.call as { name?: string; args?: { device?: string; tool?: string } } | undefined
  const tool = call?.name === 'call_device' ? call.args?.tool : call?.name
  return `${sure}% · ${tool ?? d.choice} → ${call?.args?.device ?? d.device ?? ''}`
}
