import { CallError } from '@agnes/mhs/device'
import type * as THREE from 'three'
import { supplyModel } from '../actors.js'
import { COUNTER_H, FIXTURES } from '../layout.js'
import { place } from '../shapes.js'
import { placed } from './floormap.js'
import { SUPPLY_ITEMS, type SupplyItem } from './service.js'
import { everyFrame, type World, WorldDevice, wait } from './world.js'

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
  balloon: 3,
}

/** The most of one supply a dispense puts out. */
const MAX_QTY = 4

/** Where each dispensed supply waits on the cabinet, by supply id. */
export const supplySpots = new Map<string, number>()

/**
 * The supplies cabinet by the low wall: napkins, chopsticks, bowls, spoons, cups, takeaway boxes,
 * a baby chair and balloons. dispense puts them out for runner-01; it counts its stock.
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
        'Holds napkins, chopsticks, bowls, spoons, cups, takeaway boxes, a baby chair, and balloons, a little gift from the house for a small child. dispense puts them out on top (the baby chair and balloons beside it) as supplies s1, s2, … for runner-01 deliver. A party needs about one of each per person; a number it could not use is confirmed with the guest before anything is put out.',
    },
    resources: { hatch: 'queue' },
    state: Object.fromEntries(
      SUPPLY_ITEMS.map((item) => [
        item,
        {
          type: 'integer',
          min: 0,
          max: FULL[item],
          alert: item === 'baby_chair' || item === 'balloon' ? undefined : { warn: 3, bad: 0, below: true },
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
      description: `Put up to ${MAX_QTY} of one kind of supply out for runner-01 to bring: the result names each one (s1, s2, …).`,
      timeout: 20,
      params: {
        item: { type: 'string', enum: [...SUPPLY_ITEMS] },
        qty: {
          type: 'integer',
          minimum: 1,
          description: `how many the guest asked for, 1 to ${MAX_QTY}; a pair of chopsticks is one`,
        },
      },
      required: ['item', 'qty'],
      uses: ['hatch'],
      ui: { label: 'Dispense' },
    },
    async (call, { item, qty }) => {
      const what = item as SupplyItem
      const n = (qty as number | undefined) ?? 1
      if (n > MAX_QTY)
        throw new CallError(
          'x_too_many',
          `${n} ${what.replace('_', ' ')}: at most ${MAX_QTY} at a time; nothing was put out. Do not dispense yet: ask the guest how many they need, tell them the limit, and offer ${MAX_QTY} now`,
        )
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
        else if (what === 'balloon') {
          // On the floor at the cabinet's west end, leaning away from it, side by side.
          const waiting = service.supplies.filter((x) => x.item === 'balloon' && x.stage === 'ready').length
          world.actors.group.add(place(object, S.x - S.w / 2 - 0.25 - waiting * 0.22, S.y - 0.1, 0, 90))
        } else
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
      return 'the cabinet is full again; nothing is out for runner-01 until supplies-01 dispense puts out what the guest asked for'
    },
  )
  // Balloons bob gently wherever they are: at the cabinet, on a tray, at the table.
  everyFrame(() => {
    const t = performance.now() / 1000
    for (const s of service.supplies) {
      const sway = s.object.userData.sway as THREE.Object3D | undefined
      if (!sway) continue
      const k = Number(s.id.slice(1))
      sway.rotation.z = Math.sin(t * 1.1 + k) * 0.06
      sway.rotation.x = Math.sin(t * 0.8 + k * 1.7) * 0.05
      sway.position.y = Math.sin(t * 1.6 + k) * 0.015
    }
  }, log)
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
