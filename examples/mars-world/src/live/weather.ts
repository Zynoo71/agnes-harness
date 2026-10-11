import { LAYOUT } from '../base.js'
import { sunAt } from '../clock.js'
import { WEATHER_TURN } from '../devices.js'
import { placed } from './basemap.js'
import { yawOf } from './route.js'
import { every, type World, WorldDevice } from './world.js'

/** The part of the sol by the local hour: the sun rises at 06:00 and sets at 18:00. */
const daylight = (hour: number) =>
  hour < 6 || hour >= 18 ? 'night' : hour < 7 ? 'dawn' : hour < 17 ? 'day' : 'dusk'

/**
 * The weather station: readings once a second, the sun's place, and in its state a storm warning,
 * the part of the sol and when the sun next sets and rises.
 */
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
      daylight: {
        type: 'string',
        enum: ['dawn', 'day', 'dusk', 'night'],
        description: 'dawn 06:00–07:00, day, dusk 17:00–18:00 (the sun low in the west), night from 18:00',
      },
      sunset_at: { type: 'number', unit: 's', description: 'Unix time when the sun next sets' },
      sunrise_at: { type: 'number', unit: 's', description: 'Unix time when the sun next rises' },
    },
  })
  dev.log = log
  dev.update({ storm_warning: 'none' })
  const sun = dev.source('sun', 'values', 'local solar time and where the sun stands', {
    hz: 1,
    fields: {
      local_hour: { type: 'number', min: 0, max: 24, description: 'hours since local midnight (LMST)' },
      elevation: { type: 'number', unit: 'deg', min: -90, max: 90, description: 'above the horizon' },
      azimuth: {
        type: 'number',
        unit: 'deg',
        min: 0,
        max: 360,
        description: 'clockwise from north: 90 east at sunrise, 270 west at sunset',
      },
    },
  })
  /** Sun times move only when the clock is skipped; report them again only then. */
  const sky = { sunset: 0, sunrise: 0 }
  const reportSky = (hour: number) => {
    const now = Date.now() / 1000
    const sunset = Math.round(now + world.clock.secondsUntil(18))
    const sunrise = Math.round(now + world.clock.secondsUntil(6))
    const moved = Math.abs(sunset - sky.sunset) > 2 || Math.abs(sunrise - sky.sunrise) > 2
    if (moved && Number.isFinite(sunset)) Object.assign(sky, { sunset, sunrise })
    dev.update({
      daylight: daylight(hour),
      ...(moved && Number.isFinite(sunset) ? { sunset_at: sunset, sunrise_at: sunrise } : {}),
    })
  }
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
      reportSky(hour)
      if (sun.wants()) {
        const { elevation, azimuth } = sunAt(hour)
        sun.send({
          local_hour: Math.round(hour * 100) / 100,
          elevation: Math.round(elevation * 10) / 10,
          azimuth: Math.round(azimuth * 10) / 10,
        })
      }
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
