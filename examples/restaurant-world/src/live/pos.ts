import { CallError } from '@agnes/mhs/device'
import { FIXTURES } from '../layout.js'
import { placed } from './floormap.js'
import { stageText } from './menu.js'
import { type World, WorldDevice, wait } from './world.js'

/**
 * The payment terminal: makes the bill and shows it on the guest's screen with a QR code to pay,
 * takes a discount, and charges.
 */
export function pos(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const dev = new WorldDevice({
    id: 'pos-01',
    kind: 'terminal',
    name: 'Payment terminal',
    model: 'Agnes Restaurant payment terminal',
    localization: 'fixed',
    placement: placed(FIXTURES.cashier.x, FIXTURES.cashier.y, 90),
    profile: {
      notes:
        "Bills the guest's table: bill shows the bill with a QR code on the guest's screen; discount takes a percentage off; charge takes the payment (QR code, card or cash). Everything ordered and not cancelled is on the bill.",
    },
    resources: { till: 'queue' },
    state: {
      bill: {
        type: 'string',
        enum: ['none', 'billed', 'paid'],
        description: 'whether the bill was shown and paid',
      },
      total: {
        type: 'integer',
        unit: 'x_cny',
        min: 0,
        max: 10000,
        description: 'what the guest pays, discount taken off',
      },
      discount: { type: 'integer', unit: '%', min: 0, max: 50 },
    },
  })
  dev.log = log
  const report = () => dev.update({ bill: service.bill, total: service.total(), discount: service.discount })
  report()
  service.listeners.push(report)
  const summary = () => {
    const items = service.billed()
    const waiting = items.filter((l) => l.stage !== 'served' && l.stage !== 'cleared')
    return `${items.map((l) => `${l.dish.en} ¥${l.dish.price}`).join(', ')}; subtotal ¥${service.subtotal()}${
      service.discount ? `, ${service.discount}% off (${service.discountReason})` : ''
    }; total ¥${service.total()}${waiting.length ? `. Not served yet: ${waiting.map((l) => `${l.id} ${l.dish.en} (${stageText(l)})`).join(', ')}` : ''}`
  }

  dev.tool(
    {
      name: 'bill',
      description: "Make the bill for the guest's table and show it on their screen with a QR code to pay.",
      timeout: 10,
      uses: ['till'],
      ui: { label: 'Bill' },
    },
    async (call) => {
      if (!service.table || service.guest === 'left')
        throw new CallError('x_no_guest', 'the guest has no table')
      if (!service.billed().length) throw new CallError('x_nothing_ordered', 'nothing was ordered')
      await wait(call, 1000)
      if (service.bill !== 'paid') service.bill = 'billed'
      service.billOpen = true
      service.changed()
      return {
        detail: `bill for ${service.table} on the guest's screen: ${summary()}`,
        data: {
          total: service.total(),
          lines: service.billed().map((l) => ({ id: l.id, dish: l.dish.id, price: l.dish.price })),
        },
      }
    },
  )
  dev.tool(
    {
      name: 'discount',
      description:
        'Take a percentage off the bill, with the reason the guest sees (a birthday, a wait that was too long).',
      timeout: 5,
      params: {
        percent: { type: 'integer', minimum: 0, maximum: 50 },
        reason: { type: 'string', maxLength: 40 },
      },
      required: ['percent'],
      uses: ['till'],
      ui: { label: 'Discount' },
    },
    async (_call, { percent, reason }) => {
      if (service.bill === 'paid') throw new CallError('x_paid', 'the bill is already paid')
      service.discount = Number(percent)
      service.discountReason = String(reason ?? '')
      service.changed()
      return `${percent}% off; total ¥${service.total()}`
    },
  )
  dev.tool(
    {
      name: 'charge',
      description: 'Take the payment for the bill shown: by QR code (the guest scans it), card or cash.',
      timeout: 30,
      params: { method: { type: 'string', enum: ['qr', 'card', 'cash'] } },
      uses: ['till'],
      ui: { label: 'Charge' },
    },
    async (call, { method }) => {
      if (service.bill === 'paid') return `already paid, ¥${service.total()}`
      if (service.bill !== 'billed') throw new CallError('x_not_billed', 'show the bill first (bill)')
      const how = String(method ?? 'qr')
      for (let k = 1; k <= 8; k++) {
        await wait(call, 500)
        call.progress({
          done: k,
          total: 8,
          text: how === 'qr' ? 'waiting for the guest to scan' : `taking ${how}`,
        })
      }
      service.bill = 'paid'
      service.paidWith = how
      service.changed()
      return `paid ¥${service.total()} by ${how === 'qr' ? 'QR code' : how}`
    },
  )
  return dev
}
