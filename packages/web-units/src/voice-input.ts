import { createElement, useEffect, useRef, useState } from 'react'

export interface VoiceInputOptions {
  scope(): string | undefined
  subscribe(listener: () => void): () => void
  commit(text: string): void
}

export function VoiceInput({
  options,
  onPreview,
}: {
  options: VoiceInputOptions
  onPreview(text: string | undefined): void
}) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const active = useRef<{ cancel(): void; finish(): void } | undefined>(undefined)
  useEffect(() => {
    const cancel = () => active.current?.cancel()
    const stop = options.subscribe(cancel)
    window.addEventListener('pagehide', cancel)
    return () => {
      stop()
      window.removeEventListener('pagehide', cancel)
      cancel()
    }
  }, [options])
  const start = async () => {
    if (active.current) return
    const scope = options.scope()
    if (!scope) {
      setError('请先选择一个会话。')
      return
    }
    setState('connecting')
    onPreview('')
    setError('')
    let cancelled = false
    let finishing = false
    let stream: MediaStream | undefined
    let audio: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let capture: AudioWorkletNode | undefined
    let socket: WebSocket | undefined
    const stopMic = () => {
      for (const track of stream?.getTracks() ?? []) track.stop()
      source?.disconnect()
      capture?.disconnect()
      if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
    }
    const cancel = () => {
      if (cancelled) return
      cancelled = true
      stopMic()
      socket?.close()
      if (active.current === control) active.current = undefined
      setState('idle')
      onPreview(undefined)
    }
    const fail = () => {
      if (!cancelled) {
        cancel()
        setError('语音识别失败，请检查麦克风权限和服务端 ASR 配置后重试。')
      }
    }
    const control = {
      cancel,
      finish: () => {
        if (!socket || socket.readyState !== WebSocket.OPEN || finishing) return
        finishing = true
        source?.disconnect()
        capture?.port.postMessage('finish')
        setState('finishing')
      },
    }
    active.current = control
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      if (cancelled) {
        stopMic()
        return
      }
      audio = new AudioContext()
      await audio.resume()
      await audio.audioWorklet.addModule('/asr-worklet.js')
      if (cancelled) {
        stopMic()
        return
      }
      source = audio.createMediaStreamSource(stream)
      capture = new AudioWorkletNode(audio, 'agh-asr')
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/asr`)
      socket.onerror = fail
      socket.onclose = () => {
        if (!cancelled) fail()
      }
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
        if (cancelled) return
        if (event.data === 'flushed') {
          stopMic()
          socket?.send(JSON.stringify({ type: 'finish' }))
          return
        }
        if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128000) {
          fail()
          return
        }
        socket.send(event.data)
      }
      socket.onmessage = (event) => {
        if (cancelled || options.scope() !== scope) {
          cancel()
          return
        }
        try {
          const message = JSON.parse(String(event.data)) as { type: string; text?: string }
          if (message.type === 'ready') {
            if (!source || !capture || !audio) throw new Error('Audio unavailable')
            source.connect(capture)
            capture.connect(audio.destination)
            setState('recording')
          } else if (message.type === 'transcript') onPreview(message.text ?? '')
          else if (message.type === 'final' && finishing) {
            const final = message.text?.trim()
            cancel()
            if (final) options.commit(final)
          } else if (message.type === 'error') fail()
        } catch {
          fail()
        }
      }
    } catch {
      fail()
    }
  }
  const label =
    state === 'idle'
      ? '语音输入'
      : state === 'recording'
        ? '结束录音'
        : state === 'connecting'
          ? '连接中…'
          : '识别中…'
  const icon = (kind: 'microphone' | 'stop' | 'cancel') =>
    createElement(
      'svg',
      { className: 'icon', viewBox: '0 0 24 24', 'aria-hidden': true },
      kind === 'microphone'
        ? createElement(
            'g',
            null,
            createElement('rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }),
            createElement('path', { d: 'M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M8 21h8' }),
          )
        : kind === 'stop'
          ? createElement('rect', {
              x: 7,
              y: 7,
              width: 10,
              height: 10,
              rx: 2,
              fill: 'currentColor',
              stroke: 'none',
            })
          : createElement('path', { d: 'm6 6 12 12M18 6 6 18' }),
    )
  return createElement(
    'span',
    { 'data-voice-input': true, className: 'composer-voice-controls' },
    createElement(
      'button',
      {
        type: 'button',
        className: 'secondary-button compact composer-voice-button',
        'aria-label': label,
        title: label,
        'aria-pressed': state === 'recording',
        'aria-busy': state === 'connecting' || state === 'finishing',
        disabled: state === 'connecting' || state === 'finishing',
        onClick: () => (state === 'idle' ? void start() : active.current?.finish()),
      },
      icon(state === 'idle' ? 'microphone' : 'stop'),
    ),
    state !== 'idle'
      ? createElement(
          'button',
          {
            type: 'button',
            className: 'secondary-button compact composer-voice-button',
            'aria-label': '取消录音',
            title: '取消录音',
            onClick: () => active.current?.cancel(),
          },
          icon('cancel'),
        )
      : null,
    error
      ? createElement(
          'span',
          { role: 'status', className: 'composer-voice-error', 'aria-live': 'polite' },
          error,
        )
      : null,
  )
}
