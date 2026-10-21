/**
 * Load the built client bundle the way the DSH web shell does, without a
 * browser: install a fake `window.__ModuleLoader__`, run the closure factory
 * with a real `react` module, and apply the plugin against a fake Context.
 *
 * It catches the mistakes that only surface at load time — a wrong
 * registration id, a missing export, a stale slot name — and pins the two
 * behaviours the host settings drive: the splash registration and the theme
 * override layer.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const nodeRequire = createRequire(join(pkgRoot, 'package.json'))
// The shell seeds its UI primitives in the module table; Node cannot load that
// package here (it carries CSS), so the loader hands back a stub instead.
const SHARED_PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'
const require = specifier => specifier === SHARED_PRIMITIVES
  ? { Switch: () => null }
  : nodeRequire(specifier)
const source = readFileSync(join(pkgRoot, 'lib/client.js'), 'utf8')

// apply() injects its stylesheet through the DOM; a bare stub is enough here.
globalThis.document = {
  documentElement: { style: { setProperty() {}, removeProperty() {} } },
  createElement: () => ({ textContent: '', remove() {} }),
  head: { appendChild() {} },
}

/** Evaluate the bundle with a fresh module loader and return its exports. */
function loadBundle() {
  let registration
  globalThis.window = { __ModuleLoader__: { load: value => { registration = value } } }
  new Function('window', 'require', source)(globalThis.window, require)
  assert.equal(registration.id, pkg.name, 'bundle id must equal the package name')
  return registration.factory(require)
}

/** Apply the plugin against a fake Context and record what it registered. */
function applyWith(settings) {
  globalThis.__SHELL_SKIN__ = settings
  const plugin = loadBundle()
  assert.equal(typeof plugin.apply, 'function', 'client plugin must export apply')
  assert.deepEqual(plugin.inject, ['slots', 'theme', 'locale', 'configForms'], 'inject must declare its services')

  const calls = []
  plugin.apply({
    get: () => undefined,
    locale: { register: () => () => {} },
    effect: execute => { calls.push('effect'); return execute() },
    slots: {
      inject: (slot, factory) => { calls.push(`inject:${slot}`); return factory() },
      register: options => { calls.push(`register:${options.name}#${options.key ?? options.id}`); return () => {} },
    },
    theme: {
      overrideTokens: (source, tokens) => {
        calls.push(`theme:${source}:${Object.keys(tokens).sort().join(',')}`)
        return () => {}
      },
    },
  })
  return calls
}

const defaults = applyWith(undefined)
assert.ok(defaults.includes('inject:shell.overlay'), 'defaults must wait on shell.overlay')
assert.ok(defaults.some(call => call.startsWith('register:shell.overlay#')), 'defaults must render the splash')
assert.ok(defaults.some(call => call.startsWith('register:settings.section#')), 'must offer a settings section')
assert.ok(defaults.some(call => call.startsWith('theme:shell-skin:')), 'must stack a theme override layer')

const muted = applyWith({ splash: false })
assert.ok(!muted.some(call => call.startsWith('register:shell.overlay#')), 'splash: false must not register the splash')
assert.ok(muted.some(call => call.startsWith('register:settings.section#')), 'splash: false must keep the settings section')
assert.ok(muted.some(call => call.startsWith('theme:shell-skin:')), 'splash: false must keep the token layer')

console.log(`ok ${pkg.name}: defaults[${defaults.join(' | ')}] muted[${muted.join(' | ')}]`)
