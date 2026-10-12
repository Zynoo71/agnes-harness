import type { Lang } from './overlay.js'

/**
 * Words for what devices say over MHS, for people: tool names, enum values and progress texts.
 * The devices keep speaking English to the hub; only the page shows these.
 */

const TOOLS: Record<string, [en: string, zh: string]> = {
  analyze: ['Analyze', '分析样品'],
  carry: ['Carry', '搬运'],
  clean_panels: ['Clean panels', '清洁太阳能板'],
  close_outer: ['Close outer door', '关外舱门'],
  collect_sample: ['Collect sample', '采样'],
  push_boulder: ['Push boulder', '推开石头'],
  tow: ['Tow', '拖回'],
  cycle_in: ['Cycle in', '进舱循环'],
  cycle_out: ['Cycle out', '出舱循环'],
  deploy_array: ['Deploy array', '展开太阳能板'],
  dock: ['Dock', '停靠'],
  drive_to: ['Drive to', '开往'],
  fly_to: ['Fly to', '飞往'],
  follow: ['Follow', '跟随'],
  follow_route: ['Follow route', '按路线行驶'],
  go_to: ['Go to', '前往'],
  land: ['Land', '降落'],
  look_at: ['Look at', '看向'],
  open_outer: ['Open outer door', '开外舱门'],
  point: ['Point dish', '转动天线'],
  put_down: ['Put down', '放下'],
  radio: ['Radio', '无线电通话'],
  say: ['Say', '说话'],
  send: ['Send to Earth', '发往地球'],
  set_mode: ['Set mode', '设置模式'],
  shed: ['Shed load', '切断负载'],
  stop: ['Stop', '停止'],
  stow_array: ['Stow array', '收起太阳能板'],
  survey: ['Survey', '勘察'],
  take_off: ['Take off', '起飞'],
  take_photo: ['Take photo', '拍照'],
  unload_rover: ['Unload rover', '卸下样品'],
  zoom: ['Zoom', '变焦'],
}

const VALUES_ZH: Record<string, string> = {
  normal: '正常',
  storm_shelter: '避风',
  medical: '医疗',
  earth: '地球',
  orbiter: '中继卫星',
  none: '无',
  life_support: '生命维持',
  charging: '充电',
  science: '科研',
  greenhouse: '温室',
  return: '返回',
  stay: '原地等待',
  resume: '继续',
  walk: '步行',
  roll: '滚动',
  open: '打开',
  closed: '关闭',
  up: '连通',
  down: '中断',
  watch: '预警',
  warning: '警报',
  ok: '正常',
  weak: '弱',
  lost: '丢失',
  dawn: '黎明',
  day: '白天',
  dusk: '黄昏',
  night: '夜间',
  deployed: '已展开',
  stowed: '已收起',
  moving: '移动中',
  idle: '空闲',
  depressurizing: '泄压',
  pressurizing: '加压',
  'west field': '西边野外',
  'east dunes': '东边沙丘',
  'hopper pad': '飞行器停机坪',
  'landing pad': '着陆坪',
  base: '基地',
  dock: '停靠站',
  airlock: '气闸',
  manual: '手动',
  true: '是',
  false: '否',
}

export const toolLabel = (lang: Lang, tool: string) => TOOLS[tool]?.[lang === 'zh' ? 1 : 0] ?? tool

/** An enum value; `name` names device ids. */
export const valueLabel = (lang: Lang, value: string, name: (id: string) => string = (id) => id) => {
  const named = name(value)
  if (named !== value) return named
  return lang === 'zh' ? (VALUES_ZH[value] ?? value) : value.replaceAll('_', ' ')
}

const PURPOSES_ZH: Record<string, string> = {
  'to the airlock': '去气闸',
  'back to the outcrop': '回露头',
}

/** Progress texts in Chinese, by pattern; anything else stays as the device said it. */
const PROGRESS_ZH: [RegExp, (m: RegExpMatchArray, v: (s: string) => string) => string][] = [
  [/^(depressurizing|pressurizing): ([\d.]+) kPa$/, (m, v) => `${v(m[1] ?? '')}：${m[2]} kPa`],
  [/^sending$/, () => '发送中'],
  [/^on its way to Earth$/, () => '正在发往地球'],
  [/^switching to (.+)$/, (m, v) => `切换到${v(m[1] ?? '')}`],
  [/^igniting the engine$/, () => '点火'],
  [/^flying to the (.+): (\d+) m to go$/, (m, v) => `飞往${v(m[1] ?? '')}：还剩 ${m[2]} 米`],
  [
    /^(flying|surveying): (\d+) m to go$/,
    (m) => `${m[1] === 'flying' ? '飞行中' : '勘察中'}：还剩 ${m[2]} 米`,
  ],
  [/^surveying the (.+): (\d+) things seen$/, (m, v) => `勘察${v(m[1] ?? '')}：已发现 ${m[2]} 处`],
  [/^descending onto the (.+)$/, (m, v) => `降落到${v(m[1] ?? '')}`],
  [/^gripping the sample container$/, () => '抓取样品容器'],
  [/^analyzing (.+)$/, (m) => `分析 ${m[1]}`],
  [
    /^(rolling|walking): leg (\d+) of (\d+)$/,
    (m) => `${m[1] === 'rolling' ? '滚动' : '步行'}：第 ${m[2]}/${m[3]} 段`,
  ],
  [/^unfolding into a wheel$/, () => '展开成轮子'],
  [/^folding up$/, () => '收拢'],
  [/^breaking off a sample of (.+)$/, (m) => `从 ${m[1]} 敲下样品`],
  [/^(stowing|deploying) the array$/, (m) => `${m[1] === 'stowing' ? '收起' : '展开'}太阳能板`],
  [/^cleaning: (\d+) % dust$/, (m) => `清洁中：积灰 ${m[1]}%`],
  [/^leg (\d+) of (\d+) done$/, (m) => `已走完第 ${m[1]}/${m[2]} 段`],
  [/^drilling (.+)$/, (m) => `钻取 ${m[1]}`],
  [
    /^walking (.+): leg (\d+) of (\d+)$/,
    (m) => `步行${PURPOSES_ZH[m[1] ?? ''] ?? ''}：第 ${m[2]}/${m[3]} 段`,
  ],
  [/^at the airlock, waiting for the outer door to open/, () => '在气闸外，等外舱门打开'],
  [/^in the airlock chamber, waiting for the outer door to open/, () => '在气闸舱里，等外舱门打开'],
  [/^they answer: "(.*)"$/, (m) => `回答：“${m[1]}”`],
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
