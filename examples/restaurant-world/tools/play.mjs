// Plays a scenario against the restaurant: opens the page in headless Chrome connected to a hub,
// then calls tools through the hub one step at a time, with screenshots along the way.
//   node tools/play.mjs <scenario.json> <out-dir> [page-url] [hub]
// The page defaults to http://127.0.0.1:4200/ and the hub to ws://127.0.0.1:4180. A scenario is a
// list of steps:
//   {"call": ["host-01", "seat_guest", {"table": "t3"}]}   waits for the result and prints it
//   {"start": ["wok-01", "cook", {"item": "o1"}]}          starts a call without waiting
//   {"wait": "all"}                                        waits for every started call
//   {"sleep": 2000}
//   {"shot": "seated", "view": [6.2, 5.4, 4]}              a screenshot, framed on (x, y) with span
//   {"eval": "restaurant.world.service.guest"}             prints a value from the page
// Needs Google Chrome (or CHROME=/path/to/chrome), a running hub and `node tools/dev.mjs`.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [scenario, out = '.', page = 'http://127.0.0.1:4200/', hub = 'ws://127.0.0.1:4180'] =
  process.argv.slice(2)
const steps = JSON.parse(readFileSync(scenario, 'utf8'))
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome =
  process.env.CHROME ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome')
const port = 9334
const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'restaurant-play-'))}`,
    '--window-size=1600,900',
    '--hide-scrollbars',
    '--use-angle=metal',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

// The page, over the DevTools protocol.
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
  } catch {}
}
if (!target) throw new Error('Chrome did not start')
const cdp = await open(
  target.webSocketDebuggerUrl,
  (msg) => {
    if (msg.method === 'Runtime.exceptionThrown')
      console.error(
        `page error: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`,
      )
  },
  true,
)
const devtools = (method, params = {}) => cdp.request({ method, params })
await devtools('Runtime.enable')
const url = new URL(page)
url.searchParams.set('hub', hub)
url.searchParams.set('about', '0')
await devtools('Page.navigate', { url: url.href })
const evaluate = async (expression) =>
  (await devtools('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result
    ?.value
for (let i = 0; i < 240 && (await evaluate('document.body?.dataset.ready')) !== '1'; i++) await sleep(250)

// The hub, as a client.
const results = new Map()
const client = await open(`${hub}/ws/hub`, (msg) => {
  if (msg.method === 'hub/result') results.get(msg.params.job)?.(msg.params)
})
await client.request({
  jsonrpc: '2.0',
  method: 'hub/hello',
  params: { role: 'agent', client: { name: 'play' } },
})
// Wait until every device the page connects is there.
for (let i = 0; i < 40; i++) {
  const { result } = await client.request({ jsonrpc: '2.0', method: 'hub/devices', params: {} })
  if ((result?.devices ?? []).filter((d) => d.available !== false).length >= (steps.devices ?? 1)) break
  await sleep(250)
}
const started = []
const call = async ([device, tool, args = {}]) => {
  const reply = await client.request({
    jsonrpc: '2.0',
    method: 'hub/call',
    params: { device, tool, arguments: args },
  })
  const r = reply.result
  if (!r?.accepted)
    return { device, tool, status: r?.status ?? 'error', detail: r?.detail ?? JSON.stringify(reply.error) }
  return new Promise((resolve) => results.set(r.job, resolve))
}
const print = (r) =>
  console.log(`${r.device} ${r.tool}: ${r.status}${r.reason ? ` (${r.reason})` : ''} — ${r.detail}`)
const t0 = Date.now()
for (const step of steps.steps ?? steps) {
  const at = `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  if (step.call) {
    console.log(`${at} → ${step.call[0]} ${step.call[1]} ${JSON.stringify(step.call[2] ?? {})}`)
    print(await call(step.call))
  } else if (step.start) {
    console.log(`${at} ⇢ ${step.start[0]} ${step.start[1]} ${JSON.stringify(step.start[2] ?? {})}`)
    started.push(call(step.start).then(print))
  } else if (step.wait) {
    await Promise.all(started.splice(0))
  } else if (step.sleep) await sleep(step.sleep)
  else if (step.eval) console.log(`${at} ${step.eval} = ${JSON.stringify(await evaluate(step.eval))}`)
  else if (step.shot) {
    if (step.view)
      await evaluate(
        `restaurant.view?.set({ x: ${step.view[0]}, y: ${step.view[1]}, span: ${step.view[2]} })`,
      )
    await sleep(400)
    const shot = await devtools('Page.captureScreenshot', { format: 'png' })
    const path = join(out, `${step.shot}.png`)
    writeFileSync(path, Buffer.from(shot.result.data, 'base64'))
    console.log(`${at} shot ${path}`)
  }
}
await Promise.all(started)
client.close()
cdp.close()
proc.kill()

/** A JSON-RPC connection over a WebSocket: `request` resolves with the reply. */
async function open(address, onMessage, numeric = false) {
  const ws = new WebSocket(address)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let next = 0
  const waiting = new Map()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id !== undefined && waiting.has(String(msg.id))) {
      waiting.get(String(msg.id))(msg)
      waiting.delete(String(msg.id))
    } else onMessage(msg)
  })
  return {
    request(msg) {
      next += 1
      const id = String(next)
      return new Promise((resolve) => {
        waiting.set(id, resolve)
        ws.send(JSON.stringify({ ...msg, id: numeric ? next : id }))
      })
    },
    close: () => ws.close(),
  }
}
