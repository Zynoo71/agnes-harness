import { TABLES } from './layout.js'
import { MENU } from './menu.js'

/**
 * Words for what devices say over MHS, for people: device and tool names, enum values and progress
 * texts. The devices keep speaking English to the hub; only the page shows these.
 */

export type Lang = 'en' | 'zh'

/** The restaurant's devices, in the order the page lists them. */
export const DEVICES: { id: string; en: string; zh: string }[] = [
  { id: 'host-01', en: 'Host robot', zh: '迎宾机器人' },
  { id: 'floor-01', en: 'Floor plan', zh: '桌位' },
  { id: 'menu-01', en: 'Menu and orders', zh: '点餐' },
  { id: 'wok-01', en: 'Wok station', zh: '炒锅' },
  { id: 'stove-01', en: 'Steamer and stove', zh: '蒸灶' },
  { id: 'arm-01', en: 'Kitchen arm', zh: '厨房机械臂' },
  { id: 'bar-01', en: 'Bar robot', zh: '吧台机器人' },
  { id: 'runner-01', en: 'Runner', zh: '送餐机器人' },
  { id: 'supplies-01', en: 'Supplies cabinet', zh: '用品柜' },
  { id: 'cleaner-01', en: 'Cleaner', zh: '清洁机器人' },
  { id: 'room-01', en: 'Room', zh: '灯光音乐空调' },
  { id: 'pos-01', en: 'Payment terminal', zh: '收银' },
  { id: 'cam-01', en: 'Dining room camera', zh: '摄像头' },
]

const TOOLS: Record<string, [en: string, zh: string]> = {
  bill: ['Bill', '出账单'],
  cancel: ['Cancel', '退菜'],
  charge: ['Charge', '收款'],
  clean: ['Clean', '清洁'],
  clear: ['Clear table', '收桌'],
  cook: ['Cook', '烹饪'],
  deliver: ['Deliver', '送餐'],
  dispense: ['Dispense', '取用品'],
  hurry: ['Hurry', '催菜'],
  look_at: ['Look at', '看向'],
  make: ['Make', '制作'],
  order: ['Order', '下单'],
  plate: ['Plate', '装盘'],
  play_music: ['Play music', '放音乐'],
  restock: ['Restock', '补货'],
  say: ['Say', '说话'],
  seat_guest: ['Seat guest', '带位'],
  see_off: ['See off', '送客'],
  set_lights: ['Set lights', '调灯光'],
  set_table: ['Set table', '设置桌位'],
  set_temperature: ['Set temperature', '调温度'],
  show_menu: ['Show menu', '展示菜单'],
  stop: ['Stop', '停止'],
}

const VALUES_ZH: Record<string, string> = {
  // Lights, music, payment.
  bright: '明亮',
  warm: '暖光',
  dim: '昏暗',
  party: '派对',
  off: '关',
  guzheng: '古筝',
  jazz: '爵士',
  pop: '流行',
  birthday: '生日歌',
  qr: '扫码',
  card: '刷卡',
  cash: '现金',
  // Tables and the guest.
  free: '空闲',
  reserved: '已预订',
  occupied: '有客',
  needs_clearing: '待收拾',
  outside: '门外',
  at_door: '门口',
  following: '跟随中',
  seated: '已入座',
  leaving: '离开中',
  left: '已离开',
  // Modes.
  idle: '空闲',
  cooking: '烹饪中',
  making: '制作中',
  plating: '装盘中',
  docked: '充电座',
  fetching: '取餐中',
  delivering: '送餐中',
  clearing: '收桌中',
  returning: '返回中',
  going: '前往中',
  cleaning: '清洁中',
  leading: '带位中',
  seeing_off: '送客中',
  none: '无',
  billed: '已出单',
  paid: '已付款',
  // Supplies.
  napkins: '纸巾',
  chopsticks: '筷子',
  bowl: '碗',
  spoon: '勺子',
  cup: '杯子',
  takeaway_box: '打包盒',
  baby_chair: '儿童椅',
  // Places.
  door: '门口',
  'waiting-area': '等候区',
  cashier: '收银台',
  pass: '出餐口',
  bar: '吧台',
  supplies: '用品柜',
  'dish-return': '回收口',
  'dining-room': '餐厅',
  kitchen: '厨房',
  true: '是',
  false: '否',
}
for (const t of TABLES) VALUES_ZH[t.id] = t.name.zh
for (const d of MENU) VALUES_ZH[d.id] = d.zh

export const toolLabel = (lang: Lang, tool: string) => TOOLS[tool]?.[lang === 'zh' ? 1 : 0] ?? tool

/** An enum value; `name` names device ids. */
export const valueLabel = (lang: Lang, value: string, name: (id: string) => string = (id) => id) => {
  const named = name(value)
  if (named !== value) return named
  if (lang === 'zh') return VALUES_ZH[value] ?? value
  return MENU.find((d) => d.id === value)?.en ?? value.replaceAll('_', ' ')
}

/** A dish's English name in Chinese. */
const dishZh = (en: string) => MENU.find((d) => d.en === en)?.zh ?? en

/** Progress texts in Chinese, by pattern; anything else stays as the device said it. */
const PROGRESS_ZH: [RegExp, (m: RegExpMatchArray, v: (s: string) => string) => string][] = [
  [
    /^cooking (o\d+) ([^(]+?)(?: \((.+)\))?$/,
    (m) => `烹饪 ${m[1]} ${dishZh(m[2] ?? '')}${m[3] ? `（${m[3]}）` : ''}`,
  ],
  [/^making (o\d+) (.+)$/, (m) => `制作 ${m[1]} ${dishZh(m[2] ?? '')}`],
  [/^scrubbing at (.+)$/, (m, v) => `在${v(m[1] ?? '')}擦洗`],
  [/^waiting for the guest to scan$/, () => '等客人扫码'],
  [/^taking (\w+)$/, (m, v) => `收${v(m[1] ?? '')}`],
]

export const progressLabel = (lang: Lang, text: string) => {
  if (lang !== 'zh') return text
  const v = (s: string) => valueLabel(lang, s)
  for (const [re, say] of PROGRESS_ZH) {
    const m = text.match(re)
    if (m) return say(m, v)
  }
  return text
}
