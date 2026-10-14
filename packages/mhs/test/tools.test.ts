import { describe, expect, it } from 'vitest'
import { budget, type ToolCall } from '../plugin/tools.js'
import type { Answer } from '../server/brain.js'

const call = (key: string) => ({ session: { key, toolUseId: 't' } }) as ToolCall
const pictures = (device: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    mime: 'image/jpeg',
    bytes: new Uint8Array(1),
    name: `${device}-${i}.jpg`,
  }))
const answer = (device: string, n: number): Answer => ({ text: device, pictures: pictures(device, n) })

describe('picture budget', () => {
  it('keeps a step within four pictures and names the ones left out', () => {
    expect(budget(answer('a', 3), call('s1')).pictures).toHaveLength(3)
    const second = budget(answer('b', 2), call('s1'))
    expect(second.pictures?.map((p) => p.name)).toEqual(['b-0.jpg'])
    expect(second.text).toContain('not attached: b-1.jpg')
    // Another session has its own budget.
    expect(budget(answer('c', 4), call('s2')).pictures).toHaveLength(4)
  })
})
