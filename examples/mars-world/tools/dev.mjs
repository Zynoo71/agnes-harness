// Serves the world with live rebuilds: node tools/dev.mjs [--port 4200]
// With CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN set (in the environment or in
// examples/mars-world/.env, which git ignores), it also answers POST /dm for the page's decision
// model: the request goes to Cloudflare's clef with the token, which never reaches the page.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { context } from 'esbuild'
import { copyDraco } from './draco.mjs'

const root = new URL('..', import.meta.url).pathname
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`)
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
// esbuild serves the files on a port of its own; this server answers /dm and passes the rest on.
const inner = await ctx.serve({ servedir: root, host: '127.0.0.1', port: 0 })
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env
const DM_MODEL = 'clef'

/** Passes the page's System One request (state, questions) to clef; its answers go back. */
const decide = async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const { state, questions } = JSON.parse(body)
    const answer = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/${DM_MODEL}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: DM_MODEL, state, questions }),
        signal: AbortSignal.timeout(20_000),
      },
    )
    const json = await answer.json()
    res.writeHead(answer.ok ? 200 : 502, { 'content-type': 'application/json' })
    res.end(JSON.stringify(answer.ok ? json.result : { error: json.errors ?? json }))
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(e) }))
  }
}

createServer((req, res) => {
  if (req.url?.split('?')[0] === '/dm') {
    if (!account || !token) return void res.writeHead(404).end()
    // GET says which model decides; POST asks it.
    if (req.method === 'GET')
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: DM_MODEL }))
    else void decide(req, res)
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
if (account && token) console.log(`decision model: ${DM_MODEL} on Cloudflare Workers AI`)
