/**
 * Browser half of shell-skin.
 *
 * It occupies one seat only: `shell.overlay`, the frame-wide list slot that
 * ui-layout declares above the three columns. The splash covers the assembled
 * application for a moment and fades away; nothing here touches Sessions,
 * models, or the host.
 */
import type { Context } from '@deepseek-ai/cordis'
// import type {} from '@deepseek-ai/dsh-client-ui-renderer'      // ctx.slots
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'  // ctx.theme
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import wallpaper from '../../assets/wallpaper.jpg'

/** The slice of the client Context this plugin uses. */
// interface ClientContext {
//   effect(register: () => () => void): () => void
//   slots: {
//     inject(name: string, factory: () => () => void): () => void
//     register(options: { name: string; id: string }, component: () => ReactElement | null): () => void
//   }
// }

/** Build the plugin's browser identity. */
export const name = 'shell-skin'
/** `slots` is the only service this plugin reads. */
export const inject = ['slots', 'theme']

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
    background: center / cover no-repeat fixed url("${wallpaper}");
  }
`

/**
 * Register the splash into the frame-wide overlay seat. `slots.inject` waits
 * for ui-layout to declare the slot, so plugin activation order does not
 * matter.
 * @param ctx - the client Context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'shell-skin.splash' },
    Splash,
  ))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = SKIN_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.effect(() => 
    ctx.theme.overrideTokens('shell-skin', {
      '--dsw-alias-bg-base': {
        light: 'rgba(255, 255, 255, 0.80)',
        dark: 'rgba(12, 14, 20, 0.55)',
      },
      '--dsw-specific-sidebar-fill': {
        light: 'rgba(246, 247, 249, 0.78)',
        dark: 'rgba(18, 20, 28, 0.45)',
      },
    })
  )
}
