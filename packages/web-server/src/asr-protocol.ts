import { gunzipSync, gzipSync } from 'node:zlib'

/** Volcengine ASR v3: sequenced, gzip-compressed binary messages. */
export function asrFrame(type: 1 | 2, sequence: number, payload: Uint8Array, final = false): Buffer {
  const body = gzipSync(payload)
  const header = Buffer.alloc(12)
  header.set([0x11, (type << 4) | (final ? 3 : 1), 0x11, 0])
  header.writeInt32BE(final ? -sequence : sequence, 4)
  header.writeUInt32BE(body.length, 8)
  return Buffer.concat([header, body])
}

export function asrStart(): Buffer {
  return asrFrame(
    1,
    1,
    Buffer.from(
      JSON.stringify({
        user: { uid: 'agh-local' },
        audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, result_type: 'full' },
      }),
    ),
  )
}

export function asrResult(frame: Buffer): { text?: string; final: boolean } {
  if (frame.length < 8 || frame.readUInt8(0) >> 4 !== 1) throw new Error('Invalid ASR frame')
  const type = frame.readUInt8(1) >> 4
  const flags = frame.readUInt8(1) & 15
  let offset = (frame.readUInt8(0) & 15) * 4
  if (offset < 4) throw new Error('Invalid ASR header')
  if (flags & 1) offset += 4
  if (flags & 4) offset += 4
  if (type === 15) throw new Error('ASR provider rejected the request')
  if (type !== 9 || frame.length < offset + 4) throw new Error('Invalid ASR response')
  const size = frame.readUInt32BE(offset)
  offset += 4
  if (size !== frame.length - offset) throw new Error('Invalid ASR payload length')
  let payload = frame.subarray(offset)
  if ((frame.readUInt8(2) & 15) === 1) payload = gunzipSync(payload, { maxOutputLength: 1024 * 1024 })
  else if ((frame.readUInt8(2) & 15) !== 0) throw new Error('Invalid ASR compression')
  const data = JSON.parse(payload.toString()) as { result?: { text?: unknown }; code?: number }
  if (data.code && data.code !== 20000000) throw new Error('ASR provider rejected the request')
  const text = data.result?.text
  return { ...(typeof text === 'string' ? { text } : {}), final: Boolean(flags & 2) }
}
