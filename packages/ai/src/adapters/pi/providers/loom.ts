import type { Api, Model, Provider as PiProvider } from '@earendil-works/pi-ai'

/**
 * The Loom gateway on this machine (OpenAI-compatible chat completions). It needs no
 * key, so any placeholder works. The catalogue is static. Context and output limits are provisional.
 */
export const LOOM_BASE_URL = 'http://127.0.0.1:8488/v1'

// Agnes models are Loom aliases that may point at Ark or at Azure, and Azure refuses `thinking`;
// both take `reasoning_effort`, so thinking off is sent as `none`, which every target accepts.
// Azure's GPT-5 models refuse `max_tokens` (every target takes `max_completion_tokens`) and, on chat
// completions, any other effort with function tools.
const EFFORT_LEVELS = { off: 'none', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }

const LOOM_MODELS: Model<Api>[] = [
  {
    id: 'agnes-3.0-pro',
    name: 'Agnes 3.0 Pro (Loom)',
    provider: 'loom',
    api: 'openai-completions',
    baseUrl: LOOM_BASE_URL,
    // The wire library names itself `pi`; Loom's logs should show who is asking.
    headers: { 'User-Agent': 'agnes (local)' },
    input: ['text', 'image'],
    contextWindow: 256000,
    maxTokens: 32768,
    compat: { maxTokensField: 'max_completion_tokens', supportsReasoningEffort: true },
    reasoning: true,
    thinkingLevelMap: EFFORT_LEVELS,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  } as Model<'openai-completions'>,
]

/** Same shape as agnes-ai.ts: the registry only reads identity and `getModels()`. */
export function loomProvider(): PiProvider {
  return {
    id: 'loom',
    name: 'Loom (local)',
    baseUrl: LOOM_BASE_URL,
    getModels: () => LOOM_MODELS,
  } as unknown as PiProvider
}
