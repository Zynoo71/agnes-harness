import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import { asrFrame, asrResult, asrStart } from './asr-protocol.js'

/** Local desktop only. The credential is read by the server, never sent to the browser. */
export function attachAsr(server: Server, origin: string, getKey: () => string | undefined): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32000, perMessageDeflate: false })
  const cleanups = new Set<() => void>()
  server.on('upgrade', (request, socket, head) => {
    const key = getKey()
    if (
      request.url !== '/api/asr' ||
      request.headers.origin !== origin ||
      request.headers.host !== new URL(origin).host ||
      !key ||
      wss.clients.size >= 2
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      const upstream = new WebSocket('wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async', {
        headers: {
          'X-Api-Key': key,
          'X-Api-Resource-Id': 'volc.seedasr.sauc.duration',
          'X-Api-Connect-Id': randomUUID(),
        },
        handshakeTimeout: 10000,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
      })
      let ready = false
      let finishing = false
      let sequence = 2
      let closed = false
      let timer: ReturnType<typeof setTimeout>
      const close = () => {
        if (closed) return
        closed = true
        clearTimeout(timer)
        cleanups.delete(close)
        upstream.terminate()
        client.close()
      }
      const send = (message: object) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
      }
      const fail = () => {
        send({ type: 'error', message: '语音识别连接失败，请重试。' })
        close()
      }
      const arm = (ms: number) => {
        clearTimeout(timer)
        timer = setTimeout(fail, ms)
      }
      cleanups.add(close)
      arm(15000)
      const lifetime = setTimeout(fail, 120000)
      client.once('close', () => {
        clearTimeout(lifetime)
        close()
      })
      client.on('error', close)
      upstream.on('error', fail)
      upstream.on('close', () => {
        if (!closed) fail()
      })
      upstream.on('open', () => upstream.send(asrStart()))
      upstream.on('message', (data, binary) => {
        try {
          if (!binary) throw new Error('Expected binary ASR result')
          const result = asrResult(Buffer.from(data as Buffer))
          if (!ready) {
            ready = true
            send({ type: 'ready' })
            arm(15000)
          }
          if (result.text !== undefined) send({ type: 'transcript', text: result.text })
          if (result.final) {
            if (!finishing) throw new Error('Unexpected end of ASR stream')
            send({ type: 'final', text: result.text ?? '' })
            close()
          }
        } catch {
          fail()
        }
      })
      client.on('message', (data, binary) => {
        try {
          if (!ready || finishing || upstream.readyState !== WebSocket.OPEN)
            throw new Error('ASR is not ready')
          if (upstream.bufferedAmount > 128000 || client.bufferedAmount > 128000)
            throw new Error('ASR backpressure')
          if (binary) {
            const bytes = Buffer.from(data as Buffer)
            if (!bytes.length || bytes.length % 2) throw new Error('Invalid PCM')
            upstream.send(asrFrame(2, sequence++, bytes))
            arm(15000)
          } else {
            const command = JSON.parse(data.toString()) as { type?: string }
            if (command.type !== 'finish') throw new Error('Invalid ASR command')
            finishing = true
            upstream.send(asrFrame(2, sequence++, Buffer.alloc(0), true))
            arm(10000)
          }
        } catch {
          fail()
        }
      })
    })
  })
  return () => {
    for (const close of cleanups) close()
    for (const client of wss.clients) client.terminate()
    wss.close()
  }
}
