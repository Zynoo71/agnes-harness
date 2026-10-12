import type { Decision } from './dm/watch.js'
import { DEVICES, type Lang, progressLabel, toolLabel, valueLabel } from './labels.js'
import { TABLES } from './layout.js'
import type { Line as OrderLine, Service } from './live/service.js'
import { type Activity, type Alert, type World, type WorldDevice, watchers } from './live/world.js'
import { MENU, type Station } from './menu.js'

export type { Lang }

/** Every line the page shows, in English and Chinese. */
const TEXT = {
  en: {
    title: 'Agnes Restaurant',
    subtitle: 'Robots front of house and in the kitchen · a test bed for LLM agents',
    outside: 'Guest outside',
    atDoor: 'Guest at the door',
    following: 'Guest following the host',
    seated: (t: string) => `Seated ${t}`,
    leaving: 'Guest leaving',
    left: 'Guest has left',
    table: (id: string) => `Table ${id.slice(1)}`,
    kitchen: (cooking: number, waiting: number) => `Kitchen · ${cooking} cooking · ${waiting} waiting`,
    problem: 'a hair in it',
    kitchenIdle: 'Kitchen · idle',
    evening: 'evening',
    room: (lights: string, music: string, c: number) => `${lights} · ${music} · ${c.toFixed(1)} °C`,
    language: '中文',
    reset: 'Reset',
    help: 'About',
    controls: 'Controls',
    conditionsHead: 'Conditions',
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
    applyBtn: 'Apply',
    done: 'done',
    error: 'failed',
    interrupted: 'interrupted',
    rejected: 'refused',
    alertWarn: 'warning',
    alertBad: 'alarm',
    cleared: 'back to normal',
    fields: {} as Record<string, string>,
    map: { title: 'floor plan · m', axes: 'x → east, y ↑ north' },
    close: 'Close',
    // The guest's cards.
    menuHead: 'Menu',
    menuKey: 'C',
    stations: { wok: 'From the wok', stove: 'Steamed and boiled', bar: 'Drinks and dessert' } as Record<
      Station,
      string
    >,
    soldOut: 'sold out',
    signature: 'house special',
    vegetarian: 'vegetarian',
    allergens: {} as Record<string, string>,
    myTable: 'My table',
    nothingYet: 'Nothing ordered yet',
    onTable: 'On the table',
    total: 'Total',
    stages: {
      queued: 'ordered',
      prepping: 'prepping',
      prepped: 'prepped',
      cooking: 'cooking',
      ready: 'plating',
      readyBar: 'ready at the bar',
      at_pass: 'at the pass',
      on_the_way: 'on the way',
      served: 'served',
      cleared: 'cleared',
      cancelled: 'cancelled',
    } as Record<string, string>,
    billHead: 'Bill',
    subtotal: 'Subtotal',
    off: (p: number, why: string) => `${p}% off${why ? ` · ${why}` : ''}`,
    scan: 'Scan to pay',
    paid: (how: string) => `Paid · ${how}`,
    methods: { qr: 'QR code', card: 'card', cash: 'cash', free: 'on the house' } as Record<string, string>,
    thanks: 'Thank you — see you again!',
    helpBody: `
<h2>Agnes Restaurant</h2>
<p>A modern Chinese restaurant, simulated in your browser. You are the one guest: you speak to <b>Agnes</b> in plain words, and Agnes runs the restaurant only through its fourteen devices (the host robot at the door, the floor plan, the menu, the prep robot, the wok station, the steamer and stove, the kitchen arm, the bar robot, the runner, the supplies cabinet, the cleaner, the room's lights, music and air, the payment terminal and a ceiling camera). Each speaks <b>MHS</b> to <b>AgnesHub</b>, the same way real hardware would. Two deciders: the <b class="by-llm">LLM</b>, which reads, plans and talks, and <b class="by-dm">Jev</b>, a fast decision model that takes the obvious next step on its own and hands everything else to the LLM.</p>
<h3>Say to Agnes</h3>
<ul>
<li>我们一个人，找个靠窗的位置吧。</li>
<li>来个宫保鸡丁，少放辣，再来碗米饭。</li>
<li>今天我生日，能不能来点气氛？</li>
<li>菜怎么还没上？催一下。 · 我的茶打翻了。 · 买单，扫码付。</li>
</ul>
<h3>On this page</h3>
<ul>
<li>Tags over the devices show the tool each one runs, its progress and who called it: Jev in green with a bolt, the LLM in blue.</li>
<li>Right: the menu on the guest's screen, the guest's table with each dish's progress, and the bill. Bottom left: the latest calls and alerts, with every decision of Jev; click a Jev line to see how it chose.</li>
<li>Controls (<kbd>E</kbd>): bring about trouble — a dish sells out, napkins run out, the guest knocks over their tea, the room gets hot.</li>
<li>Keys: <kbd>1</kbd>–<kbd>9</kbd> views · drag and wheel to move · <kbd>P</kbd> picture in picture · <kbd>C</kbd> menu · <kbd>E</kbd> controls · <kbd>L</kbd> tags · <kbd>M</kbd> map · <kbd>R</kbd> reset · <kbd>?</kbd> this card</li>
<li>Address: <code>?lang=zh</code>, <code>?shot=kitchen</code>, <code>?view=x,y,span</code>, <code>?fps=60</code>, <code>?stats</code></li>
</ul>`,
  },
  zh: {
    title: 'Agnes 餐厅',
    subtitle: '前厅和后厨都是机器人 · LLM 智能体的试验场',
    outside: '客人在门外',
    atDoor: '客人在门口',
    following: '客人跟着迎宾',
    seated: (t: string) => `入座 ${t}`,
    leaving: '客人离开中',
    left: '客人已离开',
    table: (id: string) => `${id.slice(1)} 号桌`,
    kitchen: (cooking: number, waiting: number) => `后厨 · ${cooking} 道在做 · ${waiting} 道排队`,
    problem: '有头发',
    kitchenIdle: '后厨 · 空闲',
    evening: '傍晚',
    room: (lights: string, music: string, c: number) => `${lights} · ${music} · ${c.toFixed(1)} °C`,
    language: 'EN',
    reset: '重置',
    help: '说明',
    controls: '控制台',
    conditionsHead: '状况',
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
    applyBtn: '设置',
    done: '完成',
    error: '失败',
    interrupted: '中断',
    rejected: '拒绝',
    alertWarn: '告警',
    alertBad: '严重告警',
    cleared: '恢复正常',
    fields: {
      temperature: '室温',
      battery: '电量',
      napkins: '纸巾',
      chopsticks: '筷子',
      bowl: '碗',
      spoon: '勺子',
      cup: '杯子',
      takeaway_box: '打包盒',
      baby_chair: '儿童椅',
      lights: '灯光',
      music: '音乐',
      volume: '音量',
      mode: '模式',
      bill: '账单',
    } as Record<string, string>,
    map: { title: '平面图 · 米', axes: 'x → 东，y ↑ 北' },
    close: '关闭',
    menuHead: '菜单',
    menuKey: 'C',
    stations: { wok: '小炒', stove: '蒸煮', bar: '饮品甜点' } as Record<Station, string>,
    soldOut: '售罄',
    signature: '招牌',
    vegetarian: '素',
    allergens: {
      peanuts: '花生',
      egg: '蛋',
      milk: '奶',
      wheat: '小麦',
      shrimp: '虾',
      fish: '鱼',
      soy: '大豆',
    } as Record<string, string>,
    myTable: '我的桌',
    nothingYet: '还没点菜',
    onTable: '桌上',
    total: '合计',
    stages: {
      queued: '已下单',
      prepping: '备菜中',
      prepped: '已备好',
      cooking: '烹饪中',
      ready: '装盘中',
      readyBar: '吧台待取',
      at_pass: '出餐口',
      on_the_way: '送餐中',
      served: '已上桌',
      cleared: '已收走',
      cancelled: '已退',
    } as Record<string, string>,
    billHead: '账单',
    subtotal: '小计',
    off: (p: number, why: string) => `${10 - p / 10} 折${why ? ` · ${why}` : ''}`,
    scan: '扫码付款',
    paid: (how: string) => `已付款 · ${how}`,
    methods: { qr: '扫码', card: '刷卡', cash: '现金', free: '免单' } as Record<string, string>,
    thanks: '谢谢光临，欢迎再来！',
    helpBody: `
<h2>Agnes 餐厅</h2>
<p>一家在浏览器里模拟的现代中餐厅。你就是那位客人：用平常的话跟 <b>Agnes</b> 说，Agnes 只通过十四台设备来经营餐厅（门口的迎宾机器人、桌位、点餐、备菜机器人、炒锅、蒸灶、厨房机械臂、吧台机器人、送餐机器人、用品柜、清洁机器人、灯光音乐空调、收银和吊顶摄像头）。每台设备都像真实硬件一样，用 <b>MHS</b> 连到 <b>AgnesHub</b>。由两个角色做决定：<b class="by-llm">LLM</b> 负责读、规划和沟通；<b class="by-dm">Jev</b> 是快速的决策模型，明摆着的下一步自己直接做，其余都交给 LLM。</p>
<h3>可以跟 Agnes 说</h3>
<ul>
<li>我们一个人，找个靠窗的位置吧。</li>
<li>来个宫保鸡丁，少放辣，再来碗米饭。</li>
<li>今天我生日，能不能来点气氛？</li>
<li>菜怎么还没上？催一下。 · 我的茶打翻了。 · 买单，扫码付。</li>
</ul>
<h3>页面上</h3>
<ul>
<li>设备上方的标签显示它正在执行的工具、进度和调用者：Jev 是绿色带闪电，LLM 是蓝色。</li>
<li>右边是客人屏幕上的菜单、客人这桌每道菜的进度，以及账单。左下角是最近的调用和告警，Jev 的每次决定也在其中；点 Jev 的那一行看它怎么选的。</li>
<li>控制台（<kbd>E</kbd>）：制造状况——某道菜卖完、纸巾用完、客人打翻茶、屋里变热。</li>
<li>按键：<kbd>1</kbd>–<kbd>9</kbd> 视角 · 拖动和滚轮移动 · <kbd>P</kbd> 画中画 · <kbd>C</kbd> 菜单 · <kbd>E</kbd> 控制台 · <kbd>L</kbd> 标签 · <kbd>M</kbd> 地图 · <kbd>R</kbd> 重置 · <kbd>?</kbd> 本说明</li>
<li>地址参数：<code>?lang=en</code>、<code>?shot=kitchen</code>、<code>?view=x,y,span</code>、<code>?fps=60</code>、<code>?stats</code></li>
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
}

interface Live {
  devices: WorldDevice[]
  world: World
}

/** An item of the activity list: a call, an alert, or a step the DM left to the LLM, drawn again when the language changes. */
interface Line {
  el: HTMLElement
  draw(): void
}

/** A QR-like square for the bill: three finder squares and a pattern from `seed`. */
function qrCode(seed: number): HTMLCanvasElement {
  const n = 25
  const px = 4
  const canvas = el('canvas', 'qr')
  canvas.width = canvas.height = (n + 2) * px
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#fff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.fillStyle = '#17110e'
  let s = seed || 1
  const random = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  const finder = (x: number, y: number) => (i: number, j: number) =>
    i >= x && i < x + 7 && j >= y && j < y + 7
      ? Math.max(Math.abs(i - x - 3), Math.abs(j - y - 3)) !== 2
      : undefined
  const finders = [finder(0, 0), finder(n - 7, 0), finder(0, n - 7)]
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const f = finders.map((f) => f(i, j)).find((v) => v !== undefined)
      const near = finders.some(
        (f) =>
          f(i - 1, j) !== undefined ||
          f(i, j - 1) !== undefined ||
          f(i + 1, j) !== undefined ||
          f(i, j + 1) !== undefined,
      )
      const on = f ?? (!near && random() < 0.5)
      if (on) g.fillRect((i + 1) * px, (j + 1) * px, px, px)
    }
  return canvas
}

/**
 * Everything drawn over the scene besides the tags' places: the brand, the bar along the bottom
 * (the guest, their table, the kitchen, the room), the activity list, the banners, the guest's
 * cards (menu, table, bill), the controls panel and the About card, in English or Chinese. It
 * refreshes four times a second, apart from the frames.
 */
export function buildOverlay(options: {
  live: Live | undefined
  tags: Tag[]
  lang: Lang
  showHelp: boolean
  /** The DM's decisions from AgnesHub, newest first; the panel shows once there is one. */
  dm?: { decisions(): Decision[]; version(): number }
}): {
  stats(text: string): void
  toggleControls(): void
  toggleHelp(): void
  toggleMenu(): void
  lang(): Lang
  mapWords(): { title: string; axes: string }
  /** A device's name and a tool's, in the language of the moment, for the picture in picture. */
  deviceName(id: string): string
  toolName(tool: string): string
} {
  const { live, tags } = options
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
  const name = (id: string, fallback = id) => {
    const d = DEVICES.find((x) => x.id === id)
    return d ? d[lang] : fallback
  }
  const fieldName = (field: string) => t().fields[field] ?? field.replaceAll('_', ' ')
  const value = (v: string) => valueLabel(lang, v, (id) => name(id))
  const dishName = (id: string) => {
    const d = MENU.find((x) => x.id === id)
    return d ? d[lang] : id
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
  const panel = document.getElementById('controls-panel') as HTMLElement
  const help = document.getElementById('help') as HTMLElement
  const status = document.getElementById('status') as HTMLElement
  const menuCard = document.getElementById('menu-card') as HTMLElement
  const tableCard = document.getElementById('table-card') as HTMLElement
  const billCard = document.getElementById('bill-card') as HTMLElement
  const field = (id: string) => bar.querySelector(`#${id}`) as HTMLElement
  const buttons = {
    controls: document.getElementById('controls-toggle') as HTMLButtonElement,
    lang: document.getElementById('lang') as HTMLButtonElement,
    help: document.getElementById('help-toggle') as HTMLButtonElement,
    reset: document.getElementById('reset') as HTMLButtonElement,
  }
  const dm = options.dm
  buttons.controls.hidden = !live

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
  // who took the steps. Each item keeps the time it was written at and draws its words in the
  // language of the moment. An item the DM decided opens to show how: the newest for a few seconds,
  // any of them on a click.
  const lines: Line[] = []
  const head = el('div', 'head')
  head.hidden = true
  feed.appendChild(head)
  /** The DM's newest decision, open in the list until `until`. */
  let fresh: { d: Decision; until: number } | undefined
  const time = () => new Date().toTimeString().slice(0, 8)
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
      item.replaceChildren(line, ...(open && d ? [decisionCard(d)] : []))
    }
    line.addEventListener('click', () => {
      if (!decision?.()) return
      clicked = !item.classList.contains('open')
      draw()
    })
    draw()
    feed.appendChild(item)
    lines.push({ el: item, draw })
    while (lines.length > 8) lines.shift()?.el.remove()
    lines.forEach((l, i) => {
      l.el.style.opacity = String(0.55 + (0.45 * (i + 1)) / lines.length)
    })
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
  /** What a call was about, short: the host's words, the dishes ordered, the table. */
  const argsText = (a: Activity): string => {
    const args = a.args as Record<string, unknown>
    if (a.tool === 'say') return `“${String(args.text ?? '')}”`
    if (a.tool === 'order' && Array.isArray(args.items))
      return (args.items as { dish?: string; qty?: number }[])
        .map((i) => `${dishName(String(i.dish))}${i.qty && i.qty > 1 ? ` ×${i.qty}` : ''}`)
        .join(lang === 'zh' ? '、' : ', ')
    const shown = Object.values(args).flatMap((v) =>
      typeof v === 'string' || typeof v === 'number' ? [v] : Array.isArray(v) ? [v.join(', ')] : [],
    )
    return shown.map((v) => value(String(v))).join(' · ')
  }
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
          el('b', 'dev', name(a.device)),
          tool(a.tool),
          el('span', 'args', argsText(a)),
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

  // Banners along the top: alarms stay while they last, the rest a few seconds.
  const banner = (key: string, level: 'info' | 'warn' | 'bad', text: () => string, until?: () => boolean) => {
    banners.querySelector(`[data-key="${key}"]`)?.remove()
    const b = el('div', `banner ${level}`)
    b.dataset.key = key
    const label = el('span', 'text')
    b.append(label)
    banners.appendChild(b)
    const started = performance.now()
    const refresh = () => {
      label.textContent = text()
      const over = until ? until() : performance.now() - started > 8000
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
          el('b', 'dev', name(a.device)),
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
        )
      }
    })
  }

  // The controls panel: trouble the devices offer.
  const panelHead = el('div', 'head')
  const section = () => el('div', 'section')
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
        () => [el('b', 'dev', name(c.device)), el('span', '', c[lang])],
      )
    })
    item.append(text, b)
    conditionList.appendChild(item)
    return { c, title, b }
  })
  panel.append(panelHead, conditionsHead, conditionList)

  // The guest's cards. The menu shows while menu-01 has it open on the guest's screen, and C shows
  // or hides it whatever menu-01 says, until menu-01 opens or closes it again.
  let menuChoice: boolean | undefined
  let menuWas = false
  const service = (): Service | undefined => live?.world.service
  const drawMenu = () => {
    const s = service()
    const open = s?.menuOpen ?? false
    if (open !== menuWas) menuChoice = undefined
    menuWas = open
    menuCard.hidden = !(menuChoice ?? open) || Boolean(s?.billOpen)
    if (menuCard.hidden) return
    const parts: HTMLElement[] = [span('head', el('b', '', t().menuHead), el('kbd', '', t().menuKey))]
    for (const station of ['wok', 'stove', 'bar'] as Station[]) {
      parts.push(el('div', 'section', t().stations[station]))
      for (const d of MENU.filter((x) => x.station === station)) {
        const out = s?.soldOut.has(d.id) ?? false
        const row = el('div', `dish${out ? ' out' : ''}`)
        const marks = [d.signature ? '★' : '', '🌶'.repeat(d.spicy), d.vegetarian ? '🌱' : ''].join('')
        const nameCell = span('name', d[lang])
        if (marks) nameCell.append(el('i', 'marks', marks))
        if (d.allergens?.length)
          nameCell.append(el('small', '', d.allergens.map((a) => t().allergens[a] ?? a).join(' ')))
        row.append(nameCell, el('span', 'price', out ? t().soldOut : `¥${d.price}`))
        row.title = [d.signature ? t().signature : '', d.vegetarian ? t().vegetarian : '']
          .filter(Boolean)
          .join(' · ')
        parts.push(row)
      }
    }
    menuCard.replaceChildren(...parts)
  }
  const stageWord = (l: OrderLine) =>
    l.stage === 'ready' && l.dish.station === 'bar' ? t().stages.readyBar : (t().stages[l.stage] ?? l.stage)
  const drawTable = () => {
    const s = service()
    const here = s?.table && (s.guest === 'seated' || s.guest === 'leaving' || s.lines.length > 0)
    tableCard.hidden = !here || s.guest === 'left'
    if (tableCard.hidden || !s || !s.table) return
    const table = TABLES.find((x) => x.id === s.table)
    const parts: HTMLElement[] = [
      span(
        'head',
        el('b', '', t().myTable),
        el(
          'span',
          '',
          `${table?.name[lang] ?? s.table}${s.seatedAt ? ` · ${clockTime((performance.now() - s.seatedAt) / 1000)}` : ''}`,
        ),
      ),
    ]
    if (!s.lines.length) parts.push(el('div', 'empty', t().nothingYet))
    for (const l of s.lines) {
      const row = el('div', `order ${l.stage}`)
      const nameCell = span('name', el('i', 'id', l.id), l.dish[lang])
      if (l.note) nameCell.append(el('small', '', l.note))
      if (l.rush) nameCell.append(el('small', 'rush', '⚡'))
      if (l.problem) nameCell.append(el('small', 'problem', t().problem))
      row.append(nameCell, el('span', `stage ${l.stage}`, stageWord(l)))
      parts.push(row)
    }
    const things = s.supplies.filter((x) => x.stage === 'served').map((x) => value(x.item))
    if (things.length)
      parts.push(el('div', 'things', `${t().onTable}: ${things.join(lang === 'zh' ? '、' : ', ')}`))
    parts.push(span('sum', el('span', '', t().total), el('b', '', `¥${s.total()}`)))
    tableCard.replaceChildren(...parts)
  }
  let qr: HTMLCanvasElement | undefined
  const drawBill = () => {
    const s = service()
    billCard.hidden = !s || !(s.billOpen || (s.bill === 'paid' && s.guest !== 'outside'))
    if (billCard.hidden || !s) return
    const parts: HTMLElement[] = [
      span('head', el('b', '', t().billHead), el('span', '', s.table ? t().table(s.table) : '')),
    ]
    for (const l of s.billed())
      parts.push(span('row', el('span', '', l.dish[lang]), el('span', '', `¥${l.dish.price}`)))
    if (s.discount) {
      parts.push(span('row dim', el('span', '', t().subtotal), el('span', '', `¥${s.subtotal()}`)))
      parts.push(
        span(
          'row off',
          el('span', '', t().off(s.discount, s.discountReason)),
          el('span', '', `−¥${s.subtotal() - s.total()}`),
        ),
      )
    }
    parts.push(span('sum', el('span', '', t().total), el('b', '', `¥${s.total()}`)))
    if (s.bill === 'paid') {
      parts.push(el('div', 'paid', `✓ ${t().paid(t().methods[s.paidWith] ?? s.paidWith)}`))
      parts.push(el('div', 'thanks', t().thanks))
    } else {
      qr ??= qrCode(s.total() * 7919 + 13)
      parts.push(span('pay', qr, el('span', '', t().scan)))
    }
    billCard.replaceChildren(...parts)
  }
  if (live)
    live.world.service.listeners.push(() => {
      if (!live.world.service.billOpen) qr = undefined
    })

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
    buttons.controls.textContent = t().controls
    buttons.lang.textContent = t().language
    buttons.help.textContent = '?'
    buttons.help.title = t().help
    buttons.reset.textContent = t().reset
    drawHead()
    panelHead.textContent = t().controls
    conditionsHead.textContent = t().conditionsHead
    for (const c of conditionButtons) {
      c.title.textContent = c.c[lang]
      c.b.textContent = t().applyBtn
    }
    helpBody.innerHTML = t().helpBody
    closeHelp.textContent = t().close
    for (const tag of tagParts) tag.title.textContent = name(tag.id)
    for (const line of lines) line.draw()
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
    e.append(el('b', 'dev', name(device)), ` ${text}`)
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
      fresh = { d, until: performance.now() + 8000 }
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
    if (live) {
      const s = live.world.service
      const guest = field('guest')
      guest.textContent =
        s.guest === 'seated' && s.seatedAt !== undefined
          ? t().seated(clockTime((now - s.seatedAt) / 1000))
          : s.guest === 'outside'
            ? t().outside
            : s.guest === 'at_door'
              ? t().atDoor
              : s.guest === 'following'
                ? t().following
                : s.guest === 'leaving'
                  ? t().leaving
                  : t().left
      guest.className = s.guest === 'at_door' ? 'warn' : ''
      field('table').textContent = s.table && s.guest !== 'left' ? t().table(s.table) : ''
      const cooking = s.lines.filter((l) => l.stage === 'cooking' || l.stage === 'prepping').length
      const waiting = s.lines.filter((l) => l.stage === 'queued' || l.stage === 'prepped').length
      field('kitchen').textContent = cooking + waiting ? t().kitchen(cooking, waiting) : t().kitchenIdle
      const a = live.world.ambience
      const room = field('room')
      room.textContent = `${a.outside === 'evening' ? `☾ ${t().evening} · ` : ''}${t().room(value(a.lights), `♪ ${value(a.music)}`, a.air)}`
      room.className = a.air >= 30 ? 'bad' : a.air >= 27 ? 'warn' : ''
      drawMenu()
      drawTable()
      drawBill()
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
      localStorage.setItem('restaurant-lang', lang)
    } catch {}
    relabel()
    refresh()
  }
  buttons.lang.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'))
  const toggleHelp = () => {
    help.hidden = !help.hidden
  }
  const toggleControls = () => {
    if (buttons.controls.hidden) return
    panel.hidden = !panel.hidden
    buttons.controls.classList.toggle('on', !panel.hidden)
    refresh()
  }
  buttons.help.addEventListener('click', toggleHelp)
  buttons.controls.addEventListener('click', toggleControls)
  return {
    stats(text) {
      status.textContent = text
    },
    toggleControls,
    toggleHelp,
    toggleMenu() {
      menuChoice = menuCard.hidden === true
      refresh()
    },
    lang: () => lang,
    mapWords: () => t().map,
    deviceName: (id) => name(id),
    toolName: (tool) => toolLabel(lang, tool),
  }
}
