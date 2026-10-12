import { CallError } from '@agnes/mhs/device'
import { ROOM } from '../layout.js'
import { placed } from './floormap.js'
import { reading } from './readings.js'
import { every, type World, WorldDevice, wait } from './world.js'

export const LIGHT_SCENES = ['bright', 'warm', 'dim', 'party'] as const
export const TRACKS = ['off', 'guzheng', 'jazz', 'pop', 'birthday'] as const

/**
 * The room: its lights, its music and its air conditioning. Lighting scenes and music change what
 * the page shows; the air drifts toward the set temperature, a degree every half minute or so.
 */
export function ambience(world: World, log: (line: string) => void): WorldDevice {
  const { ambience: a } = world
  let acOn = true
  const dev = new WorldDevice({
    id: 'room-01',
    kind: 'environment',
    name: 'Room',
    model: 'Agnes Restaurant lights, music and air',
    localization: 'fixed',
    placement: placed(ROOM.w / 2, ROOM.d / 2, 90),
    profile: {
      notes:
        'The dining room’s lights (bright, warm, dim, party: coloured and slowly changing), its music (guzheng, jazz, pop, the birthday song, or off) and its air conditioning.',
    },
    resources: { lights: 'queue', music: 'queue', air: 'queue' },
    state: {
      lights: { type: 'string', enum: [...LIGHT_SCENES] },
      outside: {
        type: 'string',
        enum: ['day', 'evening'],
        description:
          'daylight through the windows; in the evening the dining room is darker, and bright lights make up for it',
      },
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
        description: 'the dining room’s air now',
      },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      lights: a.lights,
      outside: a.outside,
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
  const curves = dev.source('air', 'values', 'the dining room’s air', {
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
      const want = acOn ? a.temperature : 30
      a.air += Math.sign(want - a.air) * Math.min(Math.abs(want - a.air), 0.07)
      if (curves.wants()) curves.send({ temperature: reading(a.air, 0.05, 2), humidity: reading(48, 0.5) })
    },
    log,
  )
  every(5000, report, log)

  dev.tool(
    {
      name: 'set_lights',
      description:
        'Change the dining room’s lights: bright, warm (the usual), dim (cosy, candle-like), or party (coloured, changing).',
      timeout: 10,
      params: { scene: { type: 'string', enum: [...LIGHT_SCENES] } },
      required: ['scene'],
      uses: ['lights'],
      ui: { label: 'Lights' },
    },
    async (call, { scene }) => {
      world.light(String(scene))
      await wait(call, 1500)
      a.lights = String(scene)
      report()
      return `lights set to ${scene}`
    },
  )
  dev.tool(
    {
      name: 'play_music',
      description: 'Play music in the dining room, or stop it (off). Volume is a setting, 0 to 10.',
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
      world.actors.effects.notes.visible = a.music !== 'off'
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
      if (!acOn) throw new CallError('x_ac_off', 'the air conditioning is off; it cannot be set')
      await wait(call, 800)
      a.temperature = Number(celsius)
      report()
      return `air conditioning set to ${celsius} °C; the room is ${Math.round(a.air * 10) / 10} °C now`
    },
  )
  world.conditions.push({
    device: dev.id,
    en: 'The room gets hot (air conditioning fails, then recovers)',
    zh: '屋里变热（空调故障，之后恢复）',
    apply: () => {
      acOn = false
      a.air = Math.max(a.air, 27.2)
      report()
      setTimeout(() => {
        acOn = true
      }, 60000)
    },
  })
  world.conditions.push({
    device: dev.id,
    en: 'Evening falls: the dining room gets darker',
    zh: '天黑了，屋里暗下来',
    apply: () => {
      a.outside = 'evening'
      report()
    },
  })
  world.onReset(() => {
    Object.assign(a, { lights: 'warm', outside: 'day', music: 'guzheng', volume: 4, temperature: 24 })
    a.air = 24
    acOn = true
    world.light('warm')
    world.actors.effects.notes.visible = true
    report()
  })
  world.actors.effects.notes.visible = true
  return dev
}
