import { EventEmitter } from 'node:events'
import type { RequestBody } from '@agnes/protocol'
import { describe, expect, it, vi } from 'vitest'
import { type DmLink, dmOperation, type InferenceContext, momentOf, thinkingOf } from '../plugin/dm.js'
import { Dm } from '../server/dm.js'
import type { DecisionModel } from '../server/dm-models.js'
import { Maps } from '../server/maps.js'
import type { North } from '../server/north.js'

type Message = RequestBody['messages'][number]
const fake = (probabilities: Record<string, number>): DecisionModel => ({
  name: 'fake',
  rank: async () => ({ probabilities }),
})
const user = (text: string): Message => ({ role: 'user', content: [{ type: 'text', text }] })
const said = (text: string, tool = 'call_device', args: Record<string, unknown> = {}, id = 't'): Message => ({
  role: 'assistant',
  content: text ? [{ type: 'text', text }] : [],
  toolCalls: [{ toolUseId: id, name: tool, args: args as never, ordinal: 0 }],
})
const ended = (text: string): Message => ({ role: 'assistant', content: [{ type: 'text', text }] })
const result = (text: string, id = 't', isError = false): Message => ({
  role: 'tool_result',
  toolUseId: id,
  content: [{ type: 'text', text }],
  isError,
})
const call = (device: string, tool: string) => ({ device, tool })

describe('the DM in the loop', () => {
  it('takes steps after tool results, never the step the person started', () => {
    expect(momentOf([user('去东边看看'), user('[hook context]\ndevices')])).toBeUndefined()
    expect(
      momentOf([user('去东边看看'), said('先起飞'), result('took off'), user('[hook context]\nx')]),
    ).toMatchObject({
      instruction: '去东边看看',
      happened: 'took off',
      failed: false,
    })
    expect(momentOf([user('去东边看看'), said('先看看', 'read_device'), result('landed')])).toBeUndefined()
    const withTodo: Message = {
      role: 'assistant',
      content: [],
      toolCalls: [
        { toolUseId: 't', name: 'call_device', args: {} as never, ordinal: 0 },
        { toolUseId: 'u', name: 'todo', args: {} as never, ordinal: 1 },
      ],
    }
    expect(momentOf([user('去东边看看'), withTodo, result('took off'), result('ok', 'u')])).toMatchObject({
      happened: 'took off\nok',
    })
    // A person's words from a page (hub/prompt) start a step of their own: the LLM's.
    expect(momentOf([user('种点土豆'), ended('好'), user('南床土豆熟了，收下来')])).toBeUndefined()
  })

  it('asks its decision model and takes the likeliest option', async () => {
    const north = Object.assign(new EventEmitter(), {
      devices: () => [],
      maps: new Maps(),
    }) as unknown as North
    const model = fake({ ask_llm: 0.7, other: 0.3 })
    const rank = vi.spyOn(model, 'rank')
    const picked = await new Dm(north, model).decide({ happened: 'storm warning' })
    expect(rank.mock.calls[0]?.[0]).toContain('storm warning')
    expect(picked).toMatchObject({
      choice: 'ask_llm',
      top: [
        ['ask_llm', 0.7],
        ['other', 0.3],
      ],
    })
    expect(picked?.action).toBeUndefined()
  })

  it("tells the task's devices and its actions with their results", () => {
    const task = [
      user('开门开灯'),
      said('', 'read_device', { device: 'lamp-01' }, 't0'),
      result('lamp-01: off', 't0'),
      said('', 'call_device', call('door-01', 'unlock'), 't1'),
      result('door-01: unlocked. Took 1 s.', 't1'),
    ]
    expect(momentOf(task)).toMatchObject({
      devices: ['lamp-01', 'door-01'],
      recent: ['- door-01 unlock: door-01: unlocked'],
      failed: false,
    })
    expect(momentOf([...task.slice(0, 4), result('jammed', 't1', true)])?.failed).toBe(true)
  })

  it("gives the model the site, the task's devices with their whole tool descriptions and state", async () => {
    const maps = new Maps()
    maps.declare([{ id: 'shop', name: 'Shop', description: 'A corner shop. Customers first.' }])
    maps.declare([{ id: 'old', name: 'Old', description: 'A site whose devices are gone.' }])
    const north = Object.assign(new EventEmitter(), {
      maps,
      devices: () => [
        {
          id: 'door-01',
          name: 'Front door',
          online: true,
          maps: [{ id: 'shop' }],
          available: true,
          tools: [{ name: 'open', description: 'Open the door. Needs it unlocked.' }],
          state: { fields: {}, values: { locked: false } },
        },
        {
          id: 'lamp-01',
          available: true,
          tools: [{ name: 'blink', description: 'Blink. Twice.' }],
          state: { fields: {}, values: { on: false } },
        },
      ],
    }) as unknown as North
    const model = fake({ 'door-01 open': 0.9, ask_llm: 0.1 })
    const rank = vi.spyOn(model, 'rank')
    const picked = await new Dm(north, model).decide({ happened: 'door-01: unlocked' })
    const [state, options] = rank.mock.calls[0] ?? []
    expect(state).toContain('The site:\nShop: A corner shop. Customers first.')
    expect(state).not.toContain('gone')
    expect(state).toContain('The devices here: door-01 (Front door).')
    expect(state).toContain('door-01:\n- open: Open the door. Needs it unlocked.')
    expect(state).toContain('Now:\ndoor-01 now: locked false')
    expect(state).not.toContain('lamp-01')
    expect(Object.keys(options ?? {})).toEqual(['door-01 open', 'lamp-01 blink', 'ask_llm'])
    expect(picked.action).toEqual({ device: 'door-01', tool: 'open', args: {} })
  })

  it("takes the step after the LLM's own results, leaves failed results to the LLM, and times both", async () => {
    const north = Object.assign(new EventEmitter(), {
      maps: new Maps(),
      devices: () => [
        {
          id: 'door-01',
          available: true,
          tools: [{ name: 'open', description: 'Open.' }],
          state: { fields: {}, values: {} },
        },
      ],
    }) as unknown as North
    const dm = new Dm(north, fake({ 'door-01 open': 0.9, ask_llm: 0.1 }))
    const decide = vi.spyOn(dm, 'decide')
    const link: DmLink = { dm, on: () => true, report: () => {}, log: () => {} }
    const op = dmOperation(() => link)
    const run = async (messages: Message[]) => {
      const done = (async function* () {})()
      const next = vi.fn(async () => done)
      const ctx = {
        input: {
          request: {
            sessionKey: 'c1',
            messages,
            route: 'r',
            model: 'm',
            tools: [],
            contractId: null,
            derivedHash: 'h',
          },
          options: { toolNames: ['call_device'] },
        },
        next,
        session: { d: { contract: { parser_version: '2' } } },
      } as unknown as InferenceContext
      const out = await op.replace(ctx)
      // Core requires the LLM's result passed on as it is.
      if (next.mock.calls.length > 0) expect(out).toBe(done)
      const events = []
      for await (const e of out) events.push(e)
      return { llm: next.mock.calls.length > 0, events }
    }
    const unlocked = [
      user('开门'),
      said('', 'call_device', call('door-01', 'unlock'), 't1'),
      result('unlocked', 't1'),
    ]
    const { llm, events } = await run(unlocked)
    expect(llm).toBe(false)
    expect(events.find((e) => e.type === 'toolcall_end')).toMatchObject({
      call: { name: 'call_device', args: { device: 'door-01', tool: 'open', args: {} } },
    })
    const dmThought = thinkingOf('c1')
    expect(dmThought).toBeGreaterThanOrEqual(0)
    expect(thinkingOf('c1')).toBe(dmThought)
    const jammed = [...unlocked.slice(0, 2), result('jammed', 't1', true)]
    expect((await run(jammed)).llm).toBe(true)
    expect(thinkingOf('c1')).toBeGreaterThanOrEqual(0)
    expect(decide).toHaveBeenCalledTimes(1)
    // The same action straight again is the LLM's; after another action in between it is the DM's.
    const opened = [
      user('开门'),
      said('', 'call_device', call('door-01', 'open'), 't1'),
      result('opened', 't1'),
    ]
    expect((await run(opened)).llm).toBe(true)
    const cycle = [
      ...opened,
      said('', 'call_device', call('door-01', 'unlock'), 't2'),
      result('unlocked', 't2'),
    ]
    expect((await run(cycle)).llm).toBe(false)
  })
})
