/**
 * The menu: what the kitchen and the bar make, at what price, where, and what to tell a guest
 * about it. Plain data, so the menu device, the page's menu card and the tests share it.
 */

/** Where a dish is made: the wok station, the steamer and stove, or the drinks bar. */
export type Station = 'wok' | 'stove' | 'bar'

/** How a dish looks on the table (actors.ts draws each). */
export type Look =
  | 'stirfry'
  | 'braise'
  | 'fish'
  | 'steamer'
  | 'rice'
  | 'bowl'
  | 'noodles'
  | 'soup'
  | 'greens'
  | 'tea'
  | 'glass'
  | 'cake'

export interface Dish {
  id: string
  en: string
  zh: string
  /** Yuan. */
  price: number
  station: Station
  look: Look
  /** The food's colour where the look varies. */
  color?: number
  /** 0 not spicy to 3 very spicy. */
  spicy: number
  signature?: boolean
  vegetarian?: boolean
  allergens?: string[]
  /** Seconds the station takes for it. */
  seconds: number
}

export const MENU: Dish[] = [
  {
    id: 'kungpao_chicken',
    en: 'Kung Pao chicken',
    zh: '宫保鸡丁',
    price: 48,
    station: 'wok',
    look: 'stirfry',
    color: 0xc4622d,
    spicy: 2,
    signature: true,
    allergens: ['peanuts'],
    seconds: 14,
  },
  {
    id: 'mapo_tofu',
    en: 'Mapo tofu',
    zh: '麻婆豆腐',
    price: 32,
    station: 'wok',
    look: 'braise',
    color: 0xb8321e,
    spicy: 3,
    signature: true,
    allergens: ['soy'],
    seconds: 12,
  },
  {
    id: 'fried_rice',
    en: 'Yangzhou fried rice',
    zh: '扬州炒饭',
    price: 28,
    station: 'wok',
    look: 'rice',
    spicy: 0,
    allergens: ['egg', 'shrimp'],
    seconds: 10,
  },
  {
    id: 'garlic_greens',
    en: 'Garlic greens',
    zh: '蒜蓉时蔬',
    price: 26,
    station: 'wok',
    look: 'greens',
    spicy: 0,
    vegetarian: true,
    seconds: 8,
  },
  {
    id: 'sweet_sour_pork',
    en: 'Sweet and sour pork',
    zh: '糖醋里脊',
    price: 42,
    station: 'wok',
    look: 'stirfry',
    color: 0xd9542b,
    spicy: 0,
    seconds: 14,
  },
  {
    id: 'steamed_seabass',
    en: 'Steamed sea bass',
    zh: '清蒸鲈鱼',
    price: 88,
    station: 'stove',
    look: 'fish',
    spicy: 0,
    signature: true,
    allergens: ['fish'],
    seconds: 18,
  },
  {
    id: 'xiaolongbao',
    en: 'Soup dumplings',
    zh: '小笼包',
    price: 30,
    station: 'stove',
    look: 'steamer',
    spicy: 0,
    signature: true,
    allergens: ['wheat'],
    seconds: 12,
  },
  {
    id: 'beef_noodles',
    en: 'Braised beef noodles',
    zh: '红烧牛肉面',
    price: 36,
    station: 'stove',
    look: 'noodles',
    color: 0x9a4a24,
    spicy: 1,
    allergens: ['wheat'],
    seconds: 14,
  },
  {
    id: 'hot_sour_soup',
    en: 'Hot and sour soup',
    zh: '酸辣汤',
    price: 22,
    station: 'stove',
    look: 'soup',
    spicy: 1,
    allergens: ['egg'],
    seconds: 8,
  },
  {
    id: 'steamed_rice',
    en: 'Steamed rice',
    zh: '米饭',
    price: 3,
    station: 'stove',
    look: 'bowl',
    spicy: 0,
    vegetarian: true,
    seconds: 4,
  },
  {
    id: 'chrysanthemum_tea',
    en: 'Chrysanthemum tea, a pot',
    zh: '菊花茶（一壶）',
    price: 18,
    station: 'bar',
    look: 'tea',
    spicy: 0,
    vegetarian: true,
    seconds: 6,
  },
  {
    id: 'sour_plum',
    en: 'Sour plum drink',
    zh: '酸梅汤',
    price: 12,
    station: 'bar',
    look: 'glass',
    color: 0x5a1a14,
    spicy: 0,
    vegetarian: true,
    seconds: 5,
  },
  {
    id: 'soy_milk',
    en: 'Soy milk',
    zh: '豆浆',
    price: 8,
    station: 'bar',
    look: 'glass',
    color: 0xf3ead6,
    spicy: 0,
    vegetarian: true,
    allergens: ['soy'],
    seconds: 4,
  },
  {
    id: 'orange_juice',
    en: 'Fresh orange juice',
    zh: '鲜榨橙汁',
    price: 22,
    station: 'bar',
    look: 'glass',
    color: 0xf28c28,
    spicy: 0,
    vegetarian: true,
    seconds: 8,
  },
  {
    id: 'cola',
    en: 'Cola',
    zh: '可乐',
    price: 8,
    station: 'bar',
    look: 'glass',
    color: 0x3a1a0e,
    spicy: 0,
    vegetarian: true,
    seconds: 3,
  },
  {
    id: 'mango_sago',
    en: 'Mango pomelo sago',
    zh: '杨枝甘露',
    price: 26,
    station: 'bar',
    look: 'glass',
    color: 0xf6c04a,
    spicy: 0,
    vegetarian: true,
    seconds: 8,
  },
  {
    id: 'birthday_cake',
    en: 'Birthday cake with candles',
    zh: '生日蛋糕（带蜡烛）',
    price: 98,
    station: 'bar',
    look: 'cake',
    color: 0xd8452f,
    spicy: 0,
    allergens: ['egg', 'milk', 'wheat'],
    seconds: 10,
  },
]

export const dishById = (id: string) => MENU.find((d) => d.id === id)

/** The devices that make each station's dishes. */
export const STATION_DEVICE: Record<Station, string> = { wok: 'wok-01', stove: 'stove-01', bar: 'bar-01' }

/** One line of the menu as the menu device describes it: id, names, price and what to know. */
export function menuLine(d: Dish): string {
  const tags = [
    d.signature ? 'signature' : '',
    d.spicy ? `spicy ${d.spicy}/3` : '',
    d.vegetarian ? 'vegetarian' : '',
    d.allergens?.length ? `contains ${d.allergens.join(', ')}` : '',
  ].filter(Boolean)
  return `${d.id}: ${d.en} (${d.zh}) ¥${d.price}, ${STATION_DEVICE[d.station]}${tags.length ? `; ${tags.join('; ')}` : ''}`
}
