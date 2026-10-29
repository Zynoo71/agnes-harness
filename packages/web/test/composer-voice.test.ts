/** @vitest-environment happy-dom */
import { flushSync } from 'react-dom'
import { expect, it, vi } from 'vitest'
import { mountRenderedIndex, resetWebDom } from './web-dom-fixture.js'

const preview = vi.hoisted(() => ({ update: (_text: string | undefined) => {} }))
vi.mock('../../web-units/src/voice-input.js', () => ({
  VoiceInput: ({ onPreview }: { onPreview(text: string | undefined): void }) => {
    preview.update = onPreview
    return null
  },
}))
it('shows live transcription inside the textarea without persisting or submitting it', async () => {
  const submit = vi.fn()
  const save = vi.fn()
  const runtime = await mountRenderedIndex({
    composer: {
      initialDraft: '原草稿',
      onSubmit: submit,
      onDraftChange: save,
      voice: { scope: () => 'test', subscribe: () => () => {}, commit: () => {} },
    },
  })
  try {
    const input = document.querySelector<HTMLTextAreaElement>('#prompt')
    const form = document.querySelector<HTMLFormElement>('#composer')
    if (!input || !form) throw new Error('Missing composer')
    flushSync(() => preview.update('向前'))
    expect(input.value).toBe('原草稿 向前')
    flushSync(() => preview.update('向前走两步'))
    expect(input.value).toBe('原草稿 向前走两步')
    expect(input.readOnly).toBe(true)
    expect(runtime.composer?.getDraft()).toBe('原草稿')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(submit).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    flushSync(() => preview.update(undefined))
    expect(input.value).toBe('原草稿')
    expect(input.readOnly).toBe(false)
  } finally {
    await runtime.dispose()
    resetWebDom()
  }
})
