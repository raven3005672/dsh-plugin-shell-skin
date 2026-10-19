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
  /** Use the wallpaper the user uploaded in this browser. */
  customWallpaper: Volatile<boolean>
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: Volatile<boolean>
}

export const Config = z.object({
  splash: z.boolean().default(true).volatile(),
  lightOpacity: z.number().min(0).max(1).default(0.85).volatile(),
  darkOpacity: z.number().min(0).max(1).default(0.55).volatile(),
  bootColorLight: z.string().default('#ffffff').volatile(),
  bootColorDark: z.string().default('#0c0f15').volatile(),
  customWallpaper: z.boolean().default(false).volatile(),
  bundledWallpaper: z.boolean().default(true).volatile(),
})

/**
 * CSS for the pre-plugin interval. The boot page paints with the same alias
 * tokens the app uses, so overriding them here keeps the first paint in the
 * skin's colors instead of the default canvas.
 * @param config - resolved row configuration.
 * @returns one stylesheet body for the index head.
 */
function bootStyle(config: Config): string {
  const light = config.bootColorLight.get()
  const dark = config.bootColorDark.get()
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
        bootColorLight: config.bootColorLight.get(),
        bootColorDark: config.bootColorDark.get(),
        customWallpaper: config.customWallpaper.get(),
        bundledWallpaper: config.bundledWallpaper.get(),
      },
    })
  })
}
