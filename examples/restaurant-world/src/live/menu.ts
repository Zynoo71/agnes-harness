import { CallError } from '@agnes/mhs/device'
import { hairOnDish } from '../actors.js'
import { dishById, MENU, menuLine, STATION_DEVICE } from '../menu.js'
import type { Line, Stage } from './service.js'
import { type World, WorldDevice } from './world.js'

/** How an order line's stage reads in the menu device's state. */
export function stageText(l: Line): string {
  const by = STATION_DEVICE[l.dish.station]
  const words: Record<Stage, string> = {
    queued: l.dish.station === 'bar' ? `waiting for ${by}` : 'waiting for prep-01',
    prepping: 'being prepped by prep-01',
    prepped: `prepped, waiting for ${by}`,
    cooking: `being made on ${by}`,
    ready: l.dish.station === 'bar' ? 'ready at the bar' : `ready on ${by}`,
    at_pass: 'at the pass',
    on_the_way: 'on the way to the table',
    served: 'served',
    cleared: 'cleared away',
    cancelled: 'cancelled',
  }
  return words[l.stage]
}

/** The calls that make `lines`: one prep trip for the kitchen's, then each station's cook; the bar's make. */
function nextCalls(lines: Line[]): string {
  const kitchen = lines.filter((l) => l.dish.station !== 'bar')
  const bar = lines.filter((l) => l.dish.station === 'bar')
  return [
    ...(kitchen.length
      ? [
          `prep-01 prep (${kitchen.length > 3 ? `three a trip, so ${Math.ceil(kitchen.length / 3)} trips` : 'all of them in one trip'}), then ${kitchen.map((l) => `${STATION_DEVICE[l.dish.station]} cook item ${l.id}`).join(', ')}`,
        ]
      : []),
    ...bar.map((l) => `bar-01 make item ${l.id}`),
  ].join('; ')
}

/**
 * The menu and the orders: the guest's screen shows the menu; an order makes lines (o1, o2, …),
 * one per portion, that the prep robot preps and the wok or the stove cooks, or the bar makes, when they are told to; lines waiting
 * can be cancelled, and any line hurried.
 */
export function menu(world: World, log: (line: string) => void): WorldDevice {
  const { service } = world
  const dev = new WorldDevice({
    id: 'menu-01',
    kind: 'system',
    name: 'Menu and orders',
    model: 'Agnes Restaurant ordering',
    localization: 'none',
    profile: {
      notes: `Takes the guest's orders. Each portion becomes an order line (o1, o2, …) that is made when told: a wok-01 or stove-01 dish is prepped by prep-01 prep, then cooked by its station's cook; a bar-01 item is made by bar-01 make. The menu (id: name, price, station): ${MENU.map(menuLine).join('. ')}.`,
    },
    resources: { orders: 'queue' },
    state: {
      orders: {
        type: 'string',
        description:
          'every order line and how far it has got, such as "o1 Kung Pao chicken: being made on wok-01"',
      },
      open: { type: 'integer', min: 0, max: 40, description: 'lines not yet served or cancelled' },
      sold_out: { type: 'string', description: 'dishes sold out today, by id' },
      menu_shown: { type: 'boolean', description: "the menu is open on the guest's screen" },
    },
  })
  dev.log = log
  const report = () =>
    dev.update({
      orders:
        service.lines
          .map(
            (l) =>
              `${l.id} ${l.dish.en}${l.note ? ` (${l.note})` : ''}${l.rush ? ' [hurried]' : ''}: ${stageText(l)}`,
          )
          .join('; ') || 'none',
      open: service.lines.filter((l) => !['served', 'cleared', 'cancelled'].includes(l.stage)).length,
      sold_out: [...service.soldOut].join(', '),
      menu_shown: service.menuOpen,
    })
  report()
  service.listeners.push(report)
  const lineOf = (id: unknown) => {
    const l = service.line(String(id))
    if (!l) throw new CallError('x_no_line', `there is no order line ${id}`)
    return l
  }

  dev.tool(
    {
      name: 'show_menu',
      description:
        "Open (or close) the menu on the guest's screen. It opens by itself when the guest is seated (host-01 seat_guest), so open it again only when the guest asks.",
      timeout: 5,
      params: { open: { type: 'boolean', description: 'true opens it (default), false closes it' } },
      uses: ['orders'],
      ui: { label: 'Show menu' },
    },
    async (_call, { open }) => {
      service.menuOpen = open !== false
      service.changed()
      return service.menuOpen ? 'the menu is open on the guest’s screen' : 'the menu is closed'
    },
  )
  dev.tool(
    {
      name: 'order',
      description:
        'Order dishes and drinks for the seated guest. Each portion becomes an order line; the result says which device makes it. Notes (less spicy, no coriander, no ice) go to the kitchen.',
      timeout: 10,
      params: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              dish: { type: 'string', enum: MENU.map((d) => d.id) },
              qty: { type: 'integer', minimum: 1, maximum: 4 },
              note: { type: 'string', maxLength: 60, description: 'what the guest asked for, for the cook' },
            },
            required: ['dish'],
          },
        },
      },
      required: ['items'],
      uses: ['orders'],
      ui: { label: 'Order' },
    },
    async (_call, { items }) => {
      if (service.guest !== 'seated')
        throw new CallError('x_not_seated', 'the guest is not seated yet: host-01 seat_guest first')
      const asked = items as { dish: string; qty?: number; note?: string }[]
      const out = asked.filter((i) => service.soldOut.has(i.dish))
      if (out.length)
        throw new CallError(
          'x_sold_out',
          `${out.map((i) => dishById(i.dish)?.en).join(', ')} sold out today; nothing was ordered, order again without it`,
        )
      const made: Line[] = []
      for (const i of asked) {
        const dish = dishById(i.dish)
        if (!dish) continue
        for (let k = 0; k < (i.qty ?? 1); k++)
          made.push({
            id: service.nextLine(),
            dish,
            note: i.note?.trim() ?? '',
            rush: false,
            stage: 'queued',
          })
      }
      service.lines.push(...made)
      service.menuOpen = false
      service.changed()
      return {
        detail: `ordered ${made.map((l) => `${l.id} ${l.dish.en}`).join(', ')}; nothing is made until you start it: ${nextCalls(made)}`,
        data: { lines: made.map((l) => ({ id: l.id, dish: l.dish.id, by: STATION_DEVICE[l.dish.station] })) },
      }
    },
  )
  dev.tool(
    {
      name: 'cancel',
      description: 'Cancel an order line nobody has started making yet; it comes off the bill.',
      timeout: 5,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o2' } },
      required: ['item'],
      uses: ['orders'],
      ui: { label: 'Cancel' },
    },
    async (_call, { item }) => {
      const l = lineOf(item)
      if (l.stage === 'cancelled') return `${l.id} was already cancelled`
      if (l.stage !== 'queued')
        throw new CallError('x_too_late', `${l.id} ${l.dish.en} is already ${stageText(l)}`)
      l.stage = 'cancelled'
      service.changed()
      return `cancelled ${l.id} ${l.dish.en}; it is off the bill`
    },
  )
  dev.tool(
    {
      name: 'hurry',
      description:
        'Mark an order line as hurried, when the guest is in a hurry or asks for it sooner: its station makes it twice as fast (a note does not). Says how far it has got.',
      timeout: 5,
      params: { item: { type: 'string', maxLength: 8, description: 'the order line, such as o1' } },
      required: ['item'],
      uses: ['orders'],
      ui: { label: 'Hurry' },
    },
    async (_call, { item }) => {
      const l = lineOf(item)
      l.rush = true
      service.changed()
      return `${l.id} ${l.dish.en} hurried; it is ${stageText(l)}`
    },
  )
  world.conditions.push({
    device: dev.id,
    en: 'A hair in the guest’s latest dish',
    zh: '客人刚上的菜里有根头发',
    apply: () => {
      const l = service.lines.findLast((x) => x.stage === 'served' && x.dish.station !== 'bar' && !x.problem)
      if (!l) return
      l.problem = 'a hair in it'
      l.object?.add(hairOnDish())
      service.changed()
    },
  })
  world.conditions.push({
    device: dev.id,
    en: 'Sea bass sold out',
    zh: '鲈鱼卖完了',
    apply: () => {
      service.soldOut.add('steamed_seabass')
      service.changed()
    },
  })
  return dev
}
