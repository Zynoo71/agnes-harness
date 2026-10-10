import { LAYOUT } from '../base.js'
import { WEATHER_TURN } from '../devices.js'
import { placed } from './basemap.js'
import { yawOf } from './route.js'
import { every, type World, WorldDevice } from './world.js'

/** The weather station: readings once a second, and a storm warning in its state. */
export function weatherStation(world: World, log: (line: string) => void): WorldDevice {
  const dev = new WorldDevice({
    id: 'weather-01',
    kind: 'sensor',
    name: 'Weather station',
    model: 'Agnes Base simulation',
    localization: 'fixed',
    // Facing the way its instrument box faces.
    placement: placed(LAYOUT.weather, yawOf(WEATHER_TURN)),
    state: {
      storm_warning: {
        type: 'string',
        enum: ['none', 'watch', 'warning'],
        description: 'dust storm warning, from wind and dust',
      },
    },
  })
  dev.log = log
  dev.update({ storm_warning: 'none' })
  const air = dev.source('air', 'values', 'wind, pressure, temperature, dust and radiation at the base', {
    hz: 1,
    default: true,
    fields: {
      wind: { type: 'number', unit: 'm/s', min: 0, max: 40, alert: { warn: 15, bad: 25 } },
      pressure: { type: 'number', unit: 'Pa', min: 400, max: 1100 },
      temperature: { type: 'number', unit: '°C', min: -110, max: 30, role: 'temperature', of: 'air' },
      dust: {
        type: 'number',
        min: 0,
        max: 5,
        alert: { warn: 1.2, bad: 2.5 },
        description: 'optical depth (tau)',
      },
      radiation: { type: 'number', unit: 'x_ugy_per_h', min: 0, max: 100 },
    },
  })
  every(
    1000,
    () => {
      const t = performance.now() / 1000
      const hour = world.clock.hour()
      // Afternoons are gustier than nights; the air is warmest at about 14:00 and coldest before dawn.
      const afternoon = Math.max(0, Math.cos(((hour - 15) / 24) * 2 * Math.PI))
      // A dust storm (an event) blows on top: up to about 30 m/s more wind and tau 4 at full strength.
      const storm = world.events?.storm ?? 0
      const gust = storm * (28 + Math.sin(t / 7) * 4 + Math.random() * 3)
      const wind = Math.round((4 + afternoon * 4 + Math.sin(t / 30) * 1.5 + Math.random() + gust) * 10) / 10
      const dust = Math.round((0.6 + Math.sin(t / 200) * 0.05 + storm * 3.4) * 100) / 100
      const warning = wind > 25 || dust > 2.5 ? 'warning' : wind > 15 || dust > 1.2 ? 'watch' : 'none'
      world.weather = { wind, dust, storm: warning }
      dev.update({ storm_warning: warning })
      if (!air.wants()) return
      air.send({
        wind,
        pressure: Math.round(728 + Math.sin(t / 90) * 4),
        temperature:
          Math.round((-45 + 35 * Math.cos(((hour - 14) / 24) * 2 * Math.PI) + Math.sin(t / 120)) * 10) / 10,
        dust,
        radiation: Math.round((24 + Math.random() * 2) * 10) / 10,
      })
    },
    log,
  )
  return dev
}
