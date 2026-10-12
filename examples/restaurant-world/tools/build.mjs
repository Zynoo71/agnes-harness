// Bundles src/main.ts into dist/main.js for index.html.
import { build } from 'esbuild'

await build({
  entryPoints: [new URL('../src/main.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outfile: new URL('../dist/main.js', import.meta.url).pathname,
})
