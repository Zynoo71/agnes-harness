import { describe, expect, it } from 'vitest'
import { ASK_LLM, buildOptions, type DeviceEntry, idsIn, NOTHING } from '../src/dm/options.js'

const rover: DeviceEntry = {
  id: 'rover-01',
  available: true,
  tools: [
    {
      name: 'drive_to',
      description: 'Drive to a place. Stops before boulders.',
      inputSchema: {
        properties: {
          place: { type: 'string', enum: ['dock', 'lab'] },
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
    {
      name: 'collect_sample',
      description: 'Take a sample of a rock.',
      inputSchema: { properties: { target: { type: 'string' } }, required: ['target'] },
    },
    {
      name: 'say',
      description: 'Say something.',
      inputSchema: { properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'land',
      description: 'Land.',
      inputSchema: { properties: { pad: { type: 'string', enum: ['a', 'b'], default: 'a' } } },
    },
  ],
  state: {
    fields: {
      priority: {
        type: 'string',
        enum: ['life', 'science'],
        writable: true,
        description: 'what comes first',
      },
    },
    values: { priority: 'life' },
  },
}

describe('decision model options', () => {
  it('spells out fixed actions, leaves free ones to the LLM, and puts nothing first and ask_llm last', () => {
    const { criteria, actions } = buildOptions(
      [rover, { ...rover, id: 'off-01', available: false }],
      new Map(),
    )
    expect(Object.keys(criteria)).toEqual([
      NOTHING,
      'rover-01 drive_to place=dock',
      'rover-01 drive_to place=lab',
      'rover-01 land',
      'rover-01 set priority=science',
      ASK_LLM,
    ])
    expect(criteria['rover-01 drive_to place=dock']).toBe('Drive to a place')
    expect(actions.get('rover-01 drive_to place=lab')).toEqual({
      device: 'rover-01',
      tool: 'drive_to',
      args: { place: 'lab' },
    })
    expect(actions.get('rover-01 set priority=science')).toEqual({
      device: 'rover-01',
      values: { priority: 'science' },
    })
  })

  it('fills parameters with run-time ids found in results', () => {
    const candidates = new Map([['target', [{ value: 'rock-2', from: '(from hopper-01 survey)' }]]])
    const { criteria, actions } = buildOptions([rover], candidates)
    expect(criteria['rover-01 collect_sample target=rock-2']).toBe(
      'Take a sample of a rock; rock-2 (from hopper-01 survey)',
    )
    expect(actions.get('rover-01 collect_sample target=rock-2')).toEqual({
      device: 'rover-01',
      tool: 'collect_sample',
      args: { target: 'rock-2' },
    })
    expect(idsIn({ targets: ['rock-2', 'rock-3'], photo: 'photo-1', route: [{ x: 1 }], seconds: 4 })).toEqual(
      [
        ['target', 'rock-2'],
        ['target', 'rock-3'],
        ['photo', 'photo-1'],
      ],
    )
  })
})
