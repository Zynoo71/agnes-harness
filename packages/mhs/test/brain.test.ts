import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Device } from '../device/device.js'
import { Brain, CONTEXT_LIMIT, capabilities, DM, mapsText } from '../server/brain.js'
import { North } from '../server/north.js'
import { South } from '../server/south.js'
import { summaryText } from '../server/summary.js'
import { type Msg, until } from './fakes.js'

let south: South
let north: North
let brain: Brain
let dev: Device
let woken: [string, string][]
let steps: number
let feeder: NodeJS.Timeout
let port: number

beforeEach(async () => {
  south = new South({ timing: { accept: 500, grace: 100, control: 500 } })
  north = new North(south)
  woken = []
  brain = new Brain(
    north,
    (conversation, text) => {
      woken.push([conversation, text])
    },
    { callWaitMs: 300, mergeMs: 50 },
  )
  const address = await south.listen(0, '127.0.0.1', north.handleUpgrade)
  port = address.port
  steps = 5
  dev = new Device({
    id: 'mover-01',
    name: 'Mover',
    kind: 'robot',
    mobile: true,
    resources: { chassis: 'reject' },
    state: {
      mode: { type: 'string', enum: ['idle', 'moving'] },
      battery: {
        type: 'integer',
        unit: '%',
        min: 0,
        max: 100,
        role: 'battery',
        alert: { warn: 20, bad: 10, below: true },
      },
      volume: { type: 'integer', min: 0, max: 10, writable: true },
    },
  })
  dev.update({ mode: 'idle', battery: 80, volume: 3 })
  const cam = dev.source('cam', 'image', 'front camera', { mime: 'image/jpeg', hz: 10 })
  feeder = setInterval(() => {
    if (cam.wants()) cam.send({ w: 2, h: 2 }, new Uint8Array([0xff, 0xd8, 0x01]))
  }, 20)
  dev.tool(
    {
      name: 'move',
      description: 'Drive straight x meters.',
      timeout: 30,
      params: { x: { type: 'number', minimum: -2, maximum: 2 } },
      required: ['x'],
      uses: ['chassis'],
      motion: true,
    },
    async (call, { x }) => {
      for (let i = 0; i < steps; i++) await call.sleep(100)
      return `moved ${x} m`
    },
  )
  dev.tool({ name: 'plan', description: 'Plan a route.', timeout: 5 }, async () => ({
    detail: 'planned a route in 2 legs',
    data: {
      route: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    },
  }))
  void dev.run(`ws://127.0.0.1:${address.port}`)
  // Registration makes the device available; its first state message follows it.
  await until(
    () => south.devices().some((d) => d.available) && south.state('mover-01')?.values.mode !== undefined,
  )
})

afterEach(async () => {
  clearInterval(feeder)
  dev.close()
  north.close()
  await south.close()
})

describe('brain tools', () => {
  it('lists devices and puts a snapshot in every turn', async () => {
    expect(brain.listDevices().text).toBe(
      '- mover-01 (Mover, robot): available; mode idle; tools: move, plan; settable: volume; sources: cam (image)',
    )
    expect(brain.context()).toMatch(
      /\n- mover-01 \(Mover, robot\): available; mode idle; tools: move, plan; settable: volume$/,
    )
  })

  it('reads state by default and attaches pictures of image sources', async () => {
    const plain = await brain.readDevice({})
    expect(plain.text).toBe(
      [
        'mover-01 is available. State: mode idle, battery 80 %, volume 3.',
        'Tools (call_device; argument names exactly as listed):',
        '- move: Drive straight x meters. Arguments: x: number -2–2, required.',
        '- plan: Plan a route. No arguments.',
        'Data sources (read_device sources; watch_device {"source", "field"} for values and switch):',
        '- cam: image, 10 Hz — front camera',
        'Settable state (set_device {values: {field: value}}):',
        '- volume: integer 0–10, now 3',
      ].join('\n'),
    )
    const seen = await brain.readDevice({ device: 'mover-01', sources: ['cam'] })
    expect(seen.pictures?.[0]).toMatchObject({ mime: 'image/jpeg', name: 'mover-01-cam.jpg' })
    expect([...(seen.pictures?.[0]?.bytes ?? [])]).toEqual([0xff, 0xd8, 0x01])
  })

  it('returns a short job with its result, and wakes the conversation when a long one ends', async () => {
    steps = 1
    const short = await brain.callDevice({ tool: 'move', args: { x: 1 } }, 'conv-a')
    expect(short.text).toBe(
      'mover-01: moved 1 m. Took 0 s. mover-01 is available. State: mode idle, battery 80 %, volume 3.',
    )
    expect(short.data).toMatchObject({
      device: 'mover-01',
      tool: 'move',
      args: { x: 1 },
      job: 'j1',
      status: 'done',
      detail: 'moved 1 m',
    })
    steps = 6
    const running = await brain.callDevice(
      { device: 'mover-01', tool: 'move', args: { x: 1 } },
      'conv-b',
      undefined,
      'toolu-7',
    )
    expect(running.text).toBe(
      'mover-01: move is still running (AgnesHub job j2, not a subagent). This conversation is woken with its result when it ends: go on with other work or end your turn, and do not wait for it with other tools. stop_device stops it.',
    )
    expect(running.data).toMatchObject({ job: 'j2', status: 'running' })
    // Pages find the conversation step a job belongs to by its ref.
    expect(north.devices()[0]?.jobs).toMatchObject([
      { job: 'j2', tool: 'move', caller: 'LLM', state: 'running', arguments: { x: 1 }, ref: 'toolu-7' },
    ])
    await until(() => woken.length === 1, 3000)
    expect(woken[0]).toEqual(['conv-b', '[AgnesHub] mover-01: moved 1 m.'])
  })

  it('records a call the DM made with the DM as its caller', async () => {
    steps = 6
    await brain.callDevice(
      { device: 'mover-01', tool: 'move', args: { x: 1 } },
      'c',
      undefined,
      'toolu-9',
      DM,
    )
    expect(north.devices()[0]?.jobs).toMatchObject([{ tool: 'move', caller: 'DM', ref: 'toolu-9' }])
    await until(() => woken.length === 1, 3000)
  })

  it('gives the model the data a tool returns, such as a planned route', async () => {
    const planned = await brain.callDevice({ device: 'mover-01', tool: 'plan' }, 'c')
    expect(planned.text).toMatch(
      /^mover-01: planned a route in 2 legs\. Data: \{"route":\[\{"x":1,"y":2\},\{"x":3,"y":4\}\]\}/,
    )
  })

  it('reports rejections as errors and asks which device when it is unclear', async () => {
    const wrong = await brain.callDevice({ device: 'mover-01', tool: 'fly' }, 'c')
    expect(wrong).toMatchObject({
      text: 'mover-01 rejected fly (invalid): mover-01 has no tool fly.',
      isError: true,
      data: { device: 'mover-01', tool: 'fly', status: 'rejected', reason: 'invalid' },
    })
    expect(await brain.stopDevice({})).toEqual({
      text: 'Stopped every device; nothing was moving.',
      data: { stopped: [] },
    })
  })

  it('wakes the conversation that set a watch', async () => {
    brain.watchDevice(
      { until: { state: 'battery', lt: 20 }, note: 'charge before the battery runs out' },
      'conv-w',
    )
    dev.update({ battery: 15 })
    await until(() => woken.length === 1)
    expect(woken[0]).toEqual([
      'conv-w',
      '[AgnesHub] mover-01: battery < 20 (charge before the battery runs out).',
    ])
  })

  it('wakes the conversation on duty when a field turns critical, once a minute, only when asked to', async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
    brain.onDuty = 'conv-a'
    dev.update({ battery: 5 })
    await pause()
    expect(woken).toEqual([])
    dev.update({ battery: 80 })
    brain.wakeOnAlert = true
    dev.update({ battery: 5 })
    await until(() => woken.length === 1)
    expect(woken[0]?.[0]).toBe('conv-a')
    expect(woken[0]?.[1]).toMatch(/^\[AgnesHub\] Critical alert\. mover-01: .*5 %, past bad 10 %\.$/)
    // Back and past the line again within the minute: nobody is woken again.
    dev.update({ battery: 80 })
    dev.update({ battery: 5 })
    await pause()
    expect(woken).toHaveLength(1)
  })

  it('wakes the conversation on duty with a brief, and keeps the others for the snapshot', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/hub`)
    await new Promise((resolve) => ws.once('open', resolve))
    let n = 0
    const request = (method: string, params: Record<string, unknown>) =>
      new Promise<Msg>((resolve) => {
        const id = `r${++n}`
        ws.on('message', (data) => {
          const m = JSON.parse(data.toString())
          if (m.id === id) resolve(m)
        })
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      })
    await request('hub/hello', { role: 'agent', client: { name: 'DM' } })
    // No conversation has used a device yet: nobody to wake.
    expect((await request('hub/brief', { text: 'battery low', wake: true })).result).toEqual({ woken: false })
    brain.onDuty = 'conv-d'
    expect((await request('hub/brief', { text: 'battery low', wake: true })).result).toEqual({ woken: true })
    await until(() => woken.length === 1)
    expect(woken[0]).toEqual(['conv-d', '[AgnesHub] DM: battery low'])
    expect((await request('hub/brief', { text: 'did mover-01 plan' })).result).toEqual({ woken: false })
    expect(brain.context()).toContain('\nOther agents reported:\n- now, DM: did mover-01 plan')
    expect((await request('hub/brief', { text: ' ' })).error.code).toBe(-32602)
    ws.close()
  })

  it('puts the maps with their places first in every turn, and says where each device is', async () => {
    const gate = new Device({
      id: 'gate-01',
      kind: 'sensor',
      name: 'Gate camera',
      localization: 'fixed',
      placement: { map: 'site', x: 2, y: 3, yaw: 90 },
      maps: [
        {
          id: 'site',
          name: 'Site',
          bounds: [0, 0, 20, 10],
          places: [
            { id: 'gate', name: 'Gate', at: [1, 3], yaw: 180, description: 'The way in' },
            {
              id: 'yard',
              name: 'Yard',
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
              ],
            },
          ],
        },
      ],
    })
    void gate.run(`ws://127.0.0.1:${port}`)
    await until(() => south.devices().length === 2)
    const context = brain.context()
    expect(context.slice(context.indexOf('\n- site'))).toBe(
      [
        '',
        '- site "Site", x 0..20, y 0..10:',
        '  - gate "Gate": landmark at (1, 3), face 180° — The way in',
        '  - yard "Yard": zone around (5, 5), 10 × 10 m',
        'Devices:',
        '- mover-01 (Mover, robot): available; mode idle; tools: move, plan; settable: volume',
        '- gate-01 (Gate camera, sensor): available; Installed at (2, 3) facing 90° on map site, in zone Yard (yard)',
      ].join('\n'),
    )
    expect(context).toContain("To send a device to a place, call its own tool with the place's coordinates")
    expect((await brain.readDevice({ device: 'gate-01' })).text).toMatch(
      /^gate-01 is available\. Installed at \(2, 3\) facing 90° on map site, in zone Yard \(yard\)\./,
    )
    gate.close()
  })

  it('names a zone by its id alone when it has no other name', () => {
    const p = {
      trust: 'trusted' as const,
      map: 'site',
      x: 2,
      y: 3,
      yaw: 90,
      fixed: true as const,
      zone: 'yard',
    }
    const ok = { level: 'ok' as const, reasons: [] }
    expect(summaryText(ok, p)).toBe('Installed at (2, 3) facing 90° on map site, in zone yard.')
    expect(summaryText(ok, p, 'yard')).toBe('Installed at (2, 3) facing 90° on map site, in zone yard.')
    expect(summaryText(ok, p, 'Yard')).toBe(
      'Installed at (2, 3) facing 90° on map site, in zone Yard (yard).',
    )
    // Results after the first description leave the place of an installed device out.
    expect(summaryText(ok, p, 'Yard', false)).toBe('')
    expect(summaryText({ level: 'bad', reasons: ['jammed'] }, p, 'Yard', false)).toBe('Bad: jammed.')
  })

  it('keeps the maps to their share of the snapshot', () => {
    const places = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, at: [i, i] }))
    const text = mapsText([{ id: 'big', places }], CONTEXT_LIMIT / 2)
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CONTEXT_LIMIT / 2)
    expect(text).toMatch(/\n {2}\(\d+ more places not listed\)$/)
  })

  it('spells out list and object arguments so a model need not guess their shape', () => {
    const entry = {
      id: 'x',
      kind: 'rover',
      online: true,
      available: true,
      since: 0,
      sources: [],
      state: { fields: {}, values: {}, updated: null, alerts: {} },
      health: { level: 'ok', reasons: [] },
      tools: [
        {
          name: 'follow_route',
          description: 'Follow map points.',
          inputSchema: {
            type: 'object',
            properties: {
              points: {
                type: 'array',
                items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
              },
            },
            required: ['points'],
          },
        },
      ],
    }
    expect(capabilities(entry as never)).toContain(
      '- follow_route: Follow map points. Arguments: points: list of {x: number, y: number}, required.',
    )
  })
})
