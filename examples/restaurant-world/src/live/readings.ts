import { round } from './route.js'

/** A reading with a little noise, rounded to `digits`. */
export const reading = (value: number, noise: number, digits = 1) =>
  round(value + (Math.random() - 0.5) * 2 * noise, digits)
