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
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'  // ctx.theme
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import wallpaper from '../../assets/wallpaper.jpg'
import { en, zh, type SkinKey } from './locales.ts'
import { SkinSettingsRow } from './SkinSettingsRow.tsx'
import { clearStoredWallpaper, loadWallpaper, saveWallpaper } from './wallpaper-store.ts'


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
export const inject = ['slots', 'theme', 'locale']

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
  /** Use the image stored in this browser. */
  customWallpaper: boolean
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: boolean
}

const FALLBACK_SETTINGS: SkinSettings = {
  splash: true,
  lightOpacity: 0.85,
  darkOpacity: 0.55,
  bootColorLight: '#ffffff',
  bootColorDark: '#0c0f15',
  customWallpaper: false,
  bundledWallpaper: true,
}

/** Read `__SHELL_SKIN__`, falling back when the row is mounted without a host injection. */
function readSettings(): SkinSettings {
  const injected = (globalThis as Record<string, unknown>).__SHELL_SKIN__ as Partial<SkinSettings> | undefined
  return {
    splash: injected?.splash ?? FALLBACK_SETTINGS.splash,
    lightOpacity: injected?.lightOpacity ?? FALLBACK_SETTINGS.lightOpacity,
    darkOpacity: injected?.darkOpacity ?? FALLBACK_SETTINGS.darkOpacity,
    bootColorLight: injected?.bootColorLight ?? FALLBACK_SETTINGS.bootColorLight,
    bootColorDark: injected?.bootColorDark ?? FALLBACK_SETTINGS.bootColorDark,
    customWallpaper: injected?.customWallpaper ?? FALLBACK_SETTINGS.customWallpaper,
    bundledWallpaper: injected?.bundledWallpaper ?? FALLBACK_SETTINGS.bundledWallpaper,
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
const SIDEBAR_DELTA = 0.1

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
 * Derive the sidebar opacity from the surface opacity.
 * @param opacity - surface opacity.
 * @returns sidebar opacity, never below zero.
 */
function sidebarOpacity(opacity: number): number {
  return Math.max(0, opacity - SIDEBAR_DELTA)
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
  html {
    --shell-skin-boot-light: ${settings.bootColorLight};
    --shell-skin-boot-dark: ${settings.bootColorDark};
    background-color: var(--shell-skin-boot-light);
    background-image: var(--shell-skin-wallpaper, url("${wallpaper}"));
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    background-attachment: fixed;
  }
  /* The palette flag lives on <body>, so the colour is selected from html. */
  html:has(body[data-ds-dark-theme]) {
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
      light: rgba('246, 247, 249', sidebarOpacity(value.lightOpacity)),
      dark: rgba('18, 20, 28', sidebarOpacity(value.darkOpacity)),
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
  // Wallpaper precedence: the stored image when the user asks for it, else the
  // bundled artwork when that is on, else no image at all (boot colour only).
  let storedWallpaperUrl: string | undefined
  let currentValues = settings
  let disposeTokens: (() => void) | undefined

  /** Drop the object URL backing the stored image. */
  const releaseWallpaper = (): void => {
    if (storedWallpaperUrl === undefined) return
    URL.revokeObjectURL(storedWallpaperUrl)
    storedWallpaperUrl = undefined
  }

  /** Apply the wallpaper the current settings ask for. */
  const applyWallpaper = (): void => {
    const root = document.documentElement
    if (currentValues.customWallpaper && storedWallpaperUrl !== undefined) {
      root.style.setProperty('--shell-skin-wallpaper', `url("${storedWallpaperUrl}")`)
      return
    }
    if (currentValues.bundledWallpaper) {
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
    currentValues = next
    disposeTokens?.()
    disposeTokens = applyTokens(ctx, next)
    // Boot colours stay visible after mount: they sit behind the wallpaper and
    // show while it decodes. Inline variables make them the live channel.
    const root = document.documentElement
    root.style.setProperty('--shell-skin-boot-light', next.bootColorLight)
    root.style.setProperty('--shell-skin-boot-dark', next.bootColorDark)
    applyWallpaper()
  }

  applyNow(settings)

  if (settings.splash) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register(
      { name: 'shell.overlay', id: 'shell-skin.splash' },
      Splash,
    ))
  }

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }))

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: 'dsh-plugin-shell-skin#dsh-plugin-shell-skin',
    locale: LOCALE_NS,
    inject: () => ({
      // Preview during a drag: repaint locally, without a Host round trip.
      // The release still persists once.
      preview: (patch: Partial<SkinSettings>) => { applyNow({ ...currentValues, ...patch }) },
      // The custom wallpaper never reaches the Host: the file stays in this
      // browser's IndexedDB and only its Blob URL is applied.
      setWallpaper: async (file: File) => {
        await saveWallpaper(file)
        releaseWallpaper()
        storedWallpaperUrl = URL.createObjectURL(file)
        applyWallpaper()
      },
      clearWallpaper: async () => {
        await clearStoredWallpaper()
        releaseWallpaper()
        applyWallpaper()
      },
    }),
  }, SkinSettingsRow))

  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = SKIN_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })

  // The chosen wallpaper outlives the document as a Blob, so it comes back on
  // every load; the CSS variable only carries its current object URL.
  ctx.effect(() => {
    let live = true
    void loadWallpaper().then(blob => {
      if (!live || blob === undefined) return
      storedWallpaperUrl = URL.createObjectURL(blob)
      applyWallpaper()
    }).catch(() => { /* storage refused the read; the settings choose the fallback */ })
    return () => { live = false; releaseWallpaper() }
  })

  ctx.effect(() => {
    const forms = ctx.get('configForms') as ConfigFormsLike | undefined
    if (forms === undefined) return () => { disposeTokens?.() }

    const form = forms.get(SETTINGS_NAMESPACE)
    const sync = (): void => {
      const value = form.getSnapshot().value
      if (value === undefined) return
      applyNow({ ...currentValues, ...value })
    }
    // Subscribe before the first read: a change landing between the read and
    // the subscription would otherwise be lost. The replay is idempotent.
    const unsubscribe = form.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      disposeTokens?.()
    }
  })
}
