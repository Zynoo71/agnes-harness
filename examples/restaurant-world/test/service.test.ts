import { describe, expect, it } from 'vitest'
import { type Line, mayComp, Service } from '../src/live/service.js'
import { MENU } from '../src/menu.js'

const dish = (id: string) => {
  const d = MENU.find((x) => x.id === id)
  if (!d) throw new Error(`no dish ${id}`)
  return d
}
const line = (id: string, dishId: string, problem?: string): Line => ({
  id,
  dish: dish(dishId),
  note: '',
  rush: false,
  stage: 'served',
  problem,
})

describe('house treats on the bill', () => {
  const cake = line('o1', 'birthday_cake')
  const other = MENU.find((d) => d.id !== 'birthday_cake')?.id ?? ''

  it('lets the birthday cake and a dish with a problem go on the house, nothing else', () => {
    expect(mayComp(cake)).toBe(true)
    expect(mayComp(line('o2', other, 'a hair'))).toBe(true)
    expect(mayComp(line('o3', other))).toBe(false)
  })

  it('charges nothing for a comped line', () => {
    const s = new Service()
    s.lines = [{ ...cake, comped: true }, line('o2', other)]
    expect(s.subtotal()).toBe(dish(other).price)
  })
})
