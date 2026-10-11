/**
 * The models behind the DM. `DecisionModel` is all the DM needs from one: given the state in words
 * and named options, a probability for each. Jev and clef answer the same System One API, so they
 * share `SystemOneModel` and differ only in where the request goes.
 */

/** A probability for each option, and the model's own certainty if it gives one. */
export interface Ranking {
  probabilities: Record<string, number>
  confidence?: number
}

export interface DecisionModel {
  /** Short name for pages and logs: jev, clef. */
  readonly name: string
  /** Ranks the options (id to description) for the state. Throws when the model cannot answer. */
  rank(state: string, options: Record<string, string>, instructions: string): Promise<Ranking>
}

type Answer = {
  answers?: { q?: { probabilities?: Record<string, number>; confidence?: number } }
  errors?: unknown
  error?: unknown
}

/** A System One model: the state and one Choice question in, its answer's probabilities out. */
export abstract class SystemOneModel implements DecisionModel {
  abstract readonly name: string
  protected abstract readonly url: string
  protected abstract readonly headers: Record<string, string>
  /** The model id the API is asked for. */
  protected abstract readonly model: string

  async rank(state: string, options: Record<string, string>, instructions: string): Promise<Ranking> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { ...this.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        state,
        questions: { q: { type: 'choice', instructions, criteria: options } },
      }),
    })
    const json = (await res.json()) as Answer & { result?: Answer }
    const q = (json.result ?? json).answers?.q
    if (!res.ok || !q?.probabilities)
      throw new Error(JSON.stringify(json.errors ?? json.error ?? json).slice(0, 200))
    return {
      probabilities: q.probabilities,
      ...(q.confidence === undefined ? {} : { confidence: q.confidence }),
    }
  }
}

/** TypeSafe's Jev. */
export class JevModel extends SystemOneModel {
  readonly name = 'jev'
  protected readonly url = 'https://api.typesafe.ai/v1/systemone'
  protected readonly headers: Record<string, string>

  constructor(
    key: string,
    protected readonly model = 'jev-latest',
  ) {
    super()
    this.headers = { authorization: `Bearer ${key}` }
  }
}

/** Cloudflare's clef, a 27B decision model on Workers AI. */
export class ClefModel extends SystemOneModel {
  readonly name = 'clef'
  protected readonly url: string
  protected readonly headers: Record<string, string>

  constructor(
    account: string,
    token: string,
    protected readonly model = 'clef',
  ) {
    super()
    this.url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/${model}`
    this.headers = { authorization: `Bearer ${token}` }
  }
}
