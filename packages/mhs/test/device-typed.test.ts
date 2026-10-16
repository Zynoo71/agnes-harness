import { afterEach, describe, expect, it } from 'vitest'
import { Device, Type } from '../device/device.js'
import { TestHub } from '../device/testing.js'
import { problems } from '../server/checks.js'

function makeLamp() {
  const seen = { brightness: 0 }
  const lamp = new Device({ id: 'lamp-01', kind: 'lamp', resources: { head: 'reject' } })
  lamp.tool(
    {
      name: 'tilt',
      description: 'Tilt the lamp head.',
      timeout: 5,
      uses: ['head'],
      motion: true,
      params: Type.Object({
        angle: Type.Number({ minimum: -45, maximum: 45, description: 'degrees, up positive' }),
        speed: Type.Optional(Type.Number({ default: 1 })),
      }),
    },
    (_, { angle, speed }) => `tilted to ${angle.toFixed(0)} at ${speed}`,
  )
  lamp.tool(
    {
      name: 'tone',
      description: 'Set the tone.',
      timeout: 2,
      params: Type.Object({ kind: Type.Union([Type.Literal('warm'), Type.Literal('cold')]) }),
    },
    (_, { kind }) => kind,
  )
  lamp.setting(
    'brightness',
    Type.Integer({ minimum: 0, maximum: 80, description: 'LED brightness' }),
    (value) => {
      seen.brightness = value
    },
    { initial: 50, unit: '%' },
  )
  lamp.source(
    'air',
    'values',
    'air at the desk',
    { hz: 10, fields: { t: { type: 'number', unit: '°C' } } },
    () => ({
      t: 21.5,
    }),
  )
  return { lamp, seen }
}

let hub: TestHub | undefined

afterEach(async () => {
  await hub?.close()
  hub = undefined
})

describe('Device with TypeBox schemas', () => {
  it('declares tools, settings and sources the hub accepts', () => {
    const d = makeLamp().lamp.description()
    expect(problems('RegisterParams', d)).toEqual([])
    const tools = Object.fromEntries(
      (d.tools as { name: string; inputSchema: unknown }[]).map((t) => [t.name, t]),
    )
    expect(tools.tilt?.inputSchema).toEqual({
      type: 'object',
      properties: {
        angle: { type: 'number', minimum: -45, maximum: 45, description: 'degrees, up positive' },
        speed: { type: 'number', default: 1 },
      },
      required: ['angle'],
    })
    expect(tools.tone?.inputSchema).toEqual({
      type: 'object',
      properties: { kind: { type: 'string', enum: ['warm', 'cold'] } },
      required: ['kind'],
    })
    expect((d.state as Record<string, unknown>).brightness).toEqual({
      type: 'integer',
      writable: true,
      min: 0,
      max: 80,
      description: 'LED brightness',
      unit: '%',
    })
  })

  it('runs typed calls, settings and samplers through TestHub', async () => {
    const { lamp, seen } = makeLamp()
    hub = await TestHub.start(lamp)
    expect(await hub.call('tilt', { angle: 60 })).toMatchObject({
      status: 'done',
      detail: 'tilted to 45 at 1',
      notes: expect.arrayContaining(['angle was 60, clamped to 45']),
    })
    expect(await hub.call('tone', { kind: 'hot' })).toMatchObject({ status: 'rejected', reason: 'invalid' })
    expect((await hub.set({ brightness: 95 })).values).toEqual({ brightness: 80 })
    expect(seen.brightness).toBe(80)
    await new Promise((r) => setTimeout(r, 50)) // the state report follows the reply
    expect(hub.state.brightness).toBe(80)
    expect((await hub.read('air')).msg.data).toEqual({ t: 21.5 })
  })

  it('finds the hub in AGNES_HUB_URL', async () => {
    const { lamp } = makeLamp()
    const { South } = await import('../server/south.js')
    const south = new South()
    const { port } = await south.listen(0)
    process.env.AGNES_HUB_URL = `ws://127.0.0.1:${port}`
    try {
      const running = lamp.run()
      for (let i = 0; i < 300 && !south.devices().some((d) => d.id === 'lamp-01'); i++)
        await new Promise((r) => setTimeout(r, 10))
      expect(south.devices().map((d) => d.id)).toContain('lamp-01')
      lamp.close()
      await running
    } finally {
      delete process.env.AGNES_HUB_URL
      await south.close()
    }
  })
})
