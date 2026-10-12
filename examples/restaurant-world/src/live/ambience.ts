import { CallError } from '@agnes/mhs/device'
import type * as THREE from 'three'
import { PRIVATE_ROOM, ROOM } from '../layout.js'
import { placed } from './floormap.js'
import { reading } from './readings.js'
import { type Air, every, type World, WorldDevice, wait } from './world.js'

export const LIGHT_SCENES = ['bright', 'warm', 'dim', 'party'] as const
export const TRACKS = ['off', 'guzheng', 'jazz', 'pop', 'birthday'] as const

/** One room's lights, music and air: the dining room's (room-01) or the private room's (room-02). */
interface Space {
  id: string
  name: string
  model: string
  /** The room in words: "the dining room". */
  room: string
  at: { x: number; y: number }
  air: Air
  /** How a fresh page has it. */
  start: Omit<Air, 'air'>
  light: (scene: string) => void
  notes: THREE.Object3D
  /** The dining room also reports whether it is day or evening outside. */
  outside?: () => string
}

/**
 * A room: its lights, its music and its air conditioning. Lighting scenes and music change what
 * the page shows; the air drifts toward the set temperature, a degree every half minute or so.
 */
function roomDevice(world: World, log: (line: string) => void, s: Space) {
  const a = s.air
  const control = { acOn: true }
  const dev = new WorldDevice({
    id: s.id,
    kind: 'environment',
    name: s.name,
    model: s.model,
    localization: 'fixed',
    placement: placed(s.at.x, s.at.y, 90),
    profile: {
      notes: `${s.room[0]?.toUpperCase()}${s.room.slice(1)}’s lights (bright, warm, dim, party: coloured and slowly changing), its music (guzheng, jazz, pop, the birthday song, or off) and its air conditioning.`,
    },
    resources: { lights: 'queue', music: 'queue', air: 'queue' },
    state: {
      lights: { type: 'string', enum: [...LIGHT_SCENES] },
      ...(s.outside
        ? {
            outside: {
              type: 'string',
              enum: ['day', 'evening'],
              description:
                'daylight through the windows; in the evening the dining room is darker, and bright lights make up for it',
            },
          }
        : {}),
      music: { type: 'string', enum: [...TRACKS] },
      volume: { type: 'integer', min: 0, max: 10, writable: true, description: 'music volume' },
      set_temperature: {
        type: 'number',
        unit: '°C',
        min: 18,
        max: 28,
        description: 'what the air conditioning aims for',
      },
      temperature: {
        type: 'number',
        unit: '°C',
        min: 10,
        max: 40,
        role: 'temperature',
        of: 'air',
        alert: { warn: 27, bad: 30 },
        description: `${s.room}’s air now`,
      },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      lights: a.lights,
      ...(s.outside ? { outside: s.outside() } : {}),
      music: a.music,
      volume: a.volume,
      set_temperature: a.temperature,
      temperature: Math.round(a.air * 10) / 10,
    })
  report()
  dev.onSet = (name, value) => {
    if (name === 'volume') a.volume = Number(value)
    return value
  }
  const curves = dev.source('air', 'values', `${s.room}’s air`, {
    hz: 0.5,
    default: true,
    fields: {
      temperature: { type: 'number', unit: '°C', min: 10, max: 40, role: 'temperature', of: 'air' },
      humidity: { type: 'number', unit: '%', min: 0, max: 100 },
    },
  })
  every(
    2000,
    () => {
      const want = control.acOn ? a.temperature : 30
      a.air += Math.sign(want - a.air) * Math.min(Math.abs(want - a.air), 0.07)
      if (curves.wants()) curves.send({ temperature: reading(a.air, 0.05, 2), humidity: reading(48, 0.5) })
    },
    log,
  )
  every(5000, report, log)

  dev.tool(
    {
      name: 'set_lights',
      description: `Change ${s.room}’s lights: bright, warm (the usual), dim (cosy, candle-like), or party (coloured, changing).`,
      timeout: 10,
      params: { scene: { type: 'string', enum: [...LIGHT_SCENES] } },
      required: ['scene'],
      uses: ['lights'],
      ui: { label: 'Lights' },
    },
    async (call, { scene }) => {
      s.light(String(scene))
      await wait(call, 1500)
      a.lights = String(scene)
      report()
      return `lights set to ${scene}`
    },
  )
  dev.tool(
    {
      name: 'play_music',
      description: `Play music in ${s.room}, or stop it (off). Volume is a setting, 0 to 10.`,
      timeout: 10,
      params: {
        track: {
          type: 'string',
          enum: [...TRACKS],
          description: 'guzheng, jazz, pop, birthday (the birthday song), or off',
        },
        volume: { type: 'integer', minimum: 0, maximum: 10 },
      },
      required: ['track'],
      uses: ['music'],
      ui: { label: 'Music' },
    },
    async (call, { track, volume }) => {
      await wait(call, 500)
      a.music = String(track)
      if (typeof volume === 'number') a.volume = volume
      s.notes.visible = a.music !== 'off'
      report()
      return a.music === 'off' ? 'music off' : `playing ${track} at volume ${a.volume}`
    },
  )
  dev.tool(
    {
      name: 'set_temperature',
      description: 'Set the air conditioning, 18 to 28 °C; the room follows over a few minutes.',
      timeout: 10,
      params: { celsius: { type: 'number', minimum: 18, maximum: 28 } },
      required: ['celsius'],
      uses: ['air'],
      ui: { label: 'Temperature' },
    },
    async (call, { celsius }) => {
      if (!control.acOn) throw new CallError('x_ac_off', 'the air conditioning is off; it cannot be set')
      await wait(call, 800)
      a.temperature = Number(celsius)
      report()
      return `air conditioning set to ${celsius} °C; the room is ${Math.round(a.air * 10) / 10} °C now`
    },
  )
  world.onReset(() => {
    Object.assign(a, s.start)
    a.air = s.start.temperature
    control.acOn = true
    s.light(s.start.lights)
    s.notes.visible = s.start.music !== 'off'
    report()
  })
  s.light(s.start.lights)
  s.notes.visible = s.start.music !== 'off'
  return { dev, report, control }
}

/** The dining room's lights, music and air, and whether it is day or evening outside. */
export function ambience(world: World, log: (line: string) => void): WorldDevice {
  const { ambience: a } = world
  const { dev, report, control } = roomDevice(world, log, {
    id: 'room-01',
    name: 'Room',
    model: 'Agnes Restaurant lights, music and air',
    room: 'the dining room',
    at: { x: ROOM.w / 2, y: ROOM.d / 2 },
    air: a,
    start: { lights: 'warm', music: 'guzheng', volume: 4, temperature: 24 },
    light: (scene) => world.light(scene),
    notes: world.actors.effects.notes,
    outside: () => world.outside,
  })
  world.conditions.push({
    device: dev.id,
    en: 'The room gets hot (air conditioning fails, then recovers)',
    zh: '屋里变热（空调故障，之后恢复）',
    apply: () => {
      control.acOn = false
      a.air = Math.max(a.air, 27.2)
      report()
      setTimeout(() => {
        control.acOn = true
      }, 60000)
    },
  })
  world.conditions.push({
    device: dev.id,
    en: 'Evening falls: the dining room gets darker',
    zh: '天黑了，屋里暗下来',
    apply: () => {
      world.outside = 'evening'
      report()
    },
  })
  world.onReset(() => {
    world.outside = 'day'
    report()
  })
  return dev
}

/** The private room's own lights, music and air. */
export function privateAmbience(world: World, log: (line: string) => void): WorldDevice {
  const P = PRIVATE_ROOM
  return roomDevice(world, log, {
    id: 'room-02',
    name: 'Private room',
    model: 'Agnes Restaurant private room',
    room: 'the private room',
    at: { x: (P.x0 + P.x1) / 2, y: (P.y0 + P.y1) / 2 },
    air: world.privateRoom,
    start: { lights: 'warm', music: 'off', volume: 4, temperature: 24 },
    light: (scene) => world.lightPrivate(scene),
    notes: world.actors.effects.privateNotes,
  }).dev
}
