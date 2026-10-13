import type { Call } from '@agnes/mhs/device'
import { type BedName, GREENHOUSE, LAYOUT } from '../base.js'
import { sunAt } from '../clock.js'
import { placed } from './basemap.js'
import { type Bed, every, type World, WorldDevice, wait } from './world.js'

/** Growth is fast, so a crop ripens within a demo: from planting to ripe in this many seconds of water and light. */
export const GROW_S = 110
/** Below this soil moisture (%) the plants stop growing. */
const THIRSTY = 30
/** Soil moisture lost each second (%): growing plants drink, bare or ripe soil only dries a little. */
const DRINK = { growing: 0.4, resting: 0.05 }
/** Seconds the pump takes to soak a bed. */
const IRRIGATE_S = 6
/** Above this sun elevation (degrees) daylight through the glass is enough to grow. */
const DAYLIGHT = 2

const BEDS = Object.keys(GREENHOUSE.beds) as BedName[]
const stage = (b: Bed) =>
  b.crop === 'none' ? 'empty' : b.growth >= 1 ? 'ripe' : b.growth >= 0.35 ? 'leafy' : 'sprout'

/**
 * The greenhouse: two beds either side of an aisle, watered by a drip pump and lit by the sun through
 * the glass or by grow lights. Monolith plants and harvests the beds through the east door.
 */
export function greenhouse(world: World, log: (line: string) => void): WorldDevice {
  const view = world.parts.greenhouse
  const bedState = (name: BedName) => ({
    [`${name}_crop`]: {
      type: 'string',
      enum: ['none', 'tomato', 'potato'],
      description: `what grows in the ${name} bed`,
    },
    [`${name}_stage`]: {
      type: 'string',
      enum: ['empty', 'sprout', 'leafy', 'ripe'],
      description: `how far the ${name} bed has grown; ripe is ready to harvest`,
    },
    [`${name}_moisture`]: {
      type: 'integer',
      unit: '%',
      min: 0,
      max: 100,
      description: `soil moisture in the ${name} bed`,
    },
    [`${name}_needs`]: {
      type: 'string',
      enum: ['nothing', 'water', 'light'],
      description: `what keeps the ${name} bed's crop from growing now`,
    },
  })
  const dev = new WorldDevice({
    id: 'greenhouse-01',
    kind: 'greenhouse',
    name: 'Greenhouse',
    model: 'Agnes Base greenhouse',
    localization: 'fixed',
    // Its long side runs east to its door.
    placement: placed(LAYOUT.greenhouse, 0),
    profile: {
      notes: `Two beds of ${GREENHOUSE.plants} plants, north and south of an aisle, joined to the habitat by a tunnel; a door at the east end lets Monolith in. A crop grows only with soil moisture of at least ${THIRSTY} % (irrigate) and light: the sun by day, the grow lights at night, which need power (power-01, load greenhouse). Growth is quickened: about ${GROW_S} s from planting to ripe, sprout then leafy then ripe. monolith-01 plants seed potatoes in an empty bed and harvests a ripe one into a crate.`,
    },
    resources: { pump: 'reject', lights: 'reject' },
    state: {
      lights: { type: 'string', enum: ['on', 'off'], description: 'the grow lights' },
      light: {
        type: 'string',
        enum: ['sunlight', 'grow lights', 'dark'],
        description: 'what lights the beds now',
      },
      ...bedState('north'),
      ...bedState('south'),
    },
  })
  dev.log = log
  const light = () =>
    sunAt(world.clock.hour()).elevation > DAYLIGHT
      ? 'sunlight'
      : world.growLights && world.greenhousePowered
        ? 'grow lights'
        : 'dark'
  const needs = (b: Bed) =>
    b.crop === 'none' || b.growth >= 1
      ? 'nothing'
      : b.moisture < THIRSTY
        ? 'water'
        : light() === 'dark'
          ? 'light'
          : 'nothing'
  const show = () => {
    for (const name of BEDS) {
      const b = world.beds[name]
      view.bed(name, b.crop, b.growth, b.planted, b.moisture / 100)
    }
    view.lights(world.growLights && world.greenhousePowered)
  }
  const report = () => {
    show()
    const state: Record<string, unknown> = { lights: world.growLights ? 'on' : 'off', light: light() }
    for (const name of BEDS) {
      const b = world.beds[name]
      state[`${name}_crop`] = b.crop
      state[`${name}_stage`] = stage(b)
      state[`${name}_moisture`] = Math.round(b.moisture)
      state[`${name}_needs`] = needs(b)
    }
    dev.update(state)
  }
  world.gardenChanged = report
  report()
  every(
    1000,
    () => {
      for (const name of BEDS) {
        const b = world.beds[name]
        const growing = b.crop !== 'none' && b.growth < 1 && b.planted > 0
        if (growing && needs(b) === 'nothing') {
          b.growth = Math.min(1, b.growth + 1 / GROW_S)
          if (b.growth >= 1) for (const hear of world.ripeListeners) hear(name, b.crop)
        }
        b.moisture = Math.max(0, b.moisture - (growing ? DRINK.growing : DRINK.resting))
      }
      report()
    },
    log,
  )

  const bedParam = { type: 'string', enum: BEDS, description: 'which bed' }
  dev.tool(
    {
      name: 'irrigate',
      description: 'Soak a bed with the drip pump, to full soil moisture.',
      timeout: IRRIGATE_S + 10,
      params: { bed: bedParam },
      required: ['bed'],
      uses: ['pump'],
      ui: { label: 'Irrigate' },
    },
    async (call: Call, { bed }) => {
      const b = world.beds[bed as BedName]
      const from = b.moisture
      for (let i = 1; i <= IRRIGATE_S * 4; i++) {
        await wait(call, 250)
        b.moisture = from + ((100 - from) * i) / (IRRIGATE_S * 4)
        show()
        if (i % 4 === 0) call.progress({ done: i / 4, total: IRRIGATE_S, text: `watering the ${bed} bed` })
      }
      report()
      return {
        detail: `watered the ${bed} bed: soil moisture ${Math.round(b.moisture)} %; ${b.crop === 'none' ? 'nothing grows in it yet' : b.growth >= 1 ? `its ${b.crop}es are ripe` : needs(b) === 'nothing' ? `its ${b.crop}es grow: ${bed}_stage turns ripe in about ${Math.ceil((1 - b.growth) * GROW_S)} s; harvest it then` : `its ${b.crop}es still need ${needs(b)}`}`,
        data: { bed, moisture: Math.round(b.moisture) },
      }
    },
  )
  dev.tool(
    {
      name: 'set_lights',
      description:
        'Switch the grow lights on or off. They light the beds at night, when the sun does not, and are most of the greenhouse power load.',
      timeout: 10,
      params: { on: { type: 'boolean', description: 'true to switch them on' } },
      required: ['on'],
      uses: ['lights'],
      ui: { label: 'Grow lights' },
    },
    async (call: Call, { on }) => {
      await wait(call, 600)
      world.growLights = on === true
      report()
      const powered = world.greenhousePowered
      return {
        detail: `grow lights ${on ? 'on' : 'off'}${on && !powered ? ', but the greenhouse has no power (power-01 has it shed or dark)' : ''}; the beds are lit by ${light() === 'dark' ? 'nothing now' : light()}`,
        data: { lights: on ? 'on' : 'off', light: light() },
      }
    },
  )
  world.onReset(() => {
    view.door(0)
    report()
  })
  return dev
}
