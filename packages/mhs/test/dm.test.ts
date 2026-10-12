import { EventEmitter } from 'node:events'
import type { RequestBody } from '@agnes/protocol'
import { describe, expect, it, vi } from 'vitest'
import { type DmLink, dmOperation, type InferenceContext, momentOf } from '../plugin/dm.js'
import { Dm } from '../server/dm.js'
import type { DecisionModel } from '../server/dm-models.js'
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
const call = (device: string, tool: string, then?: unknown[]) => ({ device, tool, ...(then ? { then } : {}) })

describe('the DM in the loop', () => {
  it('takes steps after tool results and wake-ups, never the step the person started', () => {
    expect(momentOf([user('去东边看看'), user('[hook context]\ndevices')])).toBeUndefined()
    expect(
      momentOf([user('去东边看看'), said('先起飞'), result('took off'), user('[hook context]\nx')]),
    ).toMatchObject({
      instruction: '去东边看看',
      said: '先起飞',
      happened: 'took off',
      woken: false,
      failed: false,
    })
    expect(momentOf([user('去东边看看'), said('先看看', 'read_device'), result('landed')])).toBeUndefined()
    expect(momentOf([user('盯着基地'), ended('好'), user('[AgnesHub] weather-01: storm')])).toMatchObject({
      instruction: '盯着基地',
      happened: '[AgnesHub] weather-01: storm',
      woken: true,
    })
    expect(
      momentOf([user('盯着基地'), said('先看看', 'read_device'), result('ok'), user('[AgnesHub] storm')]),
    ).toMatchObject({ happened: '[AgnesHub] storm', woken: false })
  })

  it('asks its decision model and takes the likeliest option', async () => {
    const north = Object.assign(new EventEmitter(), { devices: () => [] }) as unknown as North
    const model = fake({ ask_llm: 0.7, other: 0.3 })
    const rank = vi.spyOn(model, 'rank')
    const picked = await new Dm(north, 'scene', model).decide('c1', { happened: 'storm warning' })
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

  it("follows the LLM's plan step by step, and drops it when a step goes elsewhere", () => {
    const open = { device: 'door-01', tool: 'open' }
    const lamp = { device: 'lamp-01', values: { on: true } }
    const start = [
      user('开门开灯'),
      said('', 'call_device', call('door-01', 'unlock', [open, lamp]), 't1'),
      result('door-01: unlocked. Took 1 s.', 't1'),
    ]
    expect(momentOf(start)).toMatchObject({
      plan: [{ ...open, args: {} }, lamp],
      recent: ['- door-01 unlock: door-01: unlocked'],
    })
    const opened = [...start, said('', 'call_device', open, 't2'), result('door-01: open.', 't2')]
    expect(momentOf(opened)?.plan).toEqual([lamp])
    const elsewhere = [
      ...start,
      said('', 'call_device', call('door-01', 'lock'), 't2'),
      result('locked', 't2'),
    ]
    expect(momentOf(elsewhere)?.plan).toBeUndefined()
    expect(momentOf([...start.slice(0, 2), result('jammed', 't1', true)])?.failed).toBe(true)
  })

  it('with a plan, chooses only between its next step and the LLM', async () => {
    const north = Object.assign(new EventEmitter(), {
      devices: () => [
        {
          id: 'door-01',
          available: true,
          tools: [{ name: 'open', description: 'Open the door. Slowly.' }],
          state: { fields: {}, values: {} },
        },
      ],
    }) as unknown as North
    const model = fake({ 'door-01 open': 0.9, ask_llm: 0.1 })
    const rank = vi.spyOn(model, 'rank')
    const dm = new Dm(north, 'scene', model)
    const open = { device: 'door-01', tool: 'open', args: {} }
    const picked = await dm.decide('c1', { happened: 'unlocked', plan: [open] })
    expect(Object.keys(rank.mock.calls[0]?.[1] ?? {})).toEqual(['door-01 open', 'ask_llm'])
    expect(rank.mock.calls[0]?.[0]).toContain('plan, still to do:\n1. door-01 open')
    expect(picked?.action).toEqual(open)
    expect(
      await dm.decide('c1', { happened: 'x', plan: [{ device: 'gone-01', tool: 'open', args: {} }] }),
    ).toBeUndefined()
  })

  it("leaves the LLM's own results to the LLM unless it said what comes next", async () => {
    const north = Object.assign(new EventEmitter(), {
      devices: () => [
        {
          id: 'door-01',
          available: true,
          tools: [{ name: 'open', description: 'Open.' }],
          state: { fields: {}, values: {} },
        },
      ],
    }) as unknown as North
    const dm = new Dm(north, 'scene', fake({ 'door-01 open': 0.9, ask_llm: 0.1 }))
    const decide = vi.spyOn(dm, 'decide')
    const link: DmLink = { dm, on: () => true, report: () => {}, log: () => {} }
    const op = dmOperation(() => link)
    const run = async (messages: Message[]) => {
      const next = vi.fn(async () => (async function* () {})())
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
      const events = []
      for await (const e of await op.replace(ctx)) events.push(e)
      return { llm: next.mock.calls.length > 0, events }
    }
    const unlocked = [
      user('开门'),
      said('', 'call_device', call('door-01', 'unlock'), 't1'),
      result('unlocked', 't1'),
    ]
    expect((await run(unlocked)).llm).toBe(true)
    expect(decide).not.toHaveBeenCalled()
    const planned = [
      user('开门'),
      said('', 'call_device', call('door-01', 'unlock', [{ device: 'door-01', tool: 'open' }]), 't1'),
      result('unlocked', 't1'),
    ]
    const { llm, events } = await run(planned)
    expect(llm).toBe(false)
    expect(events.find((e) => e.type === 'toolcall_end')).toMatchObject({
      call: { name: 'call_device', args: { device: 'door-01', tool: 'open', args: {} } },
    })
  })
})
