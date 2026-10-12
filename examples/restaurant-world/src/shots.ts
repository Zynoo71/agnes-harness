import { type Framing, OVERVIEW } from './view.js'

/**
 * Fixed views of the room: the whole room, and one closer view per area. Keys 1–9 switch between
 * them; ?shot=<name> picks one in the URL. `devices` are the devices a view is about; only they get
 * tags (omitted: every device).
 */
export const SHOTS: (Framing & { name: string; en: string; zh: string; devices?: string[] })[] = [
  { name: 'overview', en: 'Overview', zh: '总览', ...OVERVIEW },
  {
    name: 'door',
    en: 'Door and cashier',
    zh: '门口和收银台',
    x: 11.5,
    y: 2,
    span: 9,
    devices: ['host-01', 'pos-01', 'menu-01', 'cam-01'],
  },
  {
    name: 'dining',
    en: 'Dining room',
    zh: '用餐区',
    x: 9.5,
    y: 6.4,
    span: 13,
    devices: ['host-01', 'runner-01', 'cleaner-01', 'floor-01'],
  },
  { name: 'round', en: 'The round table', zh: '圆桌', x: 12.2, y: 6.6, span: 6 },
  {
    name: 'kitchen',
    en: 'Kitchen',
    zh: '厨房',
    x: 9.5,
    y: 13.2,
    span: 8,
    devices: ['prep-01', 'wok-01', 'stove-01', 'arm-01'],
  },
  {
    name: 'pass',
    en: 'The pass',
    zh: '出餐口',
    x: 11.5,
    y: 11,
    span: 6.5,
    devices: ['arm-01', 'runner-01', 'supplies-01'],
  },
  {
    name: 'bar',
    en: 'Drinks bar',
    zh: '吧台',
    x: 19.3,
    y: 11.5,
    span: 7,
    devices: ['bar-01', 'runner-01', 'room-01'],
  },
  {
    name: 'windows',
    en: 'Window tables',
    zh: '靠窗座位',
    x: 3.8,
    y: 6.4,
    span: 8,
    devices: ['host-01', 'runner-01', 'cleaner-01'],
  },
  {
    name: 'private',
    en: 'Private room',
    zh: '包间',
    x: 19.2,
    y: 6.2,
    span: 7.5,
    devices: ['host-01', 'runner-01', 'cleaner-01'],
  },
]

export const shotNamed = (name: string) =>
  SHOTS.find((s) => s.name === name) ?? (SHOTS[0] as (typeof SHOTS)[number])
