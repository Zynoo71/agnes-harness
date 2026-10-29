import { once } from 'node:events'
import { createServer } from 'node:http'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { attachAsr } from '../src/asr.js'
import { asrFrame, asrResult } from '../src/asr-protocol.js'

describe('streaming ASR', () => {
  it('encodes final PCM with negative sequence and preserves samples', () => {
    const pcm = Buffer.from([0, 0, 255, 127])
    const frame = asrFrame(2, 3, pcm, true)
    expect(frame[1]).toBe(0x23)
    expect(frame.readInt32BE(4)).toBe(-3)
    expect(gunzipSync(frame.subarray(12))).toEqual(pcm)
  })
  it('reads revised transcript snapshots and rejects malformed responses', () => {
    const response = (text: string, final: boolean) => {
      const body = gzipSync(Buffer.from(JSON.stringify({ result: { text } })))
      const header = Buffer.from([0x11, final ? 0x93 : 0x91, 0x11, 0, 0, 0, 0, 1, 0, 0, 0, 0])
      header.writeUInt32BE(body.length, 8)
      return Buffer.concat([header, body])
    }
    expect(asrResult(response('向前', false))).toEqual({ text: '向前', final: false })
    expect(asrResult(response('向前走两步', true))).toEqual({ text: '向前走两步', final: true })
    expect(() => asrResult(response('向前', false).subarray(0, 13))).toThrow()
    expect(() => asrResult(Buffer.from([0x11, 0xf0, 0x11, 0, 0, 0, 0, 1]))).toThrow()
  })
  it('refuses foreign origins and unconfigured credentials before connecting upstream', async () => {
    const server = createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing listener')
    const origin = `http://127.0.0.1:${address.port}`
    let key: string | undefined
    const close = attachAsr(server, origin, () => key)
    try {
      for (const pageOrigin of [origin, 'https://example.com']) {
        key = pageOrigin === origin ? undefined : 'synthetic-key'
        await new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/asr`, { origin: pageOrigin })
          socket.on('unexpected-response', (_request, response) => {
            try {
              expect(response.statusCode).toBe(403)
              response.resume()
              resolve()
            } catch (error) {
              reject(error)
            }
            socket.terminate()
          })
          socket.on('error', () => {})
          socket.on('open', () => {
            socket.terminate()
            reject(new Error('Unauthorized ASR connection'))
          })
        })
      }
    } finally {
      close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
