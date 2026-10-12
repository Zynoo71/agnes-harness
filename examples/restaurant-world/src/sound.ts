/**
 * The room's music through the computer's speakers: while room-01 plays the birthday song, the page
 * plays its melody (public domain), synthesised with WebAudio at room-01's volume. Browsers only
 * let a page make sound after a click, so the sound starts off and a button in the bar turns it on.
 */

// Happy Birthday in C, 3/4, as [note, beats].
const MELODY: [string, number][] = [
  ['G4', 0.75],
  ['G4', 0.25],
  ['A4', 1],
  ['G4', 1],
  ['C5', 1],
  ['B4', 2],
  ['G4', 0.75],
  ['G4', 0.25],
  ['A4', 1],
  ['G4', 1],
  ['D5', 1],
  ['C5', 2],
  ['G4', 0.75],
  ['G4', 0.25],
  ['G5', 1],
  ['E5', 1],
  ['C5', 1],
  ['B4', 1],
  ['A4', 2],
  ['F5', 0.75],
  ['F5', 0.25],
  ['E5', 1],
  ['C5', 1],
  ['D5', 1],
  ['C5', 3],
]
const BEAT = 0.5
const REST = 2.5
const SEMITONES: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }
const hz = (note: string) =>
  440 * 2 ** ((SEMITONES[note[0] as string] as number) / 12 + (Number(note[1]) - 4))

export interface Sound {
  /** Whether the person turned the sound on. */
  on: boolean
  toggle(): void
}

export function buildSound(
  music: () => { track: string; volume: number } | undefined,
  button: HTMLButtonElement,
): Sound {
  let ctx: AudioContext | undefined
  let out: GainNode | undefined
  /** When the current pass through the melody ends, while one is scheduled. */
  let until = 0
  /** The scheduled passes play through this; dropping it silences them at once. */
  let pass: GainNode | undefined
  const hush = () => {
    pass?.disconnect()
    pass = undefined
    until = 0
  }
  const sound: Sound = {
    on: false,
    toggle() {
      sound.on = !sound.on
      if (sound.on && !ctx) {
        ctx = new AudioContext()
        out = ctx.createGain()
        out.connect(ctx.destination)
      }
      if (sound.on) void ctx?.resume()
      else void ctx?.suspend()
      hush()
      show()
    },
  }
  const show = () => {
    button.textContent = sound.on ? '🔊' : '🔈'
    button.classList.toggle('on', sound.on)
  }
  button.addEventListener('click', () => sound.toggle())
  show()

  /** Schedules one pass of the melody from `start`, a music box: a sine with a soft overtone. */
  const play = (c: AudioContext, to: GainNode, start: number) => {
    let t = start
    for (const [note, beats] of MELODY) {
      const f = hz(note)
      const length = beats * BEAT
      for (const [mult, level] of [
        [1, 1],
        [2, 0.25],
      ] as const) {
        const osc = c.createOscillator()
        const env = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = f * mult
        env.gain.setValueAtTime(0, t)
        env.gain.linearRampToValueAtTime(level, t + 0.02)
        env.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.3, length * 0.95))
        osc.connect(env).connect(to)
        osc.start(t)
        osc.stop(t + length + 0.05)
      }
      t += length
    }
    return t
  }

  setInterval(() => {
    const m = music()
    if (!ctx || !out || !sound.on) return
    out.gain.value = m ? (m.volume / 10) * 0.35 : 0
    if (m?.track !== 'birthday') return hush()
    if (ctx.currentTime > until - 0.2) {
      if (!pass) {
        pass = ctx.createGain()
        pass.connect(out)
      }
      until = play(ctx, pass, Math.max(ctx.currentTime + 0.05, until)) + REST
    }
  }, 250)
  return sound
}
