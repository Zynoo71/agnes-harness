import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it.each([44100, 48000])('resamples %i Hz into bounded PCM and emits no audio after finishing', (rate) => {
  const messages: unknown[] = []
  let create: (() => { process(inputs: Float32Array[][]): boolean; port: { onmessage(): void } }) | undefined
  runInNewContext(readFileSync(new URL('../public/asr-worklet.js', import.meta.url), 'utf8'), {
    sampleRate: rate,
    AudioWorkletProcessor: class {
      port = { postMessage: (message: unknown) => messages.push(message), onmessage: () => {} }
    },
    registerProcessor: (_name: string, ctor: new () => ReturnType<NonNullable<typeof create>>) => {
      create = () => new ctor()
    },
  })
  if (!create) throw new Error('Capture processor was not registered')
  const capture = create()
  capture.process([[new Float32Array(rate / 4).fill(0.5)]])
  capture.port.onmessage()
  const buffers = messages.filter((message): message is ArrayBuffer => typeof message !== 'string')
  expect(buffers.map((buffer) => buffer.byteLength)).toEqual([6400, 1600])
  for (const buffer of buffers) expect(new DataView(buffer).getInt16(0, true)).toBe(16384)
  expect(messages.at(-1)).toBe('flushed')
  const before = messages.length
  capture.process([[new Float32Array(rate).fill(0.5)]])
  expect(messages).toHaveLength(before)
})
