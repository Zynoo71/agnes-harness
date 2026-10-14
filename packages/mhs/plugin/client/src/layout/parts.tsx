/** Pieces shared by the overview, the device page and the conversation's cards. */
import { type RefObject, useEffect, useRef, useState } from 'react'
import { Bar, Button } from '../controls/ui.js'
import { manualNow, runningNow, tone } from '../core/describe.js'
import type { Device, Health, Position } from '../core/types.js'
import { ago, elapsed, num, t } from '../i18n/i18n.js'
import { useEvents, useNow, useStore } from '../react/hooks.js'

/** How long a card shows how its device's call ended, in ms. */
const ENDED_SHOWN_MS = 1600

/**
 * Scrolls the panel so that `el` sits in the middle of what it shows, or at its top when taller;
 * only the nearest scrolling box moves, never the page around the panel.
 */
function centerInView(el: HTMLElement): void {
  let box = el.parentElement
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const r = el.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const by = r.height > b.height ? r.top - b.top - 8 : r.top + r.height / 2 - (b.top + b.height / 2)
  box.scrollBy({ top: by, behavior: 'smooth' })
}

/**
 * A device card's cues for a demo screen nobody touches: the card scrolls to the middle of the
 * panel when a call starts, and for a moment after a call ends it says whether it went through ('done') or not.
 */
export function useCallCues(d: Device, card: RefObject<HTMLElement | null>): 'done' | 'failed' | undefined {
  const running = runningNow(d)
  const was = useRef(running)
  useEffect(() => {
    if (running && !was.current && card.current) centerInView(card.current)
    was.current = running
  }, [running, card])
  const ended = useEvents().findLast(
    (e) => e.device === d.id && e.type === 'job' && (e.data as { state?: string }).state === 'ended',
  )
  // Calls that ended before the card was shown are not news.
  const seen = useRef(ended?.id)
  const [shown, setShown] = useState<'done' | 'failed'>()
  const status = (ended?.data as { status?: string } | undefined)?.status
  useEffect(() => {
    if (!ended || ended.id === seen.current) return
    seen.current = ended.id
    setShown(status === 'done' ? 'done' : 'failed')
    const timer = setTimeout(() => setShown(undefined), ENDED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [ended?.id, status])
  return shown
}

/** The stamp over a card whose call just ended. */
export function EndedStamp(props: { ended: 'done' | 'failed' | undefined }) {
  if (!props.ended) return null
  return (
    <span className="mhs-ended" data-ended={props.ended}>
      {t(`card.ended.${props.ended}`)}
    </span>
  )
}

export function HealthText(props: { health: Health; all?: boolean }) {
  const { level, reasons } = props.health
  return (
    <span className="mhs-health" data-level={level}>
      <span className="mhs-dot" data-tone={level === 'ok' ? 'ok' : level === 'attention' ? 'warn' : 'bad'} />
      {t(`health.${level}`)}
      {reasons.length > 0 && (props.all ? `: ${reasons.join('; ')}` : `: ${reasons[0]}`)}
    </span>
  )
}

export function PositionText(props: { position: Position; detail?: boolean }) {
  const p = props.position
  const at =
    p.x !== undefined && p.y !== undefined
      ? t('position.at', { x: num(p.x, 1), y: num(p.y, 1), yaw: Math.round(p.yaw ?? 0) })
      : ''
  return (
    <span className="mhs-trust" data-trust={p.trust}>
      {p.fixed ? t('trust.fixed') : t(`trust.${p.trust}`)}
      {props.detail && at ? ` · ${at}` : ''}
      {props.detail && p.zone ? ` · ${p.zone}` : ''}
      {props.detail && p.age !== undefined && p.age > 2 ? ` · ${ago(p.age)}` : ''}
      {p.reason && p.trust !== 'trusted' ? ` · ${p.reason}` : ''}
    </span>
  )
}

/** What the device is doing: its jobs with progress, a person driving, or idle. */
export function Doing(props: { device: Device; compact?: boolean }) {
  const now = useNow(1000)
  const jobs = props.device.jobs ?? []
  if (manualNow(props.device)) return <span className="mhs-doing">{t('device.manual')}</span>
  if (jobs.length === 0) return <span className="mhs-doing mhs-dim">{t('device.idle')}</span>
  return (
    <span className="mhs-doing-list">
      {jobs.map((j) => (
        <span key={j.job} className="mhs-doing" data-state={j.state}>
          <span>
            {j.state === 'paused'
              ? t('device.paused', { tool: j.tool })
              : t('device.doing', { tool: j.tool, caller: j.caller })}{' '}
            <span className="mhs-dim">{elapsed(now / 1000 - j.started)}</span>
          </span>
          {!props.compact && j.progress?.total ? (
            <Bar done={j.progress.done ?? 0} total={j.progress.total} />
          ) : null}
          {!props.compact && j.progress?.text ? <span className="mhs-note">{j.progress.text}</span> : null}
        </span>
      ))}
    </span>
  )
}

/** Stop one device, or every device. Always offered; it reports when AgnesHub is unreachable. */
export function StopButton(props: { device?: string; label?: string; small?: boolean }) {
  const store = useStore()
  const [note, setNote] = useState<string | undefined>()
  const stop = () => {
    if (store.conn !== 'open') {
      setNote(t('conn.stop.offline'))
      return
    }
    store.stop(props.device).then(
      (jobs) =>
        setNote(jobs.length ? t('device.stopped', { jobs: jobs.join(', ') }) : t('device.stopped.none')),
      (e: Error) => setNote(e.message),
    )
    setTimeout(() => setNote(undefined), 4000)
  }
  return (
    <span className="mhs-stop-wrap">
      <Button kind="danger" small={props.small ?? true} onClick={stop}>
        ■ {props.label ?? t('device.stop')}
      </Button>
      {note && <span className="mhs-note">{note}</span>}
    </span>
  )
}

/** The device's state in one word, in an outlined pill coloured like its ◆. */
export function StatePill(props: { device: Device }) {
  return <span className="mhs-state-pill">{t(`state.${tone(props.device)}`)}</span>
}

export function Availability(props: { device: Device }) {
  const now = useNow(5000)
  const d = props.device
  if (d.available)
    return (
      <span className="mhs-avail" data-on="true">
        {t('device.available')}
      </span>
    )
  if (d.online) return <span className="mhs-avail">{t('device.connected')}</span>
  return <span className="mhs-avail">{t('device.offline.since', { ago: ago(now / 1000 - d.since) })}</span>
}
