/**
 * The decision model's options: every fixed action the devices allow right now, built from their
 * descriptions on AgnesHub alone (rosorin docs/dm-mode-design.md 3.2). Nothing here knows Mars.
 */

type Json = Record<string, unknown>

interface Param {
  type?: string
  enum?: unknown[]
  default?: unknown
}

interface Tool {
  name: string
  description: string
  inputSchema?: { properties?: Record<string, Param>; required?: string[] }
}

interface Field {
  type?: string
  unit?: string
  enum?: string[]
  writable?: boolean
  description?: string
}

/** The parts of a hub/devices entry the options come from. */
export interface DeviceEntry {
  id: string
  name?: string
  kind?: string
  online?: boolean
  maps?: unknown
  available: boolean
  tools?: Tool[]
  state: { fields: Record<string, Field>; values: Json }
}

/** A value only known at run time (a photo, a sample, a rock), for parameters of the same name. */
export interface Candidate {
  value: string
  /** Where it came from, for the option's description: "from hopper-01 survey". */
  from: string
}

/** What choosing an option does: a hub/call, or a hub/set. */
export type Action = { device: string; tool: string; args: Json } | { device: string; values: Json }

export const ASK_LLM = 'ask_llm'

export interface Options {
  /** Option id to its description, the Choice question's criteria. */
  criteria: Record<string, string>
  actions: Map<string, Action>
}

const firstSentence = (text: string) => text.split('. ')[0]?.replace(/\.$/, '') ?? text

/**
 * For each available device
 * every combination of its tools' enum and boolean parameters without a default, then its
 * writable enum fields, and `ask_llm` last. A parameter named like a run-time candidate takes the
 * candidates' values; a tool with another required free parameter (text, a number) is the LLM's.
 */
export function buildOptions(devices: DeviceEntry[], candidates: Map<string, Candidate[]>): Options {
  const criteria: Record<string, string> = {}
  const actions = new Map<string, Action>()
  const add = (id: string, description: string, action: Action) => {
    criteria[id] = description
    actions.set(id, action)
  }
  for (const d of devices) {
    if (!d.available) continue
    for (const t of d.tools ?? []) {
      const props = t.inputSchema?.properties ?? {}
      const required = new Set(t.inputSchema?.required ?? [])
      let combos: { args: Json; notes: string[] }[] = [{ args: {}, notes: [] }]
      let closed = true
      for (const [name, p] of Object.entries(props)) {
        if (p.default !== undefined) continue
        const known = candidates.get(name)
        const values = p.enum ?? (p.type === 'boolean' ? [true, false] : undefined)
        if (values)
          combos = combos.flatMap((c) =>
            values.map((v) => ({ args: { ...c.args, [name]: v }, notes: c.notes })),
          )
        else if (known?.length)
          combos = combos.flatMap((c) =>
            known.map((k) => ({
              args: { ...c.args, [name]: k.value },
              notes: [...c.notes, `${k.value} ${k.from}`],
            })),
          )
        else if (required.has(name)) closed = false
      }
      if (!closed) continue
      for (const c of combos) {
        const id = actionId({ device: d.id, tool: t.name, args: c.args })
        add(id, [firstSentence(t.description), ...c.notes].join('; '), {
          device: d.id,
          tool: t.name,
          args: c.args,
        })
      }
    }
    for (const [name, f] of Object.entries(d.state.fields)) {
      if (!f.writable || !f.enum) continue
      for (const v of f.enum)
        if (v !== d.state.values[name])
          add(actionId({ device: d.id, values: { [name]: v } }), f.description ?? `set ${name}`, {
            device: d.id,
            values: { [name]: v },
          })
    }
  }
  criteria[ASK_LLM] =
    'hand it to the LLM operator: judge that nothing needs doing, talk to people, write something, pick coordinates or other values, judge a picture, or plan several steps'
  return { criteria, actions }
}

/** How an action is named among the options: "<device> <tool> name=value …" or "<device> set field=value …". */
export function actionId(action: Action): string {
  const pairs = Object.entries('values' in action ? action.values : action.args).map(([k, v]) => `${k}=${v}`)
  return [action.device, 'values' in action ? 'set' : action.tool, ...pairs].join(' ')
}

/**
 * Run-time ids in a result's data, by the parameter they fit: a string under a key, or a list of
 * strings under its plural ("targets" fills "target").
 */
export function idsIn(data: Json): [string, string][] {
  const found: [string, string][] = []
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') found.push([key, value])
    else if (Array.isArray(value) && key.endsWith('s'))
      for (const v of value) if (typeof v === 'string') found.push([key.slice(0, -1), v])
  }
  return found
}
