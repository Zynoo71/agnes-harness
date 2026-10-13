import type { MarsClock } from './clock.js'
import type { Decision } from './dm/watch.js'
import { EMOJI, progressLabel, toolLabel, valueLabel } from './labels.js'
import type { Director } from './live/director.js'
import { CATALOG, type EventKind, type Happening } from './live/events.js'
import { type Activity, type Alert, type Mail, type World, type WorldDevice, watchers } from './live/world.js'

export type Lang = 'en' | 'zh'

/** Hours the controls skip the clock to; 16:30 leaves half an hour to wait for dusk. */
const SKIPS = { morning: 7.6, noon: 12, afternoon: 16.5, dusk: 17.2, night: 22 } as const
type Skip = keyof typeof SKIPS

/** Every line the page shows, in English and Chinese. */
const TEXT = {
  en: {
    title: 'Agnes Base',
    subtitle: 'Jezero Crater, Mars · a test bed for LLM agents',
    morning: 'Morning',
    day: 'Day',
    dusk: 'Dusk',
    night: 'Night',
    sunset: (t: string) => `sunset in ${t}`,
    sunrise: (t: string) => `sunrise in ${t}`,
    earth: 'Earth link',
    open: (t: string) => `in view · ${t} left`,
    closed: (t: string) => `below horizon · ${t}`,
    wind: 'Wind',
    storm: { none: '', watch: 'storm watch', warning: 'STORM WARNING' } as Record<string, string>,
    next: (t: string) => `next event ${t}`,
    events: 'Events',
    language: '中文',
    reset: 'Reset',
    help: 'About',
    controls: 'Controls',
    earthHead: 'Mission Control · Earth',
    earthGot: 'received',
    earthFeed: 'a report reached Earth',
    earthFeedPhoto: (id: string) => `a report and ${id} reached Earth`,
    eventsHead: 'Events',
    timeHead: 'Skip to',
    conditionsHead: 'Conditions',
    askAgnes: 'Ask Agnes to handle it',
    askHarvest: 'Ask Agnes to harvest',
    asked: 'Told Agnes',
    noChat: 'Start a chat in Agnes first',
    ripe: (bed: string, crop: string) => `Greenhouse · the ${crop}es in the ${bed} bed are ripe`,
    harvestPrompt: (bed: string, crop: string) =>
      `The ${crop}es in the greenhouse's ${bed} bed are ripe. Harvest them and take them to the habitat pantry.`,
    alertPrompt: (dev: string, field: string, value: string) =>
      `${dev}: ${field} is critical (${value}). Deal with it.`,
    eventPrompt: (headline: string) => `${headline}. Deal with it.`,
    activity: 'Activity',
    activityEmpty: 'Calls, alerts and events show up here.',
    activityFold: 'Fold or unfold the activity list (A)',
    share: 'Decisions',
    spent: 'Time',
    think: 'think',
    act: 'act',
    dmSaw: 'read',
    dmChose: (n: number, s: string) => `${s} s · chose among ${n} actions`,
    dmAskLlm: 'Let the LLM decide',
    dmFailed: 'could not decide',
    stillRunning: 'still running',
    dmWaited: (s: string, what: string) => `waited ${s} s, ${what} did not happen`,
    nowBtn: 'Start one now',
    startBtn: 'Start',
    endBtn: 'End',
    applyBtn: 'Apply',
    nextIn: (t: string) => `Next on its own in ${t}`,
    hours: { morning: 'Morning', noon: 'Noon', afternoon: '16:30', dusk: 'Dusk', night: 'Night' } as Record<
      Skip,
      string
    >,
    params: { intensity: 'intensity', minutes: 'min', strength: 'dust %', area: '' } as Record<
      string,
      string
    >,
    areas: { 'west field': 'west field', 'east dunes': 'east dunes' } as Record<string, string>,
    going: 'Going on',
    nothing: 'nothing',
    untilHandled: 'until handled',
    by: 'by',
    done: 'done',
    error: 'failed',
    interrupted: 'interrupted',
    rejected: 'refused',
    alertWarn: 'warning',
    alertBad: 'alarm',
    cleared: 'back to normal',
    over: 'over',
    kinds: {
      dust_storm: 'Dust storm',
      suit_leak: 'Suit leak',
      dust_devil: 'Dust devil',
      meteorite: 'Meteorite',
      rockfall: 'Rockfall',
    } as Record<EventKind, string>,
    kindAbout: {
      dust_storm: 'Wind and dust build, then die down. Dark sky, dusty panels, no flying.',
      suit_leak: 'Oxygen goes ten times as fast; the astronaut cannot walk.',
      dust_devil: 'A whirlwind dusts the solar panels.',
      meteorite: 'A new unusual rock in the west field or the east dunes.',
      rockfall:
        'A boulder tumbles onto the way, ahead of the rover if it is driving. Monolith can push it aside.',
    } as Record<EventKind, string>,
    names: {} as Record<string, string>,
    fields: {} as Record<string, string>,
    already: (kind: string) => `a ${kind.toLowerCase()} is already happening`,
    notOnFoot: 'the astronaut is not out on foot',
    map: { title: 'base map · m', axes: 'x → east, y ↑ north' },
    views: {} as Record<string, string>,
    quality: {} as Record<string, string>,
    close: 'Close',
    helpBody: `
<h2>Agnes Base</h2>
<p>A small base on Mars, simulated in your browser. Its twelve devices (habitat, airlock, suit, rover, hopper, Monolith, lab, greenhouse, power, weather station, comms dish, base camera) each speak <b>MHS</b> to <b>AgnesHub</b>, the same way real hardware would. Agnes runs the base only through their tools, state and cameras, with two deciders: the <b class="by-llm">LLM</b>, which reads, plans and talks, and <b class="by-dm">Jev</b>, a fast decision model that takes the obvious next step on its own and hands everything else to the LLM.</p>
<p>The world moves on its own, so Agnes has to notice and act:</p>
<ul>
<li><b>Time.</b> A sol takes 40 minutes. The sun, the light, the solar output and the cold follow the clock; at night the batteries carry the base.</li>
<li><b>Drift.</b> Dust settles on the panels, the suit's oxygen runs down, a hopper away from its pad boils off propellant.</li>
<li><b>Controls</b> (<kbd>E</kbd>). Start an event (a dust storm, a suit leak, a dust devil, a meteorite, a rockfall) with the parameters you choose, end it, skip the clock to morning, noon, sunset or night, or bring about trouble: low suit oxygen, a low battery bank, dusty panels, a drop in cabin oxygen.</li>
</ul>
<h3>Ask Agnes</h3>
<ul>
<li>Mission Control would like a photo of a Martian sunset: take one and send it home.</li>
<li>Get the astronaut back inside before their oxygen runs low.</li>
<li>A storm is coming: secure the base.</li>
<li>Find the meteorite that just fell, bring a sample to the lab and send the result to Earth.</li>
</ul>
<h3>On this page</h3>
<ul>
<li>Tags over the devices show the tool each one runs, its progress and who called it: Jev in green with a bolt, the LLM in blue.</li>
<li>Bottom left, the activity list (<kbd>A</kbd> folds it): every call, alert and event since the page opened, with every decision of Jev; click a Jev line to see how it chose. Top: banners for what needs attention.</li>
<li>Keys: <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> views · <kbd>P</kbd> picture in picture · <kbd>E</kbd> controls · <kbd>A</kbd> activity · <kbd>L</kbd> tags · <kbd>M</kbd> map · <kbd>R</kbd> reset · <kbd>?</kbd> this card</li>
<li>Address: <code>?time=night</code>, <code>?sol=10</code> (minutes a sol takes), <code>?events=auto&amp;seed=7</code> (an event every few minutes on its own) or <code>off</code>, <code>?lang=zh</code></li>
</ul>`,
  },
  zh: {
    title: 'Agnes 基地',
    subtitle: '火星 · 杰泽罗陨石坑 · LLM 智能体的试验场',
    morning: '清晨',
    day: '白天',
    dusk: '黄昏',
    night: '夜晚',
    sunset: (t: string) => `${t} 后日落`,
    sunrise: (t: string) => `${t} 后日出`,
    earth: '对地通信',
    open: (t: string) => `可见 · 还剩 ${t}`,
    closed: (t: string) => `在地平线下 · ${t} 后升起`,
    wind: '风',
    storm: { none: '', watch: '沙尘暴关注', warning: '沙尘暴警报' } as Record<string, string>,
    next: (t: string) => `下个事件 ${t}`,
    events: '事件',
    language: 'EN',
    reset: '重置',
    help: '说明',
    controls: '控制台',
    earthHead: '地面控制中心 · 地球',
    earthGot: '收到',
    earthFeed: '一份报告到达地球',
    earthFeedPhoto: (id: string) => `一份报告和 ${id} 到达地球`,
    eventsHead: '事件',
    timeHead: '跳到',
    conditionsHead: '状况',
    askAgnes: '让 Agnes 处理',
    askHarvest: '让 Agnes 收获',
    asked: '已告诉 Agnes',
    noChat: '先在 Agnes 里开个对话',
    ripe: (bed: string, crop: string) => `温室 · ${bed}边苗床的${crop}熟了`,
    harvestPrompt: (bed: string, crop: string) => `温室${bed}边苗床的${crop}熟了，收下来送进栖息舱吧`,
    alertPrompt: (dev: string, field: string, value: string) =>
      `${dev}的${field}告急了（${value}），你处理一下`,
    eventPrompt: (headline: string) => `${headline}，你看着处理一下`,
    activity: '动态',
    activityEmpty: '设备调用、告警和事件会出现在这里。',
    activityFold: '收起或展开动态（A）',
    share: '决策占比',
    spent: '用时',
    think: '思考',
    act: '执行',
    dmSaw: '看了',
    dmChose: (n: number, s: string) => `${s} 秒 · 从 ${n} 个动作里选`,
    dmAskLlm: '让 LLM 来判断',
    dmFailed: '没能决定',
    stillRunning: '还在进行',
    dmWaited: (s: string, what: string) => `等了 ${s} 秒，没等到 ${what}`,
    nowBtn: '马上来一个',
    startBtn: '触发',
    endBtn: '结束',
    applyBtn: '设置',
    nextIn: (t: string) => `${t} 后自动来下一个`,
    hours: { morning: '清晨', noon: '正午', afternoon: '16:30', dusk: '黄昏', night: '夜里' } as Record<
      Skip,
      string
    >,
    params: { intensity: '强度', minutes: '分钟', strength: '积灰 %', area: '' } as Record<string, string>,
    areas: { 'west field': '西边野外', 'east dunes': '东边沙丘' } as Record<string, string>,
    going: '正在进行',
    nothing: '无',
    untilHandled: '直到处理完',
    by: '来自',
    done: '完成',
    error: '失败',
    interrupted: '中断',
    rejected: '拒绝',
    alertWarn: '告警',
    alertBad: '严重告警',
    cleared: '恢复正常',
    over: '结束',
    kinds: {
      dust_storm: '沙尘暴',
      suit_leak: '宇航服漏气',
      dust_devil: '尘卷风',
      meteorite: '陨石',
      rockfall: '落石',
    } as Record<EventKind, string>,
    kindAbout: {
      dust_storm: '风和沙尘升起又减弱：天变暗，太阳能板积灰，不能飞。',
      suit_leak: '氧气消耗快 10 倍，宇航员走不动。',
      dust_devil: '一股旋风给太阳能板蒙上灰。',
      meteorite: '西边野外或东边沙丘多出一块可疑岩石。',
      rockfall: '一块大石头滚到路上，火星车正在开时落在它前方。Monolith 能把它推开。',
    } as Record<EventKind, string>,
    names: {
      'habitat-01': '栖息舱',
      'airlock-01': '气闸',
      'suit-01': '宇航服',
      'rover-01': '火星车',
      'hopper-01': '飞行器',
      'monolith-01': 'Monolith',
      'lab-01': '实验室',
      'greenhouse-01': '温室',
      'power-01': '电力',
      'weather-01': '气象站',
      'comms-01': '通信天线',
      'cam-base': '基地相机',
    } as Record<string, string>,
    fields: {
      bank_temperature: '电池组温度',
      battery: '电量',
      battery_temperature: '电池温度',
      body_temperature: '体温',
      co2: 'CO₂',
      cpu: 'CPU',
      dust: '积灰',
      electronics_temperature: '电子设备温度',
      engine_temperature: '发动机温度',
      heart_rate: '心率',
      motor_temperature: '电机温度',
      o2: '氧气',
      o2_left: '剩余氧气',
      pressure: '气压',
      propellant: '推进剂',
      spo2: '血氧',
      storage: '存储',
      strength: '信号强度',
      tank_pressure: '储罐压力',
      temperature: '温度',
      wind: '风速',
    } as Record<string, string>,
    already: (kind: string) => `${kind}已经在进行`,
    notOnFoot: '宇航员不在舱外步行',
    map: { title: '基地地图 · 米', axes: 'x → 东，y ↑ 北' },
    views: {
      overview: '总览',
      dock: '停靠站和实验室',
      pad: '飞行器停机坪',
      airlock: '气闸',
      field: '野外作业点',
      power: '电力',
      flag: 'Agnes 旗帜',
      comms: '通信和气象',
      hopper: '跟随飞行器',
      monolith: '跟随 Monolith',
      rover: '跟随火星车',
      suit: '跟随宇航员',
    } as Record<string, string>,
    quality: { balanced: '均衡', high: '高画质', low: '低画质' } as Record<string, string>,
    close: '关闭',
    helpBody: `
<h2>Agnes 基地</h2>
<p>一座在浏览器里模拟的火星小基地。十二台设备（栖息舱、气闸、宇航服、火星车、飞行器、Monolith、实验室、温室、电力、气象站、通信天线、基地相机）都像真实硬件一样，用 <b>MHS</b> 连到 <b>AgnesHub</b>。Agnes 只通过它们的工具、状态和相机来管理基地，由两个角色做决定：<b class="by-llm">LLM</b> 负责读、规划和沟通；<b class="by-dm">Jev</b> 是快速的决策模型，明摆着的下一步自己直接做，其余都交给 LLM。</p>
<p>世界自己会变，Agnes 得自己发现、自己处理：</p>
<ul>
<li><b>时间。</b>一个火星日 40 分钟。太阳、光照、发电量和气温都跟着时钟走；夜里靠电池撑着。</li>
<li><b>漂移。</b>太阳能板慢慢积灰，宇航服的氧气一直在减少，离开停机坪的飞行器推进剂会蒸发。</li>
<li><b>控制台</b>（<kbd>E</kbd>）。按自己选的参数触发事件（沙尘暴、宇航服漏气、尘卷风、陨石、落石）或提前结束；把时钟跳到清晨、正午、日落或夜里；制造状况：宇航服氧气不足、储能电池电量低、太阳能板积灰、舱内氧气骤降。</li>
</ul>
<h3>可以让 Agnes 做</h3>
<ul>
<li>地面控制中心想要一张火星日落的照片：拍下来发回地球。</li>
<li>在氧气见底之前把宇航员接回舱里。</li>
<li>沙尘暴要来了：把基地收拾好。</li>
<li>找到刚落下的陨石，把样品送到实验室，再把结果发回地球。</li>
</ul>
<h3>页面上</h3>
<ul>
<li>设备上方的标签显示它正在执行的工具、进度和调用者：Jev 是绿色带闪电，LLM 是蓝色。</li>
<li>左下角的动态列表（<kbd>A</kbd> 收起）记着页面打开以来的每次调用、告警和事件，Jev 的每次决定也在其中；点 Jev 的那一行看它怎么选的。顶部横幅提示需要注意的事。</li>
<li>按键：<kbd>1</kbd>–<kbd>9</kbd>、<kbd>0</kbd> 视角 · <kbd>P</kbd> 画中画 · <kbd>E</kbd> 控制台 · <kbd>A</kbd> 动态 · <kbd>L</kbd> 标签 · <kbd>M</kbd> 地图 · <kbd>R</kbd> 重置 · <kbd>?</kbd> 本说明</li>
<li>地址参数：<code>?time=night</code>、<code>?sol=10</code>（一个火星日的分钟数）、<code>?events=auto&amp;seed=7</code>（每隔几分钟自动来一个事件）或 <code>off</code>、<code>?lang=en</code></li>
</ul>`,
  },
}

/** m:ss, or h:mm:ss past an hour. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}
/** A span holding other nodes. */
const span = (className: string, ...children: (Node | string)[]) => {
  const e = el('span', className)
  e.append(...children)
  return e
}
/** The first sentence of a text, at most 90 characters. */
const clipped = (text: string) => {
  const first = text.split(/\. /)[0] ?? text
  return first.length > 90 ? `${first.slice(0, 90)}…` : first
}

interface Tag {
  el: HTMLElement
  id: string
  name: string
}

interface Live {
  devices: WorldDevice[]
  world: World
  director: Director
}

/** The activity list keeps this many items, the oldest going first. */
const KEEP_LINES = 300

/** An item of the activity list: a call, an alert, an event or a step the DM left to the LLM, drawn again when the language changes. */
interface Line {
  el: HTMLElement
  draw(): void
}

/**
 * Everything drawn over the scene besides the tags' places: the brand, the bar along the bottom
 * (Mars time, the Earth link, the weather, events), the activity list, the banners, the events
 * panel and the About card, in English or Chinese. It refreshes four times a second, apart from
 * the frames.
 */
export function buildOverlay(options: {
  clock: MarsClock
  live: Live | undefined
  tags: Tag[]
  eventsMode: 'auto' | 'manual' | 'off'
  lang: Lang
  showHelp: boolean
  /** The DM's decisions from AgnesHub, newest first; the panel shows once there is one. */
  dm?: { decisions(): Decision[]; version(): number }
  /** Posts the person's words into their conversation with Agnes; resolves whether it was posted. */
  say?: (text: string) => Promise<boolean>
}): {
  stats(text: string): void
  toggleEvents(): void
  toggleFeed(): void
  toggleHelp(): void
  lang(): Lang
  view(name: string, label: string): string
  quality(name: string): string
  mapWords(): { title: string; axes: string }
  /** A device's name and a tool's, in the language of the moment, for the picture in picture. */
  deviceName(id: string): string
  toolName(tool: string): string
  eventName(kind: EventKind): string
} {
  const { clock, live, tags } = options
  let lang: Lang = options.lang
  const t = () => TEXT[lang]
  // Who made a call: the DM (green, a bolt) or the LLM (blue, a speech bubble); anyone else by name.
  const BOLT =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5L3.5 9h4l-1 5.5 6-7.5h-4z" fill="currentColor"/></svg>'
  const BUBBLE =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h11v7.5H7l-3.5 3v-3h-1z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
  const byOf = (caller: string | undefined) => (caller === 'DM' ? 'dm' : caller === 'LLM' ? 'llm' : undefined)
  const chip = (caller: string, extra = '') => {
    const by = byOf(caller)
    if (!by) return el('span', 'who', `← ${caller}`)
    const c = el('span', `who ${by}`)
    c.innerHTML = by === 'dm' ? BOLT : BUBBLE
    c.append(by === 'dm' ? 'Jev' : caller)
    if (extra) c.append(el('span', 'p', extra))
    return c
  }
  // The DM's decision behind a call it made: the `did` for the same device and tool nearest the call.
  const dmBehind = (a: Activity) => {
    const startedAt = Date.now() - (performance.now() - a.started)
    const gap = (d: Decision) => Math.abs(d.time * 1000 - startedAt)
    return dm
      ?.decisions()
      .filter((d) => d.outcome === 'did' && d.device === a.device && d.choice.split(' ')[1] === a.tool)
      .filter((d) => gap(d) < 15_000)
      .sort((x, y) => gap(x) - gap(y))[0]
  }
  const name = (id: string, fallback = id) => t().names[id] ?? fallback
  const fieldName = (field: string) => t().fields[field] ?? field.replaceAll('_', ' ')
  const value = (v: string) => valueLabel(lang, v, (id) => name(id))
  /** A device's name in the activity list, after its emoji. */
  const devEl = (id: string, label = name(id)) => {
    const b = el('b', 'dev')
    b.append(el('span', 'emo', EMOJI[id] ?? '•'), label)
    return b
  }
  /** A tool's name for people, its id on hover. */
  const tool = (id: string) => {
    const e = el('span', 'tool', toolLabel(lang, id))
    e.title = id
    return e
  }

  const brand = document.getElementById('brand') as HTMLElement
  const bar = document.getElementById('bar') as HTMLElement
  const banners = document.getElementById('banners') as HTMLElement
  const feed = document.getElementById('feed') as HTMLElement
  const panel = document.getElementById('events-panel') as HTMLElement
  const help = document.getElementById('help') as HTMLElement
  const earth = document.getElementById('earth') as HTMLElement
  const status = document.getElementById('status') as HTMLElement
  const field = (id: string) => bar.querySelector(`#${id}`) as HTMLElement
  const buttons = {
    events: document.getElementById('events-toggle') as HTMLButtonElement,
    lang: document.getElementById('lang') as HTMLButtonElement,
    help: document.getElementById('help-toggle') as HTMLButtonElement,
    reset: document.getElementById('reset') as HTMLButtonElement,
  }
  const dm = options.dm
  buttons.events.hidden = !live || options.eventsMode === 'off'

  // The tags: a line under the name for the call a device runs, with a progress bar.
  const tagParts = tags.map((tag) => {
    const act = el('div', 'act')
    const tool = el('i')
    const who = el('em')
    const meter = el('div', 'meter')
    const fill = el('div')
    meter.appendChild(fill)
    act.append(tool, who, meter)
    act.hidden = true
    tag.el.appendChild(act)
    return {
      ...tag,
      act,
      tool,
      who,
      fill,
      caller: undefined as string | undefined,
      title: tag.el.querySelector('b') as HTMLElement,
    }
  })

  // The activity list: the latest eight items, the newest at the bottom, under a line that counts
  // who took the steps. Each item keeps the Mars time it was written at and draws its words in the
  // language of the moment. An item the DM decided opens to show how: the newest for a few seconds,
  // any of them on a click.
  const lines: Line[] = []
  // On top, the list's name, how many items it holds and a button (or A) to fold it away; then the
  // share rows; then the items, all of them since the page opened, scrolling.
  const feedTop = el('div', 'top')
  const feedTitle = el('b')
  const feedCount = el('span', 'count')
  const feedFold = el('button', 'fold')
  feedFold.type = 'button'
  feedTop.append(feedTitle, feedCount, feedFold)
  const head = el('div', 'head')
  head.hidden = true
  const list = el('div', 'list')
  const empty = el('div', 'empty')
  list.append(empty)
  feed.append(feedTop, head, list)
  let folded = false
  const drawFeedTop = () => {
    feedTitle.textContent = t().activity
    feedCount.textContent = lines.length ? String(lines.length) : ''
    feedFold.textContent = folded ? '▸' : '▾'
    feedFold.title = t().activityFold
    empty.textContent = t().activityEmpty
    empty.hidden = lines.length > 0
    feed.classList.toggle('folded', folded)
  }
  const atEnd = () => list.scrollHeight - list.scrollTop - list.clientHeight < 8
  const toggleFeed = () => {
    folded = !folded
    drawFeedTop()
    if (!folded) list.scrollTop = list.scrollHeight
  }
  feedFold.addEventListener('click', toggleFeed)
  drawFeedTop()
  /** The DM's newest decision, open in the list until `until`. */
  let fresh: { d: Decision; until: number } | undefined
  const time = () =>
    clock
      .label()
      .replace(/^Sol \d+ · /, '')
      .replace(' LMST', '')
  /** A span of time, short: 6.2 s, 45 s, 2m 05s. */
  const dur = (ms: number) => {
    const s = ms / 1000
    if (s < 9.95) return `${s.toFixed(1)} s`
    if (s < 59.5) return `${Math.round(s)} s`
    const whole = Math.round(s)
    return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
  }
  /** A word in a chip like the callers', for the two kinds of time. */
  const kindChip = (word: string, kind: string) => el('span', `who ${kind}`, word)
  /** An element holding `children`. */
  const box = (className: string, ...children: (string | HTMLElement)[]) => {
    const b = el('span', className)
    b.append(...children)
    return b
  }
  /** A bar split in two by `a` and `b`. */
  const split = (a: number, b: number, kinds: [string, string]) => {
    const bar = el('span', 'split')
    for (const [k, n] of [
      [kinds[0], a],
      [kinds[1], b],
    ] as const) {
      const part = el('i', k)
      part.style.flexGrow = String(n)
      bar.append(part)
    }
    return bar
  }
  /** Since the page opened: the device actions the DM and the LLM took, and the time spent deciding and acting. */
  const steps = { dm: 0, llm: 0 }
  const spent = { think: 0, act: 0 }
  // Above the list, two rows alike: who decided the device actions so far, the DM or the LLM; and
  // how long deciding them took against how long the devices took to carry them out.
  const drawHead = () => {
    const { dm: dmSteps, llm: llmSteps } = steps
    const all = dmSteps + llmSteps
    head.hidden = all === 0
    if (head.hidden) return
    const rows: HTMLElement[] = []
    if (dmSteps > 0 || (dm?.decisions().length ?? 0) > 0) {
      const dmShare = Math.round((dmSteps / all) * 100)
      rows.push(
        el('span', 'label', t().share),
        box('left', chip('DM'), el('b', '', `${dmShare}%`)),
        split(dmSteps, llmSteps, ['dm', 'llm']),
        box('right', el('b', '', `${100 - dmShare}%`), chip('LLM')),
      )
    }
    if (spent.think + spent.act > 0)
      rows.push(
        el('span', 'label', t().spent),
        box('left', kindChip(t().think, 'think'), el('b', '', dur(spent.think))),
        split(spent.think, spent.act, ['think', 'act']),
        box('right', el('b', '', dur(spent.act)), kindChip(t().act, 'act')),
      )
    head.replaceChildren(...rows)
  }
  const push = (
    kind: () => string,
    parts: () => (string | HTMLElement)[],
    decision?: () => Decision | undefined,
  ): (() => void) => {
    const item = el('div', 'item')
    const line = el('div')
    const when = time()
    /** Opened or closed by a click; until then it follows `fresh`. */
    let clicked: boolean | undefined
    const draw = () => {
      const d = decision?.()
      const open = d !== undefined && (clicked ?? (fresh?.d === d && performance.now() < fresh.until))
      item.className = `item${open ? ' open' : ''}`
      line.className = `line ${kind()}${d ? ' can-open' : ''}`
      line.replaceChildren(
        el('span', 'when', when),
        ...parts().map((p) => (typeof p === 'string' ? el('span', '', p) : p)),
        // Every line keeps the caret's room, so the time columns line up.
        el('span', 'caret', d ? (open ? '▾' : '▸') : ''),
      )
      // A line that grows (a decision opening) keeps the list at its end when it was there.
      const stick = atEnd()
      item.replaceChildren(line, ...(open && d ? [decisionCard(d)] : []))
      if (stick) list.scrollTop = list.scrollHeight
    }
    line.addEventListener('click', () => {
      if (!decision?.()) return
      clicked = !item.classList.contains('open')
      draw()
    })
    const stick = atEnd()
    list.appendChild(item)
    draw()
    lines.push({ el: item, draw })
    while (lines.length > KEEP_LINES) lines.shift()?.el.remove()
    if (stick) list.scrollTop = list.scrollHeight
    drawFeedTop()
    drawHead()
    return draw
  }
  const statusWord = (a: Activity) =>
    a.status === 'error' ? t().error : a.status === 'rejected' ? t().rejected : t().interrupted
  const callText = (a: Activity) =>
    a.status
      ? a.status === 'done'
        ? `✓ ${t().done}`
        : `✗ ${statusWord(a)} · ${a.reason}${a.status === 'rejected' ? `: ${a.detail}` : ''}`
      : a.progress?.text
        ? `… ${progressLabel(lang, a.progress.text)}`
        : '…'
  const callLine = (a: Activity) => {
    const by = byOf(a.caller)
    if (by) steps[by]++
    if (by && a.think !== undefined) spent.think += a.think
    const behind = () => (a.caller === 'DM' ? dmBehind(a) : undefined)
    const draw = push(
      () => `call ${a.status ?? 'running'} by-${byOf(a.caller) ?? 'other'}`,
      () => {
        const d = behind()
        return [
          ...(a.caller ? [chip(a.caller, d ? `${Math.round(d.sure * 100)}%` : '')] : []),
          devEl(a.device),
          tool(a.tool),
          el('span', 'state', callText(a)),
          // How long it was thought over, then how long the device took: aligned columns.
          box('time', ...(a.think === undefined ? [] : [el('i', '', t().think), dur(a.think)])),
          box('time', ...(a.ended === undefined ? [] : [el('i', '', t().act), dur(a.ended - a.started)])),
        ]
      },
      behind,
    )
    return draw
  }
  const lineFor = new Map<Activity, () => void>()
  /** Each device's last ended call, to tell what a result the DM saw was about. */
  const lastEnded = new Map<string, Activity>()

  // Banners along the top: severe events and alarms stay while they last, the rest a few seconds.
  // With `ask`, a button tells Agnes about it in the person's words: nothing wakes Agnes by itself.
  // Such a banner stays until what it tells of is over, or else until the person presses its button
  // or closes it.
  const banner = (
    key: string,
    level: 'info' | 'warn' | 'bad' | 'dm',
    text: () => string,
    until?: () => boolean,
    head?: HTMLElement,
    ask?: { label: () => string; prompt: () => string },
  ) => {
    banners.querySelector(`[data-key="${key}"]`)?.remove()
    const b = el('div', `banner ${level}`)
    b.dataset.key = key
    const label = el('span', 'text')
    const left = el('span', 'left')
    if (head) b.append(head)
    b.append(label, left)
    const say = options.say
    let button: HTMLButtonElement | undefined
    let toldAt: number | undefined
    if (ask && say) {
      const btn = el('button', 'ask')
      btn.type = 'button'
      btn.addEventListener('click', async () => {
        btn.disabled = true
        const told = await say(ask.prompt())
        btn.textContent = told ? t().asked : t().noChat
        if (told) toldAt = performance.now()
        else setTimeout(() => (btn.disabled = false), 3000)
      })
      const close = el('button', 'dismiss', '×')
      close.type = 'button'
      close.addEventListener('click', () => b.remove())
      b.append(btn, close)
      button = btn
    }
    banners.appendChild(b)
    const started = performance.now()
    const refresh = () => {
      label.textContent = text()
      if (button && !button.disabled && ask) button.textContent = ask.label()
      const now = performance.now()
      const over = until
        ? until()
        : button
          ? toldAt !== undefined && now - toldAt > 4000
          : now - started > 8000
      if (over) b.remove()
    }
    refresh()
    shown.set(b, refresh)
  }
  const shown = new Map<HTMLElement, () => void>()

  if (live) {
    watchers.activity.push((a) => {
      const draw = lineFor.get(a)
      if (draw) draw()
      else lineFor.set(a, callLine(a))
      if (a.status) {
        if (byOf(a.caller) && a.ended !== undefined) {
          spent.act += a.ended - a.started
          drawHead()
        }
        lineFor.delete(a)
        lastEnded.set(a.device, a)
        if (a.status === 'error' || a.status === 'rejected')
          banner(
            `fail-${a.device}`,
            'bad',
            () =>
              `${name(a.device)} ${toolLabel(lang, a.tool)}: ${statusWord(a)} · ${a.reason} — ${(a.detail ?? '').slice(0, 90)}`,
          )
      }
    })
    watchers.alert.push((a: Alert, raised: boolean) => {
      push(
        () => `alert ${raised ? a.level : 'ok'}`,
        () => [
          devEl(a.device),
          el('span', '', `${fieldName(a.field)} ${a.value}${a.unit ? ` ${a.unit}` : ''}`),
          el('span', 'state', raised ? (a.level === 'bad' ? t().alertBad : t().alertWarn) : t().cleared),
        ],
      )
      if (raised && a.level === 'bad') {
        const dev = live.devices.find((d) => d.id === a.device)
        banner(
          `alert-${a.device}-${a.field}`,
          'bad',
          () => `${name(a.device)} · ${fieldName(a.field)} ${t().alertBad}`,
          () => dev?.alerts.get(a.field)?.level !== 'bad',
          undefined,
          {
            label: () => t().askAgnes,
            prompt: () =>
              t().alertPrompt(name(a.device), fieldName(a.field), `${a.value}${a.unit ? ` ${a.unit}` : ''}`),
          },
        )
      }
    })
    // A ripe bed stays on a banner until it is harvested.
    live.world.ripeListeners.push((bed, crop) =>
      banner(
        `ripe-${bed}`,
        'info',
        () => t().ripe(value(bed), value(crop)),
        () => live.world.beds[bed].growth < 1,
        undefined,
        { label: () => t().askHarvest, prompt: () => t().harvestPrompt(value(bed), value(crop)) },
      ),
    )
    // What reached Earth: a card with the photo, the report and Mission Control's answer.
    live.world.mailListeners.push((m: Mail) => {
      lastMail = m
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      photoUrl = m.photo
        ? URL.createObjectURL(new Blob([m.photo.jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
        : undefined
      drawMail()
      earth.hidden = false
      push(
        () => 'event start',
        () => [devEl('comms-01'), el('span', '', m.photo ? t().earthFeedPhoto(m.photo.id) : t().earthFeed)],
      )
    })
    live.world.events?.listeners.push((h: Happening, phase) => {
      // Short events (a meteorite's fall, a dust devil) just happen; storms and leaks also end.
      if (phase === 'start' || CATALOG[h.kind].severe)
        push(
          () => `event ${phase}`,
          () => [
            devEl(h.kind, t().kinds[h.kind]),
            el('span', '', phase === 'start' ? h.headline[lang] : t().over),
          ],
        )
      if (phase === 'start') {
        const severe = CATALOG[h.kind].severe
        banner(
          `event-${h.id}`,
          severe ? 'warn' : 'info',
          () => {
            const left = live.world.events?.remaining(h)
            return `${t().kinds[h.kind]} · ${h.headline[lang]}${severe ? ` · ${left === undefined ? t().untilHandled : clockTime(left)}` : ''}`
          },
          severe ? () => !live.world.events?.active.includes(h) : undefined,
          undefined,
          { label: () => t().askAgnes, prompt: () => t().eventPrompt(h.headline[lang]) },
        )
      }
    })
  }

  // The controls panel: events with their parameters (End while one runs), the clock, and trouble
  // the devices offer; with ?events=auto, when the next event comes on its own.
  const panelHead = el('div', 'head')
  const panelNext = el('div', 'next')
  const nowButton = el('button', 'small')
  nowButton.type = 'button'
  nowButton.addEventListener('click', () => live?.director.next())
  panelNext.append(el('span'), nowButton)
  panelNext.hidden = options.eventsMode !== 'auto'
  const panelActive = el('div', 'active')
  const section = () => el('div', 'section')
  const eventsHead = section()
  const panelList = el('div', 'list')
  const startButtons = (Object.keys(CATALOG) as EventKind[]).map((kind) => {
    const item = el('div', 'item')
    const text = el('div')
    const title = el('b')
    const about = el('span')
    text.append(title, about)
    // A choice per parameter: the ends and the middle of a number's range, or each of a list.
    const choices = Object.entries(CATALOG[kind].params as Record<string, readonly (number | string)[]>).map(
      ([param, range]) => {
        const select = el('select')
        const values =
          typeof range[0] === 'number'
            ? [range[0] as number, ((range[0] as number) + (range[1] as number)) / 2, range[1] as number].map(
                // Whole numbers stay whole: 3, 6, 8 minutes.
                (n) => (Number.isInteger(range[0]) ? Math.round(n) : Math.round(n * 100) / 100),
              )
            : range
        for (const v of values) select.appendChild(el('option', '', String(v)))
        select.selectedIndex = typeof range[0] === 'number' ? 1 : 0
        return { param, select, values, unit: el('span') }
      },
    )
    const controls = el('div', 'controls')
    for (const c of choices) {
      const label = el('label')
      label.append(c.unit, c.select)
      controls.appendChild(label)
    }
    const go = el('button', 'small')
    go.type = 'button'
    controls.appendChild(go)
    go.addEventListener('click', () => {
      const running = live?.world.events?.active.find((h) => h.kind === kind)
      if (running) {
        live?.world.events?.end(running)
        return
      }
      const given = Object.fromEntries(choices.map((c) => [c.param, c.values[c.select.selectedIndex]]))
      const why = live?.director.start(kind, given)
      if (why)
        push(
          () => 'alert warn',
          () => [
            devEl(kind, t().kinds[kind]),
            el('span', '', why.endsWith('already happening') ? t().already(t().kinds[kind]) : t().notOnFoot),
          ],
        )
    })
    text.appendChild(controls)
    item.append(text)
    panelList.appendChild(item)
    return { kind, title, about, go, choices }
  })
  const timeHead = section()
  const timeRow = el('div', 'row')
  const hourButtons = (Object.keys(SKIPS) as Skip[]).map((name) => {
    const b = el('button', 'small')
    b.type = 'button'
    b.addEventListener('click', () => clock.skipTo(SKIPS[name]))
    timeRow.appendChild(b)
    return { name, b }
  })
  const conditionsHead = section()
  const conditionList = el('div', 'list')
  const conditionButtons = (live?.world.conditions ?? []).map((c) => {
    const item = el('div', 'item')
    const text = el('div')
    const title = el('b')
    text.append(title, el('span', '', c.device))
    const b = el('button', 'small')
    b.type = 'button'
    b.addEventListener('click', () => {
      c.apply()
      push(
        () => 'event info',
        () => [devEl(c.device), el('span', '', c[lang])],
      )
    })
    item.append(text, b)
    conditionList.appendChild(item)
    return { c, title, b }
  })
  panel.append(
    panelHead,
    panelNext,
    panelActive,
    eventsHead,
    panelList,
    timeHead,
    timeRow,
    conditionsHead,
    conditionList,
  )

  let lastMail: Mail | undefined
  let photoUrl: string | undefined
  const drawMail = () => {
    const m = lastMail
    if (!m) return
    const close = el('button', 'close', '×')
    close.type = 'button'
    close.addEventListener('click', () => {
      earth.hidden = true
    })
    const head = el('div', 'head')
    head.append(
      el('b', '', t().earthHead),
      el('span', '', `${t().earthGot} ${m.at.replace(' LMST', '')}`),
      close,
    )
    const parts: HTMLElement[] = [head]
    if (photoUrl) {
      const img = el('img')
      img.src = photoUrl
      parts.push(img)
    }
    parts.push(el('p', 'report', m.report.length > 280 ? `${m.report.slice(0, 280)}…` : m.report))
    parts.push(el('p', 'reply', m.reply[lang]))
    earth.replaceChildren(...parts)
  }

  const closeHelp = el('button', 'close')
  closeHelp.type = 'button'
  closeHelp.addEventListener('click', () => {
    help.hidden = true
  })
  const helpBody = el('div', 'body')
  help.append(helpBody, closeHelp)
  help.hidden = !options.showHelp

  /** Texts that change only with the language. */
  const relabel = () => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    ;(brand.querySelector('h1') as HTMLElement).textContent = t().title
    ;(brand.querySelector('p') as HTMLElement).textContent = t().subtitle
    buttons.events.textContent = t().controls
    buttons.lang.textContent = t().language
    buttons.help.textContent = '?'
    buttons.help.title = t().help
    buttons.reset.textContent = t().reset
    drawHead()
    panelHead.textContent = t().controls
    nowButton.textContent = t().nowBtn
    eventsHead.textContent = t().eventsHead
    timeHead.textContent = t().timeHead
    conditionsHead.textContent = t().conditionsHead
    for (const b of startButtons) {
      b.title.textContent = t().kinds[b.kind]
      b.about.textContent = t().kindAbout[b.kind]
      for (const c of b.choices) {
        c.unit.textContent = t().params[c.param] ?? c.param
        c.values.forEach((v, i) => {
          ;(c.select.options[i] as HTMLOptionElement).textContent =
            typeof v === 'string' ? (t().areas[v] ?? v) : String(v)
        })
      }
    }
    for (const h of hourButtons) h.b.textContent = t().hours[h.name]
    for (const c of conditionButtons) {
      c.title.textContent = c.c[lang]
      c.b.textContent = t().applyBtn
    }
    helpBody.innerHTML = t().helpBody
    closeHelp.textContent = t().close
    for (const tag of tagParts) tag.title.textContent = name(tag.id, tag.name)
    for (const line of lines) line.draw()
    drawFeedTop()
    drawMail()
  }

  // The DM's decisions: a step it left to the LLM gets an item of its own, under the result it read;
  // a step it took is the call's own item. Either opens to show how it chose.
  let dmVersion = -1
  const dmSeen = new WeakSet<Decision>()
  /** The call whose result a decision read, as it stood when the decision came. */
  const saw = new WeakMap<Decision, Activity>()
  const handLine = (d: Decision) => {
    const sure = d.top[0] ? `${Math.round(d.sure * 100)}%` : ''
    push(
      () => 'hand',
      () => {
        const why = el('span', 'why')
        if (d.outcome === 'error') why.append(`${t().dmFailed}: `)
        why.append(triggerParts(d.trigger[0] ?? '', saw.get(d)))
        return [chip('DM', sure), el('span', 'arrow', '→'), chip('LLM'), why]
      },
      () => d,
    )
  }
  /** An option as people read it: device, tool and values; asking the LLM looks like the LLM's. */
  const optionName = (option: string): HTMLElement => {
    if (option === 'ask_llm') {
      const e = el('span', 'ask')
      e.innerHTML = BUBBLE
      e.append(t().dmAskLlm)
      return e
    }
    const [device = '', verb = '', ...args] = option.split(' ')
    const pairs = args
      .join(' ')
      .split(/ (?=\w+=)/)
      .filter(Boolean)
    const values = pairs.map((p) => p.split('='))
    const text =
      verb === 'set'
        ? `${name(device)} ${values.map(([k = '', v = '']) => `${fieldName(k)} → ${value(v)}`).join(', ')}`
        : `${name(device)} ${toolLabel(lang, verb)}${values.length ? ` · ${values.map(([, v = '']) => value(v)).join(', ')}` : ''}`
    const e = el('span', '', text)
    e.title = option
    return e
  }
  /** One line of what the DM saw, short: the device, then what its call or watch came to. */
  const triggerParts = (line: string, seen?: Activity): HTMLElement => {
    const e = el('span', 'said')
    e.title = line
    const m = line.match(/^([\w-]+): (.*)$/s)
    if (!m) {
      e.textContent = clipped(line)
      return e
    }
    const [, device = '', rest = ''] = m
    const took = rest.match(/Took (\d+) s\./)
    const a = seen ?? lastEnded.get(device)
    const changed = rest.match(/^(\w+) changed from (\S+) to (\S+)/)
    const waited = rest.match(/^waited (\d+) s and (.+?) did not happen/)
    const running = rest.match(/^(\w+) is still running/)
    const what = (w: string) =>
      w.replace(/(\w+) = (\S+)/g, (_, k: string, v: string) => `${fieldName(k)} = ${value(v)}`)
    const text =
      took && a
        ? `${toolLabel(lang, a.tool)} ${a.status === 'done' ? `✓ ${t().done}` : `✗ ${statusWord(a)}`} · ${took[1]} s`
        : changed
          ? `${fieldName(changed[1] ?? '')} ${value(changed[2] ?? '')} → ${value(changed[3] ?? '')}`
          : waited
            ? t().dmWaited(waited[1] ?? '', what(waited[2] ?? ''))
            : running
              ? `${toolLabel(lang, running[1] ?? '')} … ${t().stillRunning}`
              : clipped(rest)
    e.append(devEl(device), ` ${text}`)
    return e
  }
  /** How the DM chose: the result it read, how long it took among how many actions, the likeliest four. */
  const decisionCard = (d: Decision) => {
    const card = el('div', 'decision')
    const meta = el('div', 'meta')
    meta.append(
      span('said', `${t().dmSaw} `, triggerParts(d.trigger[0] ?? '', saw.get(d))),
      el('span', '', d.error ?? t().dmChose(d.options, (d.ms / 1000).toFixed(1))),
    )
    card.append(meta)
    d.top.slice(0, 4).forEach(([option, p], i) => {
      const row = el('div', `option${i === 0 ? ' chosen' : ''}`)
      const fill = el('i')
      fill.style.width = `${Math.max(1, Math.round(p * 100))}%`
      row.append(fill, span('', optionName(option)), el('b', '', `${Math.round(p * 100)}%`))
      card.append(row)
    })
    return card
  }
  const drawDm = () => {
    if (!dm || dm.version() === dmVersion) return
    dmVersion = dm.version()
    for (const d of [...dm.decisions()].reverse()) {
      if (dmSeen.has(d)) continue
      dmSeen.add(d)
      const read = lastEnded.get(d.trigger[0]?.match(/^([\w-]+):/)?.[1] ?? '')
      if (read) saw.set(d, read)
      fresh = { d, until: performance.now() + 15000 }
      if (d.outcome !== 'did') handLine(d)
    }
    for (const line of lines) line.draw()
  }

  const refresh = () => {
    drawDm()
    if (fresh && performance.now() >= fresh.until) {
      fresh = undefined
      for (const line of lines) line.draw()
    }
    const now = performance.now()
    const hour = clock.hour(now)
    const part = hour < 6 || hour >= 19 ? t().night : hour < 9 ? t().morning : hour < 17 ? t().day : t().dusk
    const up = hour >= 6 && hour < 18
    const turn = clock.secondsUntil(up ? 18 : 6, now)
    field('clock').textContent = clock.label(now)
    field('daylight').textContent = Number.isFinite(turn)
      ? `${part} · ${up ? t().sunset(clockTime(turn)) : t().sunrise(clockTime(turn))}`
      : part
    if (live) {
      const w = live.world.weather
      const storm = t().storm[w.storm] ?? ''
      const weather = field('weather')
      weather.textContent = `${t().wind} ${w.wind} m/s · τ ${w.dust.toFixed(2)}${storm ? ` · ${storm}` : ''}`
      weather.className = w.storm === 'warning' ? 'bad' : w.storm === 'watch' ? 'warn' : ''
      const earth = live.world.earthWindow?.()
      if (earth) {
        const left = clockTime(earth.changes - Date.now() / 1000)
        field('earth').textContent = `${t().earth} · ${earth.open ? t().open(left) : t().closed(left)}`
        field('earth').className = earth.open ? 'ok' : ''
      }
      const d = live.director
      const next = d.nextAt === undefined ? undefined : (d.nextAt - now) / 1000
      field('happening').textContent =
        options.eventsMode === 'auto' && next !== undefined ? t().next(clockTime(next)) : ''
      // The panel, while it is open.
      if (!panel.hidden) {
        ;(panelNext.firstChild as HTMLElement).textContent =
          next !== undefined ? t().nextIn(clockTime(next)) : ''
        const active = live.world.events?.active ?? []
        panelActive.textContent = `${t().going}: ${
          active.length
            ? active
                .map((h) => {
                  const left = live.world.events?.remaining(h)
                  return `${t().kinds[h.kind]} ${left === undefined ? `(${t().untilHandled})` : clockTime(left)}`
                })
                .join(' · ')
            : t().nothing
        }`
        for (const b of startButtons) {
          const running = active.some((h) => h.kind === b.kind)
          b.go.textContent = running ? t().endBtn : t().startBtn
          b.go.classList.toggle('on', running)
          for (const c of b.choices) c.select.disabled = running
        }
      }
    }
    // Tags: the call each device runs, and the device's colour: busy, warning, alarm, failed.
    for (const tag of tagParts) {
      const dev = live?.devices.find((d) => d.id === tag.id)
      const a = dev?.current
      tag.act.hidden = !a
      if (a) {
        tag.tool.textContent = toolLabel(lang, a.tool)
        tag.tool.title = a.tool
        if (tag.caller !== a.caller) {
          tag.caller = a.caller
          tag.who.replaceChildren(...(a.caller ? [chip(a.caller)] : []))
        }
        const p = a.progress
        const k = p?.total ? Math.min(1, (p.done ?? 0) / p.total) : undefined
        tag.fill.style.width = k === undefined ? '100%' : `${Math.round(k * 100)}%`
        tag.fill.className = k === undefined ? 'busy' : ''
      }
      const levels = dev ? [...dev.alerts.values()].map((x) => x.level) : []
      const failed =
        (dev?.last?.status === 'error' || dev?.last?.status === 'rejected') &&
        now - (dev.last.ended ?? 0) < 8000
      tag.el.classList.toggle('busy', Boolean(a))
      tag.el.classList.toggle('by-dm', a?.caller === 'DM')
      tag.el.classList.toggle('by-llm', a?.caller === 'LLM')
      tag.el.classList.toggle('warn', levels.includes('warn') && !levels.includes('bad'))
      tag.el.classList.toggle('bad', levels.includes('bad') || failed)
    }
    for (const [b, update] of shown) {
      update()
      if (!b.isConnected) shown.delete(b)
    }
  }

  relabel()
  refresh()
  setInterval(refresh, 250)

  const setLang = (next: Lang) => {
    lang = next
    try {
      localStorage.setItem('mars-lang', lang)
    } catch {}
    relabel()
    refresh()
  }
  buttons.lang.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'))
  const toggleHelp = () => {
    help.hidden = !help.hidden
  }
  const toggleEvents = () => {
    if (buttons.events.hidden) return
    panel.hidden = !panel.hidden
    buttons.events.classList.toggle('on', !panel.hidden)
    refresh()
  }
  buttons.help.addEventListener('click', toggleHelp)
  buttons.events.addEventListener('click', toggleEvents)
  return {
    stats(text) {
      status.textContent = text
    },
    toggleEvents,
    toggleFeed,
    toggleHelp,
    lang: () => lang,
    view: (shot, label) => t().views[shot] ?? label,
    quality: (name) => t().quality[name] ?? name,
    mapWords: () => t().map,
    deviceName: (id) => name(id),
    toolName: (tool) => toolLabel(lang, tool),
    eventName: (kind) => t().kinds[kind],
  }
}
