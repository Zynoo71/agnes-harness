import { EventEmitter } from 'node:events'
import type { RequestBody } from '@agnes/protocol'
import { describe, expect, it, vi } from 'vitest'
import { momentOf } from '../plugin/dm.js'
import { DecisionModel } from '../server/dm.js'
import type { North } from '../server/north.js'

type Message = RequestBody['messages'][number]
const user = (text: string): Message => ({ role: 'user', content: [{ type: 'text', text }] })
const said = (text: string): Message => ({ role: 'assistant', content: text ? [{ type: 'text', text }] : [] })
const result = (text: string): Message => ({
  role: 'tool_result',
  toolUseId: 't',
  content: [{ type: 'text', text }],
  isError: false,
})

describe('the DM in the loop', () => {
  it('takes steps after tool results and wake-ups, never the step the person started', () => {
    expect(momentOf([user('去东边看看'), user('[hook context]\ndevices')])).toBeUndefined()
    expect(
      momentOf([user('去东边看看'), said('先起飞'), result('took off'), user('[hook context]\nx')]),
    ).toEqual({
      instruction: '去东边看看',
      said: '先起飞',
      happened: 'took off',
      woken: false,
    })
    expect(momentOf([user('盯着基地'), said('好'), user('[AgnesHub] weather-01: storm')])).toEqual({
      instruction: '盯着基地',
      happened: '[AgnesHub] weather-01: storm',
      woken: true,
    })
    const dm = (n: number) => [said(`DM chose step ${n}.`), result('ok')]
    expect(momentOf([user('go'), said(''), result('ok'), ...dm(1), ...dm(2)])).toBeDefined()
    expect(momentOf([user('go'), said(''), result('ok'), ...dm(1), ...dm(2), ...dm(3)])).toBeUndefined()
  })

  it('notices what devices report by themselves, not what their jobs do', async () => {
    vi.useFakeTimers()
    const north = Object.assign(new EventEmitter(), {
      devices: () => [
        {
          id: 'weather-01',
          state: { fields: { storm: { enum: ['clear', 'watch', 'warning'] } }, values: {} },
        },
      ],
    }) as unknown as North
    const notice = vi.fn()
    new DecisionModel(north, 'scene', async () => ({}), notice)
    north.emit('state', 'weather-01', { storm: 'clear' })
    north.emit('state', 'weather-01', { storm: 'watch' })
    north.emit('event', {
      type: 'alert',
      device: 'power-01',
      text: 'power-01: battery 18 %, past warn.',
      data: { alert: 'warn' },
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(notice).toHaveBeenCalledWith([
      'weather-01: storm changed from clear to watch',
      'power-01: battery 18 %, past warn.',
    ])
    north.emit('event', { type: 'job', device: 'weather-01', text: '', data: { state: 'running' } })
    north.emit('state', 'weather-01', { storm: 'warning' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(notice).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
