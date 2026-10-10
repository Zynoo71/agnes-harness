import type { MarsClock } from './clock.js'
import type { Director } from './live/director.js'
import { CATALOG, type EventKind, type Happening } from './live/events.js'
import { type Activity, type Alert, type World, type WorldDevice, watchers } from './live/world.js'

export type Lang = 'en' | 'zh'

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
    director: 'Director',
    llm: (m: string) => `a model picks (${m})`,
    seeded: 'seeded picks',
    manual: 'only from this panel',
    nowBtn: 'Pick one now',
    startBtn: 'Start',
    nextIn: (t: string) => `Next in ${t}`,
    thinking: 'the director is choosing…',
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
    } as Record<EventKind, string>,
    kindAbout: {
      dust_storm: 'Wind and dust build, then die down. Dark sky, dusty panels, no flying.',
      suit_leak: 'Oxygen goes ten times as fast; the astronaut cannot walk.',
      dust_devil: 'A whirlwind dusts the solar panels.',
      meteorite: 'A new unusual rock in the west field or the east dunes.',
    } as Record<EventKind, string>,
    names: {} as Record<string, string>,
    close: 'Close',
    helpBody: `
<h2>Agnes Base</h2>
<p>A small base on Mars, simulated in your browser. Its eleven devices (habitat, airlock, suit, rover, hopper, Monolith, lab, power, weather station, comms dish, base camera) each speak <b>MHS</b> to <b>AgnesHub</b>, the same way real hardware would. An LLM agent, the <b>brain</b>, runs the base only through their tools, state and cameras.</p>
<p>The world moves on its own, so the brain has to notice and act:</p>
<ul>
<li><b>Time.</b> A sol takes 40 minutes. The sun, the light, the solar output and the cold follow the clock; at night the batteries carry the base.</li>
<li><b>Drift.</b> Dust settles on the panels, the suit's oxygen runs down, a hopper away from its pad boils off propellant.</li>
<li><b>Events.</b> Every few minutes a director starts one: a dust storm, a suit leak, a dust devil, a meteorite. With a model set up, the model picks what and when; code keeps it to the rules.</li>
</ul>
<h3>Ask the brain</h3>
<ul>
<li>Get the astronaut back inside before their oxygen runs low.</li>
<li>A storm is coming: secure the base.</li>
<li>Find the meteorite that just fell, bring a sample to the lab and send the result to Earth.</li>
</ul>
<h3>On this page</h3>
<ul>
<li>Tags over the devices show the tool each one runs, its progress and who called it.</li>
<li>Bottom left: the latest calls, alerts and events. Top: banners for what needs attention.</li>
<li>Keys: <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> views · <kbd>A</kbd> auto camera · <kbd>E</kbd> events · <kbd>L</kbd> tags · <kbd>M</kbd> map · <kbd>R</kbd> reset · <kbd>?</kbd> this card</li>
<li>Address: <code>?time=night</code>, <code>?sol=10</code> (minutes a sol takes), <code>?events=manual</code> or <code>off</code>, <code>?director=seeded&amp;seed=7</code>, <code>?lang=zh</code></li>
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
    director: '导演',
    llm: (m: string) => `由模型挑选（${m}）`,
    seeded: '按种子挑选',
    manual: '只从这里触发',
    nowBtn: '让导演马上选一个',
    startBtn: '触发',
    nextIn: (t: string) => `${t} 后下一个`,
    thinking: '导演正在挑选…',
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
    } as Record<EventKind, string>,
    kindAbout: {
      dust_storm: '风和沙尘升起又减弱：天变暗，太阳能板积灰，不能飞。',
      suit_leak: '氧气消耗快 10 倍，宇航员走不动。',
      dust_devil: '一股旋风给太阳能板蒙上灰。',
      meteorite: '西边野外或东边沙丘多出一块可疑岩石。',
    } as Record<EventKind, string>,
    names: {
      'habitat-01': '栖息舱',
      'airlock-01': '气闸',
      'suit-01': '宇航服',
      'rover-01': '火星车',
      'hopper-01': '飞行器',
      'lab-01': '实验室',
      'power-01': '电力',
      'weather-01': '气象站',
      'comms-01': '通信天线',
      'cam-base': '基地相机',
    } as Record<string, string>,
    close: '关闭',
    helpBody: `
<h2>Agnes 基地</h2>
<p>一座在浏览器里模拟的火星小基地。十一台设备（栖息舱、气闸、宇航服、火星车、飞行器、Monolith、实验室、电力、气象站、通信天线、基地相机）都像真实硬件一样，用 <b>MHS</b> 连到 <b>AgnesHub</b>。一个 LLM 智能体——<b>大脑</b>——只通过它们的工具、状态和相机来管理基地。</p>
<p>世界自己会变，大脑得自己发现、自己处理：</p>
<ul>
<li><b>时间。</b>一个火星日 40 分钟。太阳、光照、发电量和气温都跟着时钟走；夜里靠电池撑着。</li>
<li><b>漂移。</b>太阳能板慢慢积灰，宇航服的氧气一直在减少，离开停机坪的飞行器推进剂会蒸发。</li>
<li><b>事件。</b>每隔几分钟导演出一个事件：沙尘暴、宇航服漏气、尘卷风、陨石。配置了模型时由模型挑什么、什么时候出，代码保证不越规矩。</li>
</ul>
<h3>可以让大脑做</h3>
<ul>
<li>在氧气见底之前把宇航员接回舱里。</li>
<li>沙尘暴要来了：把基地收拾好。</li>
<li>找到刚落下的陨石，把样品送到实验室，再把结果发回地球。</li>
</ul>
<h3>页面上</h3>
<ul>
<li>设备上方的标签显示它正在执行的工具、进度和调用者。</li>
<li>左下角是最近的调用、告警和事件；顶部横幅提示需要注意的事。</li>
<li>按键：<kbd>1</kbd>–<kbd>9</kbd>、<kbd>0</kbd> 视角 · <kbd>A</kbd> 自动镜头 · <kbd>E</kbd> 事件 · <kbd>L</kbd> 标签 · <kbd>M</kbd> 地图 · <kbd>R</kbd> 重置 · <kbd>?</kbd> 本说明</li>
<li>地址参数：<code>?time=night</code>、<code>?sol=10</code>（一个火星日的分钟数）、<code>?events=manual</code> 或 <code>off</code>、<code>?director=seeded&amp;seed=7</code>、<code>?lang=en</code></li>
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

/** A line of the activity list: a call, an alert or an event. */
interface Line {
  el: HTMLElement
  at: number
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
}): { stats(text: string): void; toggleEvents(): void; toggleHelp(): void; lang(): Lang } {
  const { clock, live, tags } = options
  let lang: Lang = options.lang
  const t = () => TEXT[lang]
  const name = (id: string, fallback: string) => t().names[id] ?? fallback

  const brand = document.getElementById('brand') as HTMLElement
  const bar = document.getElementById('bar') as HTMLElement
  const banners = document.getElementById('banners') as HTMLElement
  const feed = document.getElementById('feed') as HTMLElement
  const panel = document.getElementById('events-panel') as HTMLElement
  const help = document.getElementById('help') as HTMLElement
  const status = document.getElementById('status') as HTMLElement
  const field = (id: string) => bar.querySelector(`#${id}`) as HTMLElement
  const buttons = {
    events: document.getElementById('events-toggle') as HTMLButtonElement,
    lang: document.getElementById('lang') as HTMLButtonElement,
    help: document.getElementById('help-toggle') as HTMLButtonElement,
    reset: document.getElementById('reset') as HTMLButtonElement,
  }
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
    return { ...tag, act, tool, who, fill, title: tag.el.querySelector('b') as HTMLElement }
  })

  // The activity list: the latest six lines, the newest at the bottom.
  const lines: Line[] = []
  const lineFor = new Map<Activity, HTMLElement>()
  const push = (line: HTMLElement) => {
    feed.appendChild(line)
    lines.push({ el: line, at: performance.now() })
    while (lines.length > 6) lines.shift()?.el.remove()
    lines.forEach((l, i) => {
      l.el.style.opacity = String(0.45 + (0.55 * (i + 1)) / lines.length)
    })
  }
  const time = () =>
    clock
      .label()
      .replace(/^Sol \d+ · /, '')
      .replace(' LMST', '')
  const row = (kind: string, ...parts: (string | HTMLElement)[]) => {
    const line = el('div', `line ${kind}`)
    line.append(
      el('span', 'when', time()),
      ...parts.map((p) => (typeof p === 'string' ? el('span', '', p) : p)),
    )
    return line
  }
  const callText = (a: Activity) => {
    const end = a.status
      ? a.status === 'done'
        ? `✓ ${t().done} · ${Math.round(((a.ended ?? 0) - a.started) / 1000)} s`
        : `✗ ${a.status === 'error' ? t().error : a.status === 'rejected' ? t().rejected : t().interrupted} · ${a.reason}${a.status === 'rejected' ? `: ${a.detail}` : ''}`
      : a.progress?.text
        ? `… ${a.progress.text}`
        : '…'
    return end
  }
  const drawCall = (line: HTMLElement, a: Activity) => {
    line.className = `line call ${a.status ?? 'running'}`
    ;(line.querySelector('.state') as HTMLElement).textContent = callText(a)
    line.title = a.detail ?? ''
  }

  // Banners along the top: severe events and alarms stay while they last, the rest a few seconds.
  const banner = (key: string, level: 'info' | 'warn' | 'bad', text: () => string, until?: () => boolean) => {
    banners.querySelector(`[data-key="${key}"]`)?.remove()
    const b = el('div', `banner ${level}`)
    b.dataset.key = key
    const label = el('span', 'text')
    const left = el('span', 'left')
    b.append(label, left)
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
      let line = lineFor.get(a)
      if (!line) {
        line = row(
          'call',
          el('b', 'dev', a.device),
          el('span', 'tool', a.tool + (a.caller ? ` ← ${a.caller}` : '')),
          el('span', 'state', ''),
        )
        lineFor.set(a, line)
        push(line)
      }
      drawCall(line, a)
      if (a.status) {
        lineFor.delete(a)
        if (a.status === 'error' || a.status === 'rejected')
          banner(
            `fail-${a.device}`,
            'bad',
            () => `${a.device} ${a.tool}: ${a.reason} — ${(a.detail ?? '').slice(0, 90)}`,
          )
      }
    })
    watchers.alert.push((a: Alert, raised: boolean) => {
      const word = raised ? (a.level === 'bad' ? t().alertBad : t().alertWarn) : t().cleared
      push(
        row(
          `alert ${raised ? a.level : 'ok'}`,
          el('b', 'dev', a.device),
          el('span', '', `${a.field} ${a.value}`),
          el('span', 'state', word),
        ),
      )
      if (raised && a.level === 'bad') {
        const dev = live.devices.find((d) => d.id === a.device)
        banner(
          `alert-${a.device}-${a.field}`,
          'bad',
          () => `${a.device} · ${a.field} ${t().alertBad}`,
          () => dev?.alerts.get(a.field)?.level !== 'bad',
        )
      }
    })
    live.world.events?.listeners.push((h: Happening, phase) => {
      const kind = t().kinds[h.kind]
      // Short events (a meteorite's fall, a dust devil) just happen; storms and leaks also end.
      if (phase === 'start' || CATALOG[h.kind].severe)
        push(
          row(
            `event ${phase}`,
            el('b', 'dev', kind),
            el('span', '', phase === 'start' ? h.headline[lang] : t().over),
          ),
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
        )
      }
    })
  }

  // The events panel: who picks, when the next comes, what is going on, and a button per event.
  const panelHead = el('div', 'head')
  const panelDirector = el('div', 'director')
  const panelNext = el('div', 'next')
  const nowButton = el('button', 'small')
  nowButton.type = 'button'
  nowButton.addEventListener('click', () => void live?.director.next())
  panelNext.append(el('span'), nowButton)
  const panelReason = el('div', 'reason')
  const panelActive = el('div', 'active')
  const panelList = el('div', 'list')
  const startButtons = (Object.keys(CATALOG) as EventKind[]).map((kind) => {
    const item = el('div', 'item')
    const text = el('div')
    const title = el('b')
    const about = el('span')
    text.append(title, about)
    const go = el('button', 'small')
    go.type = 'button'
    go.addEventListener('click', () => {
      const why = live?.director.start(kind)
      if (why) push(row('alert warn', el('b', 'dev', t().kinds[kind]), el('span', '', why)))
    })
    item.append(text, go)
    panelList.appendChild(item)
    return { kind, title, about, go }
  })
  panel.append(panelHead, panelDirector, panelNext, panelReason, panelActive, panelList)

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
    buttons.events.textContent = t().events
    buttons.lang.textContent = t().language
    buttons.help.textContent = '?'
    buttons.help.title = t().help
    buttons.reset.textContent = t().reset
    panelHead.textContent = t().events
    nowButton.textContent = t().nowBtn
    for (const b of startButtons) {
      b.title.textContent = t().kinds[b.kind]
      b.about.textContent = t().kindAbout[b.kind]
      b.go.textContent = t().startBtn
    }
    helpBody.innerHTML = t().helpBody
    closeHelp.textContent = t().close
    for (const tag of tagParts) tag.title.textContent = name(tag.id, tag.name)
  }

  const refresh = () => {
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
        options.eventsMode === 'auto' && next !== undefined
          ? t().next(d.thinking ? '…' : clockTime(next))
          : ''
      // The panel, while it is open.
      if (!panel.hidden) {
        panelDirector.textContent = `${t().director}: ${options.eventsMode !== 'auto' ? t().manual : d.mode === 'llm' ? t().llm(d.model ?? '…') : t().seeded}`
        ;(panelNext.firstChild as HTMLElement).textContent = d.thinking
          ? t().thinking
          : next !== undefined
            ? t().nextIn(clockTime(next))
            : ''
        panelReason.textContent = d.lastReason && d.lastReason !== 'seeded' ? `“${d.lastReason}”` : ''
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
      }
    }
    // Tags: the call each device runs, and the device's colour: busy, warning, alarm, failed.
    for (const tag of tagParts) {
      const dev = live?.devices.find((d) => d.id === tag.id)
      const a = dev?.current
      tag.act.hidden = !a
      if (a) {
        tag.tool.textContent = a.tool
        tag.who.textContent = a.caller ? `← ${a.caller}` : ''
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
    toggleHelp,
    lang: () => lang,
  }
}
