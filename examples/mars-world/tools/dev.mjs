// Serves the world with live rebuilds: node tools/dev.mjs [--port 4200]
// Secrets (TYPESAFE_API_KEY) come from the environment or from examples/mars-world/.env, which git ignores.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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
const { hosts } = await ctx.serve({ servedir: root, host: '127.0.0.1', port })
console.log(`Agnes Base is up at http://${hosts[0]}:${port}/`)
