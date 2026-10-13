import { CallError } from '@agnes/mhs/device'
import { supplyModel } from '../actors.js'
import { COUNTER_H, FIXTURES } from '../layout.js'
import { place } from '../shapes.js'
import { placed } from './floormap.js'
import { SUPPLY_ITEMS, type SupplyItem } from './service.js'
import { type World, WorldDevice, wait } from './world.js'

const S = FIXTURES.supplies
/** What the cabinet holds when full. */
const FULL: Record<SupplyItem, number> = {
  napkins: 20,
  chopsticks: 30,
  bowl: 12,
  spoon: 20,
  cup: 12,
  takeaway_box: 10,
  baby_chair: 1,
}

/** Where each dispensed supply waits on the cabinet, by supply id. */
export const supplySpots = new Map<string, number>()

/**
 * The supplies cabinet by the low wall: napkins, chopsticks, bowls, spoons, cups, takeaway boxes
 * and a baby chair. dispense puts them out on top for runner-01; it counts its stock.
 */
export function supplies(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const stock = { ...FULL }
  const dev = new WorldDevice({
    id: 'supplies-01',
    kind: 'dispenser',
    name: 'Supplies cabinet',
    model: 'Agnes Restaurant supplies cabinet',
    localization: 'fixed',
    placement: placed(S.x, S.y, 270),
    profile: {
      notes:
        'Holds napkins, chopsticks, bowls, spoons, cups, takeaway boxes and a baby chair. dispense puts them out on top (the baby chair beside it) as supplies s1, s2, … for runner-01 deliver.',
    },
    resources: { hatch: 'queue' },
    state: Object.fromEntries(
      SUPPLY_ITEMS.map((item) => [
        item,
        {
          type: 'integer',
          min: 0,
          max: FULL[item],
          alert: item === 'baby_chair' ? undefined : { warn: 3, bad: 0, below: true },
          description: `${item.replace('_', ' ')} left`,
        },
      ]).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]),
    ),
  })
  dev.log = log
  const report = () => dev.update({ ...stock })
  report()

  dev.tool(
    {
      name: 'dispense',
      description: 'Put supplies out for runner-01 to bring: the result names each one (s1, s2, …).',
      timeout: 20,
      params: {
        item: { type: 'string', enum: [...SUPPLY_ITEMS] },
        qty: {
          type: 'integer',
          minimum: 1,
          maximum: 4,
          description: 'how many the guest asked for; a pair of chopsticks is one',
        },
      },
      required: ['item', 'qty'],
      uses: ['hatch'],
      ui: { label: 'Dispense' },
    },
    async (call, { item, qty }) => {
      const what = item as SupplyItem
      const n = (qty as number | undefined) ?? 1
      if (stock[what] < n)
        throw new CallError(
          'x_out_of_stock',
          `only ${stock[what]} ${what.replace('_', ' ')} left; restock first`,
        )
      const ids: string[] = []
      for (let k = 0; k < n; k++) {
        await wait(call, 600)
        const object = supplyModel(what)
        const used = new Set(supplySpots.values())
        let spot = 0
        while (used.has(spot)) spot += 1
        if (what === 'baby_chair') world.actors.group.add(place(object, S.x + S.w / 2 + 0.35, S.y - 0.2, 0))
        else
          world.actors.group.add(place(object, S.x - 0.7 + (spot % 6) * 0.28, S.y - 0.12, COUNTER_H.supplies))
        const id = service.nextSupply()
        supplySpots.set(id, spot)
        service.supplies.push({ id, item: what, stage: 'ready', object })
        stock[what] -= 1
        ids.push(id)
        report()
        service.changed()
      }
      return {
        detail: `${ids.join(', ')}: ${n} ${what.replace('_', ' ')} out at the supplies cabinet for runner-01`,
        data: { supplies: ids },
      }
    },
  )
  dev.tool(
    {
      name: 'restock',
      description: 'Refill the cabinet from the store room.',
      timeout: 30,
      uses: ['hatch'],
      ui: { label: 'Restock' },
    },
    async (call) => {
      await wait(call, 4000)
      Object.assign(stock, FULL)
      report()
      return 'the cabinet is full again'
    },
  )
  world.conditions.push({
    device: dev.id,
    en: 'Napkins run out',
    zh: '纸巾用完了',
    apply: () => {
      stock.napkins = 0
      report()
    },
  })
  world.onReset(() => {
    Object.assign(stock, FULL)
    supplySpots.clear()
    report()
  })
  return dev
}
