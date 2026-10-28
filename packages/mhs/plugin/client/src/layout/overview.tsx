/**
 * The overview (mhs-ui-design 13.1): one preview card per device, then what needs attention. A
 * card shows the device's own picture when it has one, else what it looks like (MHS 5.3), otherwise
 * only its key numbers.
 */

import { useRef } from 'react'
import {
  busyBy,
  displayName,
  keyFields,
  lookOf,
  manualNow,
  previewImage,
  runningNow,
  tone,
} from '../core/describe.js'
import type { Device } from '../core/types.js'
import { t } from '../i18n/i18n.js'
import { useDevices, useLocale, useNav } from '../react/hooks.js'
import { LookView } from '../widgets/avatar.js'
import { FieldView } from '../widgets/fields.js'
import { Doing, EndedStamp, HealthText, PositionText, StatePill, StopButton, useCallCues } from './parts.js'

const PREVIEW_HZ = 5
/** A card's video plays at half a camera's usual rate: smooth enough small, and half the encoding. */
const PREVIEW_VIDEO_HZ = 15

export function DeviceCard(props: { device: Device }) {
  const nav = useNav()
  const d = props.device
  const picture = lookOf(d, previewImage(d))
  const numbers = keyFields(d, picture ? 3 : 4)
  const card = useRef<HTMLElement | null>(null)
  const ended = useCallCues(d, card)
  return (
    <article
      ref={card}
      className="mhs-card"
      data-tone={tone(d)}
      data-running={runningNow(d) || undefined}
      data-by={busyBy(d)}
      data-ended={ended}
    >
      {picture && (
        <div className="mhs-card-preview">
          <LookView device={d} look={picture} hz={PREVIEW_HZ} videoHz={PREVIEW_VIDEO_HZ} />
        </div>
      )}
      <button type="button" className="mhs-card-open" onClick={() => nav.open(d.id)}>
        <header className="mhs-card-head">
          <span className="mhs-card-name mhs-mark">{displayName(d)}</span>
          <code className="mhs-card-id">{d.id}</code>
          {/* A call's end shows in the state's place for a moment. */}
          {ended ? <EndedStamp ended={ended} /> : <StatePill device={d} />}
          <span className="mhs-card-chevron" aria-hidden="true">
            ›
          </span>
        </header>
        <div className="mhs-card-status">
          <HealthText health={d.health} />
          {d.position && <PositionText position={d.position} />}
        </div>
        <Doing device={d} compact />
      </button>
      {numbers.length > 0 && (
        <div className="mhs-fields mhs-card-fields">
          {numbers.map(([name, field]) => (
            <FieldView key={name} name={name} field={field} value={d.state.values[name]} />
          ))}
        </div>
      )}
      <footer className="mhs-card-foot">
        <StopButton device={d.id} />
      </footer>
    </article>
  )
}

function attentionOf(d: Device): string[] {
  const out: string[] = []
  if (!d.available) out.push(d.online ? t('device.connected') : t('device.offline'))
  if (d.health.level !== 'ok') out.push(`${t(`health.${d.health.level}`)}: ${d.health.reasons.join('; ')}`)
  if (d.position && d.position.trust !== 'trusted')
    out.push(`${t(`trust.${d.position.trust}`)}${d.position.reason ? `: ${d.position.reason}` : ''}`)
  for (const j of d.jobs ?? []) if (j.state === 'paused') out.push(t('device.paused', { tool: j.tool }))
  if (manualNow(d)) out.push(t('device.manual'))
  return out
}

export function Overview() {
  useLocale()
  const devices = useDevices()
  const nav = useNav()
  if (devices.length === 0)
    return (
      <div className="mhs-empty">
        <p>{t('overview.empty')}</p>
        <p className="mhs-dim">{t('overview.empty.hint')}</p>
      </div>
    )
  const watch = devices.map((d) => [d, attentionOf(d)] as const).filter(([, a]) => a.length > 0)
  return (
    <div className="mhs-overview">
      <div className="mhs-cards" data-active={devices.some(runningNow) || undefined}>
        {devices.map((d) => (
          <DeviceCard key={d.id} device={d} />
        ))}
      </div>
      {watch.length > 0 && (
        <section className="mhs-watch">
          <h3>{t('overview.watch')}</h3>
          {watch.map(([d, reasons]) => (
            <button type="button" key={d.id} className="mhs-watch-row" onClick={() => nav.open(d.id)}>
              <code>{d.id}</code> {reasons.join(' · ')}
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
