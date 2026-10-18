/**
 * Build both faces of the plugin.
 *
 * The host half is a plain ESM module. The browser half is not a normal ES
 * module: the DSH web shell loads `/plugins/<package>/client.js` as a classic
 * script and expects it to register a closure factory through
 * `window.__ModuleLoader__.load({ id, factory })`. So we bundle the client
 * entry to CommonJS with esbuild, then wrap that body in the registration the
 * loader expects. React stays external: the shell seeds it in the module table.
 */
import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const outdir = join(root, 'lib')
await mkdir(outdir, { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
})

const bodyFile = join(outdir, 'client.body.cjs')
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  outfile: bodyFile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  logLevel: 'warning',
})

const body = await readFile(bodyFile, 'utf8')
const registration = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    const module = { exports: {} };
    (function (module, exports, require) {
${body}
    })(module, module.exports, require);
    return module.exports;
  },
});
`
await writeFile(join(outdir, 'client.js'), registration)
await rm(bodyFile)
console.log(`built ${pkg.name}: lib/index.js, lib/client.js`)
