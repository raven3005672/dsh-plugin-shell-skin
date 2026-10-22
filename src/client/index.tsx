/**
 * Browser half of shell-skin.
 *
 * It reads the settings the host half injects, stacks the skin's token layer
 * on the active theme, and occupies one seat: `shell.overlay`, the frame-wide
 * list slot ui-layout declares above the three columns. Nothing here touches
 * Sessions or model requests.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import wallpaperArc from '../../assets/wallpaper-arc.jpg'
import wallpaperAurora from '../../assets/wallpaper-aurora.jpg'
import wallpaperWhale from '../../assets/wallpaper-whale.jpg'
import { en, zh, type SkinKey } from './locales.ts'
import { SkinSettingsSection } from './SkinSettingsSection.tsx'
import { addWallpaper, loadActiveId, loadLastPick, loadWallpapers, removeWallpaper, saveActiveId, saveLastPick, type StoredWallpaper } from './wallpaper-store.ts'


/**
 * T-shirt glyph from Ant Design Icons' `SkinOutlined` (MIT license), used as the
 * Settings nav mark. The path is a compound outline: the neckline and body are
 * cutouts, so it keeps a clean weight at 16px without extra strokes.
 */
const NAV_GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">`
  + `<path fill="#000" d="M870 126H663.8c-17.4 0-32.9 11.9-37 29.3C614.3 208.1 567 246 512 246s-102.3-37.9-114.8-90.7a37.93 37.93 0 0 0-37-29.3H154a44 44 0 0 0-44 44v252a44 44 0 0 0 44 44h75v388a44 44 0 0 0 44 44h478a44 44 0 0 0 44-44V466h75a44 44 0 0 0 44-44V170a44 44 0 0 0-44-44zm-28 268H723v432H301V394H182V198h153.3c28.2 71.2 97.5 120 176.7 120s148.5-48.8 176.7-120H842v196z"/></svg>`

/** Bundled artwork choices, in settings order. */
const PRESETS: readonly { id: string; src: string; labelKey: SkinKey }[] = [
  { id: 'aurora', src: wallpaperAurora, labelKey: 'preset.aurora' },
  { id: 'arc', src: wallpaperArc, labelKey: 'preset.arc' },
  { id: 'whale', src: wallpaperWhale, labelKey: 'preset.whale' },
]

/** Fast lookup for the applied background. */
const PRESET_SOURCES: Record<string, string> = Object.fromEntries(PRESETS.map(item => [item.id, item.src]))

/** Preset used when the config names one that no longer ships. */
const DEFAULT_PRESET = 'aurora'

/**
 * Normalise a preset id from config.
 * @param value - the raw value, possibly stale or hand-edited.
 * @returns a known preset id.
 */
function presetId(value: unknown): string {
  return typeof value === 'string' && value in PRESET_SOURCES ? value : DEFAULT_PRESET
}

/** Copy namespace this plugin owns. */
const LOCALE_NS = 'shellSkin'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Row config page copy. */
    shellSkin: SkinKey
  }
}

/** Build the plugin's browser identity. */
export const name = 'shell-skin'
/** Services this plugin reads. */
export const inject = ['slots', 'theme', 'locale', 'configForms']

/** Settings the host half injects into the boot HTML. */
interface SkinSettings {
  /** Play the startup flourish. */
  splash: boolean
  /** Panel opacity over the wallpaper in the light palette. */
  lightOpacity: number
  /** Panel opacity over the wallpaper in the dark palette. */
  darkOpacity: number
  /** Colour behind the wallpaper in the light palette. */
  bootColorLight: string
  /** Colour behind the wallpaper in the dark palette. */
  bootColorDark: string
  /** Let the wallpaper show through the sidebar. */
  sidebarWallpaper: boolean
  /** Sidebar opacity over the wallpaper, both palettes. */
  sidebarOpacity: number
  /** Use the images stored in this browser. */
  customWallpaper: boolean
  /** Pick one of the stored images at random on every start. */
  randomWallpaper: boolean
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: boolean
  /** Which bundled artwork to use: a PRESETS id. */
  bundledPreset: string
  /** Package version, injected by the host for the settings footer. */
  version?: string
}

const FALLBACK_SETTINGS: SkinSettings = {
  splash: true,
  lightOpacity: 0.85,
  darkOpacity: 0.55,
  bootColorLight: '#ffffff',
  bootColorDark: '#0c0f15',
  sidebarWallpaper: true,
  sidebarOpacity: 0.68,
  customWallpaper: false,
  randomWallpaper: false,
  bundledWallpaper: true,
  bundledPreset: 'aurora',
}

/** Accept only a hex colour from the injected settings. */
function hexColor(value: string | undefined, fallback: string): string {
  return value !== undefined && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback
}

/** Read `__SHELL_SKIN__`, falling back when the row is mounted without a host injection. */
function readSettings(): SkinSettings {
  const injected = (globalThis as Record<string, unknown>).__SHELL_SKIN__ as Partial<SkinSettings> | undefined
  return {
    splash: injected?.splash ?? FALLBACK_SETTINGS.splash,
    lightOpacity: injected?.lightOpacity ?? FALLBACK_SETTINGS.lightOpacity,
    darkOpacity: injected?.darkOpacity ?? FALLBACK_SETTINGS.darkOpacity,
    bootColorLight: hexColor(injected?.bootColorLight, FALLBACK_SETTINGS.bootColorLight),
    bootColorDark: hexColor(injected?.bootColorDark, FALLBACK_SETTINGS.bootColorDark),
    sidebarWallpaper: injected?.sidebarWallpaper ?? FALLBACK_SETTINGS.sidebarWallpaper,
    sidebarOpacity: injected?.sidebarOpacity ?? FALLBACK_SETTINGS.sidebarOpacity,
    customWallpaper: injected?.customWallpaper ?? FALLBACK_SETTINGS.customWallpaper,
    randomWallpaper: injected?.randomWallpaper ?? FALLBACK_SETTINGS.randomWallpaper,
    bundledWallpaper: injected?.bundledWallpaper ?? FALLBACK_SETTINGS.bundledWallpaper,
    bundledPreset: presetId(injected?.bundledPreset ?? FALLBACK_SETTINGS.bundledPreset),
    version: injected?.version,
  }
}

const settings = readSettings()

/** Settings namespace this plugin owns: the row id in the profile patch. */
const SETTINGS_NAMESPACE = 'dsh-plugin-shell-skin'

/** The slice of the settings form controller used for live preview. */
interface ConfigFormLike {
  getSnapshot(): { value?: Partial<SkinSettings> }
  subscribe(listener: () => void): () => void
}

/** The slice of the settings service used to find that form. */
interface ConfigFormsLike {
  get(id: string): ConfigFormLike
}

/** Sidebars read as one shade denser than the main surface. */
/** Sidebar is opaque when the wallpaper stops there. */

/**
 * Format one translucent color.
 * @param rgb - comma-separated channels.
 * @param opacity - resolved opacity, clamped at zero.
 * @returns a CSS `rgba()` value.
 */
function rgba(rgb: string, opacity: number): string {
  return `rgba(${rgb}, ${Math.max(0, opacity).toFixed(2)})`
}

/**
 * Resolve the sidebar fill alpha: opaque without the wallpaper, the chosen
 * value with it.
 * @param value - current settings.
 * @returns alpha in [0, 1].
 */
function sidebarAlpha(value: SkinSettings): number {
  return value.sidebarWallpaper ? value.sidebarOpacity : 1
}

const HOLD_MS = 1100
const FADE_MS = 420

const KEYFRAMES = `
@keyframes shell-skin-ring {
  0% { transform: scale(0.6); opacity: 0.85; }
  70% { opacity: 0.12; }
  100% { transform: scale(2.4); opacity: 0; }
}
@keyframes shell-skin-mark {
  0% { opacity: 0; transform: translateY(6px); letter-spacing: 0.5em; }
  100% { opacity: 1; transform: translateY(0); letter-spacing: 0.32em; }
}
@keyframes shell-skin-glow {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.7; }
}
`

const layer = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  background: 'radial-gradient(120% 90% at 50% 18%, #1a2230 0%, #0c0f15 62%, #07080b 100%)',
  transition: `opacity ${FADE_MS}ms ease`,
} as const

const mark = {
  position: 'relative',
  zIndex: 1,
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'rgba(226, 233, 245, 0.86)',
  animation: 'shell-skin-mark 620ms cubic-bezier(0.22, 1, 0.36, 1) both',
} as const

const ringBase = {
  position: 'absolute',
  width: 132,
  height: 132,
  borderRadius: '50%',
  border: '1px solid rgba(120, 170, 255, 0.55)',
  animation: 'shell-skin-ring 1600ms cubic-bezier(0.16, 1, 0.3, 1) infinite',
} as const

const halo = {
  position: 'absolute',
  width: 260,
  height: 260,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(90, 140, 255, 0.28) 0%, rgba(90, 140, 255, 0) 68%)',
  animation: 'shell-skin-glow 2400ms ease-in-out infinite',
} as const

/**
 * The startup flourish. It removes itself after the fade so the overlay layer
 * keeps no persistent child.
 */
function Splash(): ReactElement | null {
  const [phase, setPhase] = useState<'hold' | 'fade' | 'done'>('hold')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('done')
      return
    }
    const fade = window.setTimeout(() => setPhase('fade'), HOLD_MS)
    const done = window.setTimeout(() => setPhase('done'), HOLD_MS + FADE_MS)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(done)
    }
  }, [])

  if (phase === 'done') return null

  return createPortal(
    <div
      aria-hidden
      data-shell-skin="splash"
      style={phase === 'fade' ? { ...layer, opacity: 0 } : layer}
    >
      <style>{KEYFRAMES}</style>
      <div style={halo} />
      <div style={ringBase} />
      <div style={{ ...ringBase, animationDelay: '320ms' }} />
      <div style={{ ...ringBase, animationDelay: '640ms' }} />
      <div style={mark}>shell-skin</div>
    </div>,
    document.body,
  )
}

const SKIN_CSS = `
  html,
  /* Desktop: the shell's own rule is html[data-platform=darwin]{background:transparent},
     and its shorthand outranks a bare html selector, so repeat the paint with the
     same attribute plus :root to win the cascade. */
  html[data-platform='darwin']:root {
    --shell-skin-boot-light: ${settings.bootColorLight};
    --shell-skin-boot-dark: ${settings.bootColorDark};
    background-color: var(--shell-skin-boot-light);
    background-image: var(--shell-skin-wallpaper, var(--shell-skin-bundled, none));
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    background-attachment: fixed;
  }
  /* Desktop: the shell repaints the sidebar as a 40% mix of the fill token plus
     a blue wash, so both the wallpaper switch and the opacity slider stop
     meaning what they say. Repaint it from the token alone. */
  html[data-platform='darwin']:root [class*='sidebarCol'] {
    background-color: var(--dsw-specific-sidebar-fill);
    background-image: none;
  }
  /* The palette flag lives on <body>, so the colour is selected from html. */
  html:has(body[data-ds-dark-theme]),
  html[data-platform='darwin']:root:has(body[data-ds-dark-theme]) {
    background-color: var(--shell-skin-boot-dark);
  }
  /* The host half paints the boot canvas; the page itself must stay clear so
     the wallpaper shows through the theme's translucent panels. The dark rule
     repeats the attribute selector because the host's boot stylesheet uses it
     too, and (0,1,1) would outrank a plain (0,0,2) here. */
  html body,
  html body[data-ds-dark-theme] {
    background: transparent;
  }
  /* The conversation column paints the same base token again above the frame,
     so its wallpaper reads double-tinted next to a global panel. Neutralise
     that layer; the phase attribute is the only stable hook it exposes. */
  /* Per-thumbnail delete: a quiet chip that only turns red on its own hover. */
  .shell-skin-thumb .shell-skin-thumb-delete {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0.5px solid var(--dsw-alias-border-l3);
    border-radius: 50%;
    background: var(--dsw-alias-bg-module-platform);
    color: var(--dsw-alias-label-secondary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, background-color 120ms ease, color 120ms ease;
  }
  .shell-skin-thumb:hover .shell-skin-thumb-delete,
  .shell-skin-thumb:focus-within .shell-skin-thumb-delete {
    opacity: 1;
    pointer-events: auto;
  }
  .shell-skin-thumb .shell-skin-thumb-delete:hover,
  .shell-skin-thumb .shell-skin-thumb-delete:focus-visible {
    /* Opaque danger surface: the photo must not show through the control. */
    background: var(--dsw-alias-file-diff-deleted-bg);
    color: var(--dsw-alias-state-error-primary);
    outline: none;
  }
  @media (hover: none) {
    .shell-skin-thumb .shell-skin-thumb-delete { opacity: 1; pointer-events: auto; }
  }
  html [data-phase='hero'],
  html [data-phase='active'],
  html [data-phase='settling'] {
    background: transparent;
  }
`

/**
 * Stack the skin's token layer on the active theme.
 * @param ctx - client Context owning the theme service.
 * @param value - opacities to resolve into the two surface tokens.
 * @returns the disposer removing the layer this call registered.
 */
function applyTokens(ctx: Context, value: SkinSettings): () => void {
  return ctx.theme.overrideTokens('shell-skin', {
    '--dsw-alias-bg-base': {
      light: rgba('255, 255, 255', value.lightOpacity),
      dark: rgba('12, 14, 20', value.darkOpacity),
    },
    '--dsw-specific-sidebar-fill': {
      light: rgba('246, 247, 249', sidebarAlpha(value)),
      dark: rgba('18, 20, 28', sidebarAlpha(value)),
    },
  })
}

/**
 * Register the splash into the frame-wide overlay seat. `slots.inject` waits
 * for ui-layout to declare the slot, so plugin activation order does not
 * matter.
 * @param ctx - the client Context.
 */
export function apply(ctx: Context): void {
  // Wallpaper precedence: a stored image when the user asks for it, else the
  // bundled artwork when that is on, else no image at all (boot colour only).
  let wallpapers: StoredWallpaper[] = []
  const wallpaperUrls = new Map<string, string>()
  let activeId: string | undefined
  /** Chosen once per page load while random mode is on, so sliders do not reshuffle. */
  let randomPickId: string | undefined
  /** The image random mode chose last start, so the next one differs. */
  let lastPickId: string | undefined
  /** Settings rows asking to repaint their gallery after a store write. */
  const wallpaperListeners = new Set<() => void>()
  let currentValues = settings
  let disposeTokens: (() => void) | undefined
  let disposeSplash: (() => void) | undefined

  /** Register or drop the splash seat as the setting changes. */
  const syncSplash = (enabled: boolean): void => {
    if (enabled) {
      if (disposeSplash !== undefined) return
      disposeSplash = ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'shell-skin.splash' },
        Splash,
      ))
      return
    }
    if (disposeSplash === undefined) return
    disposeSplash()
    disposeSplash = undefined
  }

  /** Object URL for one stored image, created on first use. */
  const urlFor = (id: string): string | undefined => {
    const image = wallpapers.find(item => item.id === id)
    if (image === undefined) return undefined
    const cached = wallpaperUrls.get(id)
    if (cached !== undefined) return cached
    const url = URL.createObjectURL(image.blob)
    wallpaperUrls.set(id, url)
    return url
  }

  /** Drop one cached object URL. */
  const releaseUrl = (id: string): void => {
    const url = wallpaperUrls.get(id)
    if (url === undefined) return
    URL.revokeObjectURL(url)
    wallpaperUrls.delete(id)
  }

  /** Drop every cached object URL. */
  const releaseUrls = (): void => {
    for (const url of wallpaperUrls.values()) URL.revokeObjectURL(url)
    wallpaperUrls.clear()
  }

  /** Pick a stored image at random, avoiding last start's pick when there is a choice. */
  const pickRandom = (): string | undefined => {
    if (wallpapers.length === 0) return undefined
    const pool = wallpapers.length > 1 && lastPickId !== undefined
      ? wallpapers.filter(item => item.id !== lastPickId)
      : wallpapers
    const picked = pool[Math.floor(Math.random() * pool.length)]?.id
    if (picked !== undefined) {
      lastPickId = picked
      void saveLastPick(picked).catch(() => { /* the pick still applies for this load */ })
    }
    return picked
  }

  /** Tell mounted settings rows that the stored images changed. */
  const notifyWallpapers = (): void => {
    for (const listener of wallpaperListeners) listener()
  }

  /** Apply the wallpaper the current settings ask for. */
  const applyWallpaper = (): void => {
    const root = document.documentElement
    if (currentValues.customWallpaper && wallpapers.length > 0) {
      // Random mode chooses once per page load; otherwise the gallery's
      // selection decides.
      if (currentValues.randomWallpaper && randomPickId === undefined) randomPickId = pickRandom()
      const id = currentValues.randomWallpaper ? randomPickId : (activeId ?? wallpapers[0]?.id)
      const url = id === undefined ? undefined : urlFor(id)
      if (url !== undefined) {
        root.style.setProperty('--shell-skin-wallpaper', `url("${url}")`)
        if (id !== undefined) root.dataset.shellSkinWallpaper = id
        return
      }
    }
    delete root.dataset.shellSkinWallpaper
    if (currentValues.bundledWallpaper) {
      const preset = PRESET_SOURCES[currentValues.bundledPreset] ?? PRESET_SOURCES[DEFAULT_PRESET]
      root.style.setProperty('--shell-skin-bundled', `url("${preset}")`)
      root.style.removeProperty('--shell-skin-wallpaper')
      return
    }
    root.style.setProperty('--shell-skin-wallpaper', 'none')
  }

  /**
   * Apply every visual setting at once: token layer, boot colours, wallpaper.
   * @param next - the settings to make current.
   */
  const applyNow = (next: SkinSettings): void => {
    const randomTurnedOn = next.randomWallpaper && !currentValues.randomWallpaper
    currentValues = next
    if (randomTurnedOn) randomPickId = pickRandom()
    disposeTokens?.()
    disposeTokens = applyTokens(ctx, next)
    // Boot colours stay visible after mount: they sit behind the wallpaper and
    // show while it decodes. Inline variables make them the live channel.
    const root = document.documentElement
    root.style.setProperty('--shell-skin-boot-light', next.bootColorLight)
    root.style.setProperty('--shell-skin-boot-dark', next.bootColorDark)
    applyWallpaper()
    syncSplash(next.splash)
  }

  applyNow(settings)

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'shell-skin',
    order: 30,
    label: () => ctx.locale.bind(LOCALE_NS)('nav'),
    locale: LOCALE_NS,
    inject: () => ({
      // Preview during a drag: repaint locally, without a Host round trip.
      // The release still persists once.
      preview: (patch: Partial<SkinSettings>) => { applyNow({ ...currentValues, ...patch }) },
      form: ctx.configForms.get(SETTINGS_NAMESPACE),
      version: currentValues.version,
      presets: PRESETS,
      // Uploads never reach the Host: files stay in this browser's IndexedDB
      // and only their Blob URLs are applied.
      subscribeWallpapers: (listener: () => void) => {
        wallpaperListeners.add(listener)
        return () => { wallpaperListeners.delete(listener) }
      },
      listWallpapers: () => wallpapers.map(image => ({
        id: image.id,
        ...image.name === undefined ? {} : { name: image.name },
        url: urlFor(image.id) ?? '',
      })),
      activeWallpaperId: () => activeId,
      addWallpaper: async (file: File) => {
        wallpapers = await addWallpaper(file)
        const added = wallpapers[wallpapers.length - 1]
        if (activeId === undefined && added !== undefined) {
          activeId = added.id
          await saveActiveId(activeId)
        }
        notifyWallpapers()
        applyWallpaper()
      },
      removeWallpaper: async (id: string) => {
        wallpapers = await removeWallpaper(id)
        releaseUrl(id)
        if (randomPickId === id) randomPickId = undefined
        if (activeId === id) {
          activeId = wallpapers[0]?.id
          await saveActiveId(activeId)
        }
        notifyWallpapers()
        applyWallpaper()
      },
      selectWallpaper: async (id: string) => {
        activeId = id
        await saveActiveId(id)
        notifyWallpapers()
        applyWallpaper()
      },
    }),
  }, SkinSettingsSection))

  // The Settings shell picks nav icons from a fixed id map, so a plugin cannot
  // declare one. Mask a filled glyph into the row the way the shell's own icons
  // are drawn: hide its svg and paint ours through ::before with currentColor.
  ctx.effect(() => {
    const mask = `url("data:image/svg+xml,${encodeURIComponent(NAV_GLYPH)}")`
    const style = document.createElement('style')
    style.dataset.pluginCss = 'shell-skin/nav-icon.css'
    style.textContent = [
      `[data-shell-skin-nav] [class*="navIcon"]{display:none}`,
      `[data-shell-skin-nav]::before{content:"";flex:none;width:16px;height:16px;`
        + `background-color:currentColor;-webkit-mask:${mask} center/16px 16px no-repeat;`
        + `mask:${mask} center/16px 16px no-repeat}`,
    ].join('')
    document.head.appendChild(style)

    const apply = (): void => {
      const dialog = document.querySelector('[data-shortcut-modal="settings"]')
      if (dialog === null) return
      const label = ctx.locale.bind(LOCALE_NS)('nav')
      const list = dialog.querySelector('[class*="navList"]')
      if (list === null) return
      for (const cell of list.querySelectorAll('[class*="navCell"]')) {
        if (cell.getAttribute('data-shell-skin-nav') !== null) continue
        if (cell.querySelector('[class*="navLabel"]')?.textContent === label) {
          cell.setAttribute('data-shell-skin-nav', '')
        }
      }
    }

    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; apply() })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    apply()
    return () => { observer.disconnect(); style.remove() }
  })

  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = SKIN_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })

  // Stored images outlive the document as Blobs, so they come back on every
  // load; the CSS variable only carries the current object URL.
  ctx.effect(() => {
    let live = true
    void (async () => {
      try {
        wallpapers = await loadWallpapers()
        activeId = await loadActiveId()
        lastPickId = await loadLastPick()
        if (activeId !== undefined && !wallpapers.some(image => image.id === activeId)) {
          activeId = wallpapers[0]?.id
        }
        if (lastPickId !== undefined && !wallpapers.some(image => image.id === lastPickId)) {
          lastPickId = undefined
        }
        if (!live) return
        notifyWallpapers()
        applyWallpaper()
      } catch {
        /* storage refused the read; the settings choose the fallback */
      }
    })()
    return () => { live = false; releaseUrls() }
  })

  ctx.effect(() => {
    const forms = ctx.get('configForms') as ConfigFormsLike | undefined
    if (forms === undefined) return () => { disposeTokens?.() }

    const form = forms.get(SETTINGS_NAMESPACE)
    const sync = (): void => {
      const value = form.getSnapshot().value
      if (value === undefined) return
      // An old profile may still name a preset that no longer ships.
      applyNow({ ...currentValues, ...value, bundledPreset: presetId(value.bundledPreset) })
    }
    // Subscribe before the first read: a change landing between the read and
    // the subscription would otherwise be lost. The replay is idempotent.
    const unsubscribe = form.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      disposeTokens?.()
      disposeSplash?.()
    }
  })
}
