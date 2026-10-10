// Serves the world with live rebuilds: node tools/dev.mjs [--port 4200]
// With MARS_DIRECTOR_URL set (an OpenAI-compatible API, such as http://127.0.0.1:8488/v1), it also
// answers POST /director for the page's event director: MARS_DIRECTOR_MODEL picks the model and
// MARS_DIRECTOR_KEY, if the API needs one, goes with the request. The key never reaches the page.
import { execFileSync } from 'node:child_process'
import { createServer, request } from 'node:http'
import { context } from 'esbuild'
import { copyDraco } from './draco.mjs'

const root = new URL('..', import.meta.url).pathname
const at = process.argv.indexOf('--port')
const port = at > 0 ? Number(process.argv[at + 1]) : 4200
execFileSync(process.execPath, [`${root}tools/fetch-assets.mjs`], { stdio: 'inherit' })
copyDraco(root)
const ctx = await context({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  outfile: `${root}dist/main.js`,
})
await ctx.watch()
// esbuild serves the files on a port of its own; this server answers /director and passes the rest on.
const inner = await ctx.serve({ servedir: root, host: '127.0.0.1', port: 0 })
const director = {
  url: process.env.MARS_DIRECTOR_URL?.replace(/\/$/, ''),
  model: process.env.MARS_DIRECTOR_MODEL ?? 'agnes-3.0-pro',
  key: process.env.MARS_DIRECTOR_KEY,
}
/** Sends the page's messages to the model; the answer's text and the model's name go back. */
const direct = async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const { messages } = JSON.parse(body)
    const answer = await fetch(`${director.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(director.key ? { authorization: `Bearer ${director.key}` } : {}),
      },
      body: JSON.stringify({ model: director.model, messages, temperature: 0.9 }),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await answer.json()
    const text = json.choices?.[0]?.message?.content ?? ''
    res.writeHead(answer.ok ? 200 : 502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ text, model: director.model, ...(answer.ok ? {} : { error: json.error }) }))
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(e) }))
  }
}
createServer((req, res) => {
  if (req.url?.split('?')[0] === '/director') {
    if (!director.url) {
      res.writeHead(404).end()
      return
    }
    // GET says which model directs; POST asks it.
    if (req.method === 'GET')
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ model: director.model }))
    else void direct(req, res)
    return
  }
  const pass = request(
    { host: inner.hosts[0], port: inner.port, path: req.url, method: req.method, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    },
  )
  pass.on('error', () => res.writeHead(502).end())
  req.pipe(pass)
}).listen(port, '127.0.0.1')
console.log(`Agnes Base is up at http://127.0.0.1:${port}/`)
if (director.url) console.log(`event director: ${director.model} at ${director.url}`)
