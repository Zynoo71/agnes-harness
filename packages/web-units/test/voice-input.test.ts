/** @vitest-environment happy-dom */
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { VoiceInput } from '../src/voice-input.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('previews revisions, commits only the final text, and discards results after session changes', async () => {
  let change = () => {}
  let scope = 'one'
  const commit = vi.fn()
  const preview = vi.fn()
  const stop = vi.fn()
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  class Socket {
    static OPEN = 1
    readyState = 1
    bufferedAmount = 0
    onmessage?: (event: { data: string }) => void
    onclose?: () => void
    send = vi.fn()
    close = vi.fn()
    static last: Socket
    constructor() {
      Socket.last = this
    }
    receive(message: object) {
      this.onmessage?.({ data: JSON.stringify(message) })
    }
  }
  class Capture {
    static last: Capture
    port = {
      onmessage: undefined as undefined | ((event: { data: string }) => void),
      postMessage: () => {
        this.port.onmessage?.({ data: 'flushed' })
      },
    }
    connect = vi.fn()
    disconnect = vi.fn()
    constructor() {
      Capture.last = this
    }
  }
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('AudioWorkletNode', Capture)
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running'
      destination = {}
      audioWorklet = { addModule: async () => {} }
      resume = async () => {}
      close = async () => {
        this.state = 'closed'
      }
      createMediaStreamSource = () => source
    },
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const click = (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === label,
    )
    if (!button) throw new Error(`Missing button ${label}`)
    flushSync(() => button.click())
  }
  try {
    flushSync(() =>
      root.render(
        createElement(VoiceInput, {
          onPreview: preview,
          options: {
            scope: () => scope,
            subscribe: (listener) => {
              change = listener
              return () => {}
            },
            commit,
          },
        }),
      ),
    )
    click('语音输入')
    await vi.waitFor(() => expect(Socket.last).toBeDefined())
    flushSync(() => Socket.last.receive({ type: 'ready' }))
    flushSync(() => Socket.last.receive({ type: 'transcript', text: '向前' }))
    flushSync(() => Socket.last.receive({ type: 'transcript', text: '向前走两步' }))
    expect(preview).toHaveBeenLastCalledWith('向前走两步')
    expect(host.textContent).not.toContain('向前走两步')
    expect(commit).not.toHaveBeenCalled()
    click('结束录音')
    expect(stop).toHaveBeenCalled()
    expect(Socket.last.send).toHaveBeenCalledWith(JSON.stringify({ type: 'finish' }))
    flushSync(() => Socket.last.receive({ type: 'final', text: '向前走两步。' }))
    expect(commit).toHaveBeenCalledExactlyOnceWith('向前走两步。')
    expect(preview).toHaveBeenLastCalledWith(undefined)
    const old = Socket.last
    click('语音输入')
    await vi.waitFor(() => expect(Socket.last).not.toBe(old))
    scope = 'two'
    flushSync(() => change())
    flushSync(() => Socket.last.receive({ type: 'final', text: '不能写入新会话' }))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('语音输入')
  } finally {
    flushSync(() => root.unmount())
    host.remove()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  }
})
