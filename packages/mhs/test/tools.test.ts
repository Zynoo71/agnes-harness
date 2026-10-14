import { describe, expect, it } from 'vitest'
import { onePicture } from '../plugin/tools.js'
import type { Answer } from '../server/brain.js'

const answer = (n: number): Answer => ({
  text: 'cam',
  pictures: Array.from({ length: n }, (_, i) => ({
    mime: 'image/jpeg',
    bytes: new Uint8Array(1),
    name: `cam-${i}.jpg`,
  })),
})

describe('pictures per read', () => {
  it('keeps one picture and names the ones left out', () => {
    expect(onePicture(answer(1))).toEqual(answer(1))
    const read = onePicture(answer(3))
    expect(read.pictures?.map((p) => p.name)).toEqual(['cam-0.jpg'])
    expect(read.text).toContain('not attached: cam-1.jpg, cam-2.jpg')
  })
})
