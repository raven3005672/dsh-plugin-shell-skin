/**
 * Host half of shell-skin.
 *
 * It owns the plugin's configuration and pushes two rows into the boot HTML:
 * an early stylesheet that colors the first paint (so the app does not flash
 * the default canvas before client plugins load) and one global that carries
 * the settings to the browser half.
 */
import type { Volatile, Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'shell-skin'

/** No host service is required: the injection table is an emit on the shared Context. */
export const inject: string[] = []

/** Injected by the build from package.json. */
declare const __PKG_VERSION__: string

/** Package version, baked in at build time for the settings footer. */
function packageVersion(): string | undefined {
  return typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : undefined
}

/** Settings that reach the browser half and the pre-plugin stylesheet. */
export interface Config {
  /** Play the startup flourish on every page load. */
  splash: Volatile<boolean>
  /** Panel opacity over the wallpaper in the light palette, from 0 (clear) to 1 (opaque). */
  lightOpacity: Volatile<number>
  /** Panel opacity over the wallpaper in the dark palette. */
  darkOpacity: Volatile<number>
  /** Canvas color painted before the app mounts, in the light palette. */
  bootColorLight: Volatile<string>
  /** Canvas color painted before the app mounts, in the dark palette. */
  bootColorDark: Volatile<string>
  /** Let the wallpaper show through the sidebar. */
  sidebarWallpaper: Volatile<boolean>
  /** Sidebar opacity over the wallpaper, both palettes. */
  sidebarOpacity: Volatile<number>
  /** Use the wallpapers the user uploaded in this browser. */
  customWallpaper: Volatile<boolean>
  /** Pick one stored wallpaper at random on every start. */
  randomWallpaper: Volatile<boolean>
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: Volatile<boolean>
  /** Which bundled artwork to use: a PRESETS id from the client half. */
  bundledPreset: Volatile<string>
}

export const Config = z.object({
  splash: z.boolean().default(true).volatile(),
  lightOpacity: z.number().min(0).max(1).default(0.85).volatile(),
  darkOpacity: z.number().min(0).max(1).default(0.55).volatile(),
  bootColorLight: z.string().default('#ffffff').volatile(),
  bootColorDark: z.string().default('#0c0f15').volatile(),
  sidebarWallpaper: z.boolean().default(true).volatile(),
  sidebarOpacity: z.number().min(0).max(1).default(0.68).volatile(),
  customWallpaper: z.boolean().default(false).volatile(),
  randomWallpaper: z.boolean().default(false).volatile(),
  bundledWallpaper: z.boolean().default(true).volatile(),
  bundledPreset: z.string().default('aurora').volatile(),
})

/**
 * Accept only a hex colour from config; anything else keeps the fallback.
 * @param value - raw config value.
 * @param fallback - colour to use when the value is not a hex colour.
 * @returns a safe CSS colour.
 */
function hexColor(value: string, fallback: string): string {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback
}

/**
 * CSS for the pre-plugin interval. The boot page paints with the same alias
 * tokens the app uses, so overriding them here keeps the first paint in the
 * skin's colors instead of the default canvas.
 * @param config - resolved row configuration.
 * @returns one stylesheet body for the index head.
 */
function bootStyle(config: Config): string {
  const light = hexColor(config.bootColorLight.get(), '#ffffff')
  const dark = hexColor(config.bootColorDark.get(), '#0c0f15')
  return `html body{background:${light};--dsw-alias-bg-base:${light}}`
    + `html body[data-ds-dark-theme]{background:${dark};--dsw-alias-bg-base:${dark}}`
}

/**
 * Register the boot rows. The event is emitted on every index render, so the
 * rows always carry the current configuration.
 * @param ctx - host Context owning the listener.
 * @param config - resolved row configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'style', text: bootStyle(config) })
    table.push({
      kind: 'global',
      name: '__SHELL_SKIN__',
      value: {
        splash: config.splash.get(),
        lightOpacity: config.lightOpacity.get(),
        darkOpacity: config.darkOpacity.get(),
        bootColorLight: hexColor(config.bootColorLight.get(), '#ffffff'),
        bootColorDark: hexColor(config.bootColorDark.get(), '#0c0f15'),
        sidebarWallpaper: config.sidebarWallpaper.get(),
        sidebarOpacity: config.sidebarOpacity.get(),
        customWallpaper: config.customWallpaper.get(),
        randomWallpaper: config.randomWallpaper.get(),
        bundledWallpaper: config.bundledWallpaper.get(),
        bundledPreset: config.bundledPreset.get(),
        version: packageVersion(),
      },
    })
  })
}
