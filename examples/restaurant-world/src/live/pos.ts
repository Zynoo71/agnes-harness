import { CallError } from '@agnes/mhs/device'
import { FIXTURES, TABLE_H, TABLES } from '../layout.js'
import { placed } from './floormap.js'
import { stageText } from './menu.js'
import { type World, WorldDevice, wait } from './world.js'

/**
 * The payment terminal: makes the bill, with any discount, and shows it on the guest's screen with a
 * QR code to pay, and charges.
 */
export function pos(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  /** Over the guest's table, for a few seconds: the payment went through. */
  const paidLine = (en: string, zh: string) => {
    const t = TABLES.find((x) => x.id === service.table)
    if (t) world.cheer({ en, zh, at: { x: t.x, z: -t.y }, h: TABLE_H + 0.5, steam: [] })
  }
  const dev = new WorldDevice({
    id: 'pos-01',
    kind: 'terminal',
    name: 'Payment terminal',
    model: 'Agnes Restaurant payment terminal',
    localization: 'fixed',
    placement: placed(FIXTURES.cashier.x, FIXTURES.cashier.y, 90),
    profile: {
      notes:
        "Bills the guest's table: bill shows the bill with a QR code on the guest's screen, with any percentage taken off; charge takes the payment (QR code, card or cash). Everything ordered and not cancelled is on the bill.",
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
      description:
        "Make the bill for the guest's table and show it on their screen with a QR code to pay, once the guest asks for it, with how they said they pay. Decide the discount here: up to 50 % as a courtesy (a birthday, a wait that was too long), and more, up to 100 % (on the house), only for a dish that had a problem, such as something in it; the guest sees the reason. Billing again before payment replaces both.",
      timeout: 10,
      params: {
        percent: { type: 'integer', minimum: 0, maximum: 100, description: 'percentage off, 0 for none' },
        reason: { type: 'string', maxLength: 40, description: 'why, as the guest sees it' },
        method: {
          type: 'string',
          enum: ['qr', 'card', 'cash'],
          default: 'qr',
          description: 'how the guest pays',
        },
      },
      required: ['percent'],
      uses: ['till'],
      ui: { label: 'Bill' },
    },
    async (call, { percent, reason, method }) => {
      if (!service.table || service.guest === 'left')
        throw new CallError('x_no_guest', 'the guest has no table')
      if (!service.billed().length) throw new CallError('x_nothing_ordered', 'nothing was ordered')
      if (Number(percent ?? 0) > 50 && !service.lines.some((l) => l.problem && l.stage !== 'cancelled'))
        throw new CallError(
          'x_comp_needs_problem',
          'more than 50 % off only when a dish had a problem; no dish of this table had one',
        )
      await wait(call, 1000)
      if (service.bill !== 'paid') {
        service.discount = Number(percent ?? 0)
        service.discountReason = String(reason ?? '')
        service.payWith = String(method ?? 'qr')
        service.bill = 'billed'
      }
      service.billOpen = true
      service.changed()
      return {
        detail: `bill for ${service.table} on the guest's screen, to pay by ${service.payWith === 'qr' ? 'QR code' : service.payWith} at their table: ${summary()}; pos-01 charge takes it when the guest pays`,
        data: {
          total: service.total(),
          lines: service.billed().map((l) => ({ id: l.id, dish: l.dish.id, price: l.dish.price })),
        },
      }
    },
  )
  dev.tool(
    {
      name: 'charge',
      description:
        'Take the payment for the bill shown, the way it says, once the guest wants to pay: it waits while the guest scans the QR code on their screen, or takes their card or cash, and confirms it.',
      timeout: 30,
      uses: ['till'],
      ui: { label: 'Charge' },
    },
    async (call) => {
      if (service.bill === 'paid') return `already paid, ¥${service.total()}`
      if (service.bill !== 'billed') throw new CallError('x_not_billed', 'show the bill first (bill)')
      if (service.total() === 0) {
        service.bill = 'paid'
        service.paidWith = 'free'
        service.changed()
        paidLine('✓ On the house', '✓ 免单')
        return 'on the house: nothing to pay'
      }
      const how = service.payWith
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
      paidLine(`✓ Paid ¥${service.total()}`, `✓ 已付款 ¥${service.total()}`)
      return `paid ¥${service.total()} by ${how === 'qr' ? 'QR code' : how}`
    },
  )
  return dev
}
