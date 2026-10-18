/**
 * Load the built client bundle the way the DSH web shell does, without a
 * browser: install a fake `window.__ModuleLoader__`, run the closure factory
 * with a real `react` module, and apply the plugin against a fake Context.
 *
 * It catches the mistakes that only surface at load time — a wrong
 * registration id, a missing export, or a stale slot name.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const require = createRequire(join(pkgRoot, 'package.json'))

let registration
globalThis.window = { __ModuleLoader__: { load: value => { registration = value } } }
new Function('window', 'require', readFileSync(join(pkgRoot, 'lib/client.js'), 'utf8'))(
  globalThis.window,
  require,
)

assert.equal(registration.id, pkg.name, 'bundle id must equal the package name')
const plugin = registration.factory(require)
assert.equal(typeof plugin.apply, 'function', 'client plugin must export apply')

const calls = []
plugin.apply({
  slots: {
    inject: (slot, factory) => { calls.push(`inject:${slot}`); return factory() },
    register: options => { calls.push(`register:${options.name}#${options.id}`); return () => {} },
  },
})

assert.ok(calls.includes('inject:shell.overlay'), 'must wait on shell.overlay')
assert.ok(
  calls.some(call => call.startsWith('register:shell.overlay#')),
  'must register into shell.overlay',
)
console.log(`ok ${pkg.name}: ${calls.join(' | ')}`)
