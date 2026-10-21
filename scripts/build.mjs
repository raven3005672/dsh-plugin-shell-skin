/**
 * Build one DSH plugin package.
 *
 * Every plugin package has the same two faces and the same browser contract,
 * so the mechanics live here instead of being copied into each package:
 *
 * - Host half: plain ESM for the Loader (`lib/index.js`).
 * - Browser half: the web shell loads `/plugins/<package>/client.js` as a
 *   classic script and expects it to register a closure factory through
 *   `window.__ModuleLoader__.load({ id, factory })`, so the client entry is
 *   bundled to CommonJS and wrapped in that registration.
 *
 * React and the shell's shared primitives stay external: the browser seeds
 * them in the platform module table, and bundling a second copy would break
 * hook identity.
 */
import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Modules the browser shell seeds; never bundle these. */
const PLATFORM_EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Modules the Host composition provides. */
const HOST_EXTERNAL = ['@deepseek-ai/schemastery']

/** The package this script builds: the repository root. */
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Build both faces of a plugin package.
 * @param packageDir - absolute path or directory URL of the package root.
 * @param options - optional extra externals per face.
 * @returns the package name that was built.
 */
export async function buildPlugin(packageDir = defaultRoot, options = {}) {
  const root = resolve(typeof packageDir === 'string' ? packageDir : fileURLToPath(packageDir))
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
    external: [...HOST_EXTERNAL, ...(options.hostExternal ?? [])],
    define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
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
    external: [...PLATFORM_EXTERNAL, ...(options.clientExternal ?? [])],
    loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' },
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
  return pkg.name
}

// Runnable as a script; the exported function stays for a future build hook.
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPlugin()
