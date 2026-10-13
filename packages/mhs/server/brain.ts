import type { MapDecl } from '../gen/ts/mhs-v1.js'
import { isZone } from './maps.js'
import { type Caller, type DeviceEntry, deviceText, fromNow, type North } from './north.js'
import { summaryText } from './summary.js'

/**
 * The brain's side of AgnesHub (hub-api.md section 15), independent of how Agnes registers tools: the
 * five tools as functions returning text (and pictures), the per-turn snapshot, and the prompts a
 * person sends from a page. AgnesHub never wakes the brain by itself. The plugin wires these into Agnes.
 */

/** The caller AgnesHub records for the LLM's device calls and watches. */
export const LLM: Caller = { name: 'LLM', level: 2 }
/** The caller for a call the DM made in the LLM's stead (plugin/dm.ts). */
export const DM: Caller = { name: 'DM', level: 2 }
/** call_device returns this long before Agnes's deadline for the tool, so it can say the job goes on. */
export const CALL_MARGIN_MS = 3000
/** The per-turn snapshot is capped at this many UTF-8 bytes; the host shares 8 KB of hook context among all plugins (section 15.2). */
export const CONTEXT_LIMIT = 6000
/** The maps and their places take at most this share of it, so devices always fit too. */
const MAPS_SHARE = 0.5
/** Briefs stay in the snapshot this long, at most this many (section 15.4). */
const NOTES_S = 600
const NOTES_KEPT = 10

type Json = Record<string, unknown>

export interface Picture {
  mime: string
  bytes: Uint8Array
  name: string
}

export interface Answer {
  text: string
  pictures?: Picture[]
  isError?: boolean
  /** Machine-readable facts for pages that draw the call; never shown to the model. */
  data?: Json
}

/** Posts a person's prompt into a conversation (section 15.3). */
export type Deliver = (conversation: string, text: string) => void | Promise<void>

const answer = (text: string, isError = false): Answer => (isError ? { text, isError } : { text })

export class Brain {
  /** Briefs from other agents, newest last, for the snapshot (section 15.4). */
  private readonly notes: { time: number; text: string }[] = []
  /** The conversation on duty: the last one that used a device tool. */
  onDuty?: string

  constructor(
    private readonly north: North,
    private readonly deliver: Deliver,
  ) {
    north.brief = (caller, text) => this.brief(caller, text)
    north.prompt = (text) => this.prompt(text)
  }

  /** list_devices */
  listDevices(): Answer {
    const devices = this.north.devices()
    const data = {
      devices: devices.map((d) => ({
        id: d.id,
        kind: d.kind,
        ...(typeof d.name === 'string' ? { name: d.name } : {}),
        online: d.online,
        available: d.available,
        health: d.health,
        ...(d.position ? { position: d.position } : {}),
        jobs: ((d.jobs as { job: string; tool: string }[] | undefined) ?? []).map((j) => ({
          job: j.job,
          tool: j.tool,
        })),
      })),
    }
    if (devices.length === 0) return { text: 'No devices are connected to AgnesHub.', data }
    return {
      text: devices.map((d) => deviceLine(d, true, this.north.maps.zoneName(d.position))).join('\n'),
      data,
    }
  }

  /** read_device: state, health and position; with sources, their newest data and pictures. */
  async readDevice(args: { device?: string; sources?: string[] }): Promise<Answer> {
    const device = this.pick(args.device)
    if (typeof device !== 'string') return device
    const result = await this.north.read({
      device,
      ...(args.sources?.length ? { sources: args.sources } : {}),
    })
    const pictures: Picture[] = []
    for (const item of result.items)
      if (item.b64 && item.mime?.startsWith('image/'))
        pictures.push({
          mime: item.mime,
          bytes: Buffer.from(item.b64, 'base64'),
          name: `${device}-${item.source}.${item.mime === 'image/png' ? 'png' : 'jpg'}`,
        })
    return {
      text: `${result.text}${args.sources?.length ? '' : `\n${capabilities(this.north.device(device))}`}`,
      ...(pictures.length ? { pictures } : {}),
      data: {
        device,
        state: result.state,
        health: result.health,
        ...(result.position ? { position: result.position } : {}),
        items: result.items.map(({ b64: _, history: __, ...item }) => item),
      },
    }
  }

  /**
   * call_device: waits for the job's result. A job still running when Agnes's deadline for the tool
   * (`timeoutMs`) is near returns `running` and goes on; a stopped turn (`signal`) cancels it.
   * `think`: how long the step that made the call took to decide, in ms.
   */
  async callDevice(
    args: { device?: string; tool: string; args?: Json },
    timeoutMs?: number,
    signal?: AbortSignal,
    ref?: string,
    by: Caller = LLM,
    think?: number,
  ): Promise<Answer> {
    const device = this.pick(args.device)
    if (typeof device !== 'string') return device
    let resolveResult: (result: Json) => void = () => undefined
    const result = new Promise<Json>((resolve) => {
      resolveResult = resolve
    })
    const started = Date.now() / 1000
    const reply = await this.north.call(
      by,
      {
        device,
        tool: args.tool,
        ...(args.args ? { arguments: args.args } : {}),
        ...(ref === undefined ? {} : { ref }),
      },
      { result: resolveResult },
      think,
    )
    const facts = {
      device,
      tool: args.tool,
      args: args.args ?? {},
      started,
      ...(think === undefined ? {} : { think_ms: think }),
    }
    if (!reply.accepted)
      return {
        text: String(reply.text),
        isError: true,
        data: { ...facts, status: 'rejected', reason: reply.reason, detail: reply.detail },
      }
    const job = String(reply.job)
    let timer: NodeJS.Timeout | undefined
    const waited = await Promise.race([
      result,
      new Promise<'late' | 'stopped'>((resolve) => {
        if (timeoutMs !== undefined)
          timer = setTimeout(() => resolve('late'), Math.max(0, timeoutMs - CALL_MARGIN_MS))
        signal?.addEventListener('abort', () => resolve('stopped'), { once: true })
      }),
    ])
    clearTimeout(timer)
    if (waited === 'stopped') {
      await this.north.cancel(job).catch(() => undefined)
      return {
        text: `${device}: ${args.tool} cancelled, since the turn was stopped.`,
        isError: true,
        data: { ...facts, job, status: 'cancelled' },
      }
    }
    if (waited !== 'late') {
      const ended = typeof waited.time === 'number' ? waited.time : Date.now() / 1000
      const took = `Took ${Math.max(0, Math.round(ended - started))} s.`
      const now = this.north.devices().find((d) => d.id === device)
      const { job: _, device: __, tool: ___, text: ____, ...outcome } = waited
      return {
        text: [
          String(waited.text),
          took,
          now
            ? deviceText(now, this.north.maps.zoneName(now.position), false, (t) =>
                this.north.hubTime(device, t),
              )
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        ...(waited.status === 'done' ? {} : { isError: true }),
        data: { ...facts, job, ...outcome, ended, ...(now ? { state: now.state } : {}) },
      }
    }
    return {
      text: `${device}: ${args.tool} is still running (AgnesHub job ${job}) and goes on by itself; nothing tells you when it ends. read_device shows how it is doing; stop_device stops it.`,
      data: { ...facts, job, status: 'running' },
    }
  }

  /** set_device */
  async setDevice(args: { device?: string; values: Json }): Promise<Answer> {
    const device = this.pick(args.device)
    if (typeof device !== 'string') return device
    const before = { ...(this.north.devices().find((d) => d.id === device)?.state.values ?? {}) }
    const result = await this.north.set(device, args.values)
    const refused = (result.refused as Json | undefined) ?? {}
    return {
      text: String(result.text),
      ...(Object.keys(refused).length > 0 ? { isError: true } : {}),
      data: {
        device,
        asked: args.values,
        values: result.values,
        before: Object.fromEntries(Object.keys(args.values).map((k) => [k, before[k] ?? null])),
        refused,
        notes: result.notes,
      },
    }
  }

  /** stop_device: one device, or every device without `device`. */
  async stopDevice(args: { device?: string }): Promise<Answer> {
    const { stopped } = await this.north.stop(args.device)
    const what = args.device ?? 'every device'
    return {
      text: stopped.length
        ? `Stopped ${what}; interrupted ${stopped.join(', ')}.`
        : `Stopped ${what}; nothing was moving.`,
      data: { ...(args.device ? { device: args.device } : {}), stopped },
    }
  }

  /** hub/brief from another agent (section 15.4): the text goes into the next snapshots. */
  brief(caller: Caller, text: string): void {
    this.notes.push({ time: Date.now() / 1000, text: `${caller.name}: ${text}` })
    this.notes.splice(0, this.notes.length - NOTES_KEPT)
  }

  /**
   * hub/prompt from a page (section 15.3): a person's own words, posted into the conversation on
   * duty as their message. Returns whether there was one to post into.
   */
  prompt(text: string): boolean {
    if (!this.onDuty) return false
    void Promise.resolve(this.deliver(this.onDuty, text)).catch(() => undefined)
    return true
  }

  /** The snapshot added at the start of every turn (section 15.2): maps and places first, then devices. */
  context(): string {
    const devices = this.north.devices()
    const head =
      'You can use the devices connected to AgnesHub with the device tools (list_devices, read_device, call_device, set_device, stop_device). Call devices by the ids below; their own tools go in call_device, with the arguments read_device lists. call_device returns when the device has finished. Nothing wakes you later: when the next step has to wait for something (a crop to ripen, a window to open), say what happens next and end your turn; the person tells you when it is time. Never wait with other tools.'
    const maps = mapsText(this.north.maps.inUse(devices), CONTEXT_LIMIT * MAPS_SHARE)
    const notes = this.notesText()
    if (devices.length === 0) return `${head}${notes}${maps}\nNo devices are connected right now.`
    let text = `${head}${notes}${maps}${maps ? '\nDevices:' : ''}`
    for (const d of devices) {
      const line = `\n${deviceLine(d, false, this.north.maps.zoneName(d.position))}`
      if (bytes(text) + bytes(line) > CONTEXT_LIMIT - 40) {
        text += '\n(more devices: list_devices)'
        break
      }
      text += line
    }
    return text
  }

  /** "Other agents reported:" with the briefs of the last 10 minutes, or nothing. */
  private notesText(): string {
    const now = Date.now() / 1000
    const recent = this.notes.filter((n) => now - n.time < NOTES_S)
    if (recent.length === 0) return ''
    return `\nOther agents reported:${recent.map((n) => `\n- ${fromNow(n.time - now)}, ${n.text}`).join('')}`
  }

  /** Which device a call means: required, unless exactly one device is online. */
  private pick(device: string | undefined): string | Answer {
    if (device) return device
    const online = this.north.devices().filter((d) => d.available)
    if (online.length === 1) return (online[0] as DeviceEntry).id
    return answer(
      online.length === 0
        ? 'No device is available.'
        : `Which device? Name one of: ${online.map((d) => d.id).join(', ')}.`,
      true,
    )
  }
}

const bytes = (text: string) => Buffer.byteLength(text)
const round = (n: number) => Number(n.toFixed(2))
const pt = (x: number, y: number) => `(${round(x)}, ${round(y)})`

/**
 * The maps for the per-turn snapshot, at most `limit` bytes: each map's description of its site,
 * then each place with what a tool needs to go there, a landmark's point and a zone's centre and
 * extent.
 *
 *   - base "Base", x -60..60, y -60..60:
 *     A research base with one astronaut. The astronaut's safety comes first.
 *     - airlock "Airlock": landmark at (-12, 4), face 180° — Outer door of the habitat airlock
 *     - west-field "West field": zone around (-42.5, -40), 35 × 40 m
 */
export function mapsText(maps: MapDecl[], limit: number): string {
  if (maps.length === 0) return ''
  let text =
    "\nMaps (x, y in metres, yaw in degrees counter-clockwise from +x). Places are named points (landmarks) and areas (zones). To send a device to a place, call its own tool with the place's coordinates: a landmark's point, or for a zone a point inside it such as its centre; use a landmark's facing where the tool takes a heading."
  for (const map of maps) {
    const [x0, y0, x1, y1] = map.bounds ?? []
    const extent = map.bounds ? `, x ${x0}..${x1}, y ${y0}..${y1}` : ''
    const header = `\n- ${map.id}${map.name && map.name !== map.id ? ` "${map.name}"` : ''}${extent}${map.places?.length ? ':' : ', no places'}`
    const about = map.description ? `\n  ${map.description}` : ''
    if (bytes(text) + bytes(header) + bytes(about) > limit) break
    text += header + about
    const places = map.places ?? []
    for (const [i, p] of places.entries()) {
      let line = `\n  - ${p.id} "${p.name}": `
      if (isZone(p)) {
        const xs = p.points.map((q) => q[0] ?? 0)
        const ys = p.points.map((q) => q[1] ?? 0)
        const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        line += `zone around ${pt((ax + bx) / 2, (ay + by) / 2)}, ${round(bx - ax)} × ${round(by - ay)} m`
      } else
        line += `landmark at ${pt(p.at[0] ?? 0, p.at[1] ?? 0)}${p.yaw === undefined ? '' : `, face ${Math.round(p.yaw)}°`}`
      if (p.description) line += ` — ${p.description}`
      if (bytes(text) + bytes(line) > limit - 60) {
        text += `\n  (${places.length - i} more places not listed)`
        break
      }
      text += line
    }
  }
  return text
}

/** "rover-01 (Rover, robot): available; attention: battery 15 % (warn 20); idle; tools: move, dock" */
function deviceLine(d: DeviceEntry, full: boolean, zoneName?: string): string {
  const name = typeof d.name === 'string' ? `${d.name}, ` : ''
  const where = d.available ? 'available' : d.online ? 'connected, not available' : 'offline'
  const parts = [`- ${d.id} (${name}${d.kind}): ${where}`]
  const summary = summaryText(d.health, d.position, zoneName)
  if (summary) parts.push(summary.replace(/\.$/, ''))
  const busy = Object.values((d.busy as Record<string, { tool: string; job: string } | null>) ?? {}).filter(
    Boolean,
  )
  if (busy.length) parts.push(`busy: ${busy.map((b) => `${b?.tool} ${b?.job}`).join(', ')}`)
  const mode = d.state.values.mode
  if (typeof mode === 'string') parts.push(`mode ${mode}`)
  const tools = (d.tools as { name: string }[] | undefined)?.map((t) => t.name) ?? []
  if (tools.length) parts.push(`tools: ${tools.join(', ')}`)
  const settable = Object.entries(d.state.fields)
    .filter(([, f]) => (f as { writable?: boolean }).writable)
    .map(([n]) => n)
  if (settable.length) parts.push(`settable: ${settable.join(', ')}`)
  if (full) {
    const sources = d.sources.map((s) => `${s.id} (${s.kind})`)
    if (sources.length) parts.push(`sources: ${sources.join(', ')}`)
  }
  return parts.join('; ')
}

type Param = {
  type?: string
  items?: Param
  enum?: unknown[]
  minimum?: number
  maximum?: number
  default?: unknown
  description?: string
  properties?: Record<string, Param>
  required?: string[]
}

/** "alt: number 1–24, default 5 (metres above ground)" */
function paramText(name: string, p: Param, required: boolean): string {
  return `${name}: ${typeText(p)}${rangeText(p)}, ${
    required ? 'required' : p.default !== undefined ? `default ${JSON.stringify(p.default)}` : 'optional'
  }${p.description ? ` (${p.description})` : ''}`
}

/** "number", "one of a|b", "{x: number, y: number}", "list of {x: number, y: number}" */
function typeText(p: Param): string {
  if (p.enum) return `one of ${p.enum.map(String).join('|')}`
  if (p.type === 'object' && p.properties)
    return `{${Object.entries(p.properties)
      .map(([k, v]) => `${k}: ${typeText(v)}`)
      .join(', ')}}`
  if (p.type === 'array' && p.items) return `list of ${typeText(p.items)}`
  return p.type ?? 'any'
}

function rangeText(p: Param): string {
  return p.minimum !== undefined || p.maximum !== undefined ? ` ${p.minimum ?? '…'}–${p.maximum ?? '…'}` : ''
}

/**
 * What a model needs to use a device without guessing: each tool with its exact arguments, and
 * the state fields set_device can change with their ranges.
 */
export function capabilities(d: DeviceEntry): string {
  const lines: string[] = []
  const tools = (d.tools as { name: string; description: string; inputSchema?: Param }[] | undefined) ?? []
  if (tools.length) {
    lines.push('Tools (call_device; argument names exactly as listed):')
    for (const t of tools) {
      const props = t.inputSchema?.properties ?? {}
      const required = new Set(t.inputSchema?.required ?? [])
      const args = Object.entries(props).map(([n, p]) => paramText(n, p, required.has(n)))
      lines.push(
        `- ${t.name}: ${t.description}${args.length ? ` Arguments: ${args.join('; ')}.` : ' No arguments.'}`,
      )
    }
  } else lines.push('No tools.')
  const sources = d.sources.filter((s) => !(s as { ui?: { hidden?: boolean } }).ui?.hidden)
  if (sources.length) {
    lines.push('Data sources (read_device sources):')
    for (const s of sources) {
      const fields = Object.entries((s as { fields?: Record<string, { unit?: string }> }).fields ?? {}).map(
        ([n, f]) => `${n}${f.unit ? ` (${f.unit})` : ''}`,
      )
      const hz = (s as { hz?: number }).hz
      lines.push(
        `- ${s.id}: ${s.kind}${fields.length ? ` (${fields.join(', ')})` : ''}${hz ? `, ${hz} Hz` : ''} — ${s.description}`,
      )
    }
  }
  const settable = Object.entries(d.state.fields).filter(([, f]) => (f as { writable?: boolean }).writable)
  if (settable.length) {
    lines.push('Settable state (set_device {values: {field: value}}):')
    for (const [name, f] of settable) {
      const field = f as { type: string; enum?: string[]; min?: number; max?: number; unit?: string }
      const kind = field.enum
        ? `one of ${field.enum.join('|')}`
        : field.min !== undefined || field.max !== undefined
          ? `${field.type} ${field.min ?? '…'}–${field.max ?? '…'}${field.unit ? ` ${field.unit}` : ''}`
          : `${field.type}${field.unit ? ` (${field.unit})` : ''}`
      lines.push(`- ${name}: ${kind}, now ${JSON.stringify(d.state.values[name] ?? null)}`)
    }
  }
  return lines.join('\n')
}
