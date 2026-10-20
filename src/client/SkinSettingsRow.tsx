/**
 * The row config page the Plugins page mounts for `shell-skin`.
 *
 * The page hands over two owner props: `view` (the description line or the
 * page body) and `form` — the settings snapshot plus its mutate function,
 * resolved from the row's own namespace. Everything here is a controlled view
 * of that snapshot; writes go back through `form.mutate`.
 */
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { en, type SkinKey } from './locales.ts'
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

/** Values projected from the row's volatile config fields. */
export interface SkinConfigValues {
  /** Play the startup flourish. */
  splash: boolean
  /** Panel opacity over the wallpaper in the light palette. */
  lightOpacity: number
  /** Panel opacity over the wallpaper in the dark palette. */
  darkOpacity: number
  /** Pre-plugin canvas color in the light palette. */
  bootColorLight: string
  /** Pre-plugin canvas color in the dark palette. */
  bootColorDark: string
  /** Let the wallpaper show through the sidebar. */
  sidebarWallpaper: boolean
  /** Sidebar opacity over the wallpaper, both palettes. */
  sidebarOpacity: number
  /** Use the image stored in this browser. */
  customWallpaper: boolean
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: boolean
}

/** One settings write the Plugins page accepts. */
export interface SkinConfigOp {
  /** Set or clear one field. */
  op: 'set' | 'unset'
  /** Field path inside the row namespace. */
  path: string[]
  /** New value, for `set` only. */
  value?: unknown
}

/** The settings snapshot the page passes down. */
export interface SkinConfigState {
  /** Whether the Host serves this row's namespace yet. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Current values, absent until the first read settles. */
  value?: Partial<SkinConfigValues>
  /** Namespace revision used to fence writes. */
  revision?: number
  /** Whether the Host accepts edits. */
  writable: boolean
}

/** Owner props of this slot: the two views the Plugins page renders. */
export interface SkinSettingsRowProps {
  /** `summary` fills the description line; `page` renders the body. */
  view: 'summary' | 'page'
  /** Namespace translator supplied by the slot registration. */
  t?(key: SkinKey): string
  /** Repaint the skin without persisting, used while a control is dragged. */
  preview?(patch: Partial<SkinConfigValues>): void
  /** Store a picked image in this browser and show it. */
  setWallpaper?(file: File): Promise<void>
  /** Drop the stored image and fall back to the bundled wallpaper. */
  clearWallpaper?(): Promise<void>
  /** Row settings face, absent while the namespace is not served. */
  form?: {
    state: SkinConfigState
    mutate(ops: readonly SkinConfigOp[], revision?: number): Promise<boolean>
  }
}

const label = { fontSize: 13, color: 'var(--dsw-alias-label-primary, #111)' } as const
const hint = { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } as const
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '6px 0' } as const

/** Fallback values mirror the host schema defaults. */
const DEFAULTS: SkinConfigValues = {
  splash: true,
  lightOpacity: 0.8,
  darkOpacity: 0.55,
  bootColorLight: '#ffffff',
  bootColorDark: '#0c0f15',
  sidebarWallpaper: true,
  sidebarOpacity: 0.68,
  customWallpaper: false,
  bundledWallpaper: true,
}

/**
 * Render the row config page.
 * @param props - owner props supplied by the Plugins page.
 * @returns the description line, the form, or null while nothing is known.
 */
export function SkinSettingsRow({ view, form, preview, setWallpaper, clearWallpaper, t }: SkinSettingsRowProps): ReactElement | null {
  // Dragging a range fires `change` per pixel. Staging the preview locally and
  // committing once on release keeps the Host at one write per gesture instead
  // of one per frame.
  /** Translate a key, falling back to the English dictionary outside a locale host. */
  const copy = (key: SkinKey): string => t?.(key) ?? en[key]
  const [draft, setDraft] = useState<Partial<SkinConfigValues>>({})
  const [pickedName, setPickedName] = useState<string | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Partial<SkinConfigValues>>({})
  const commitTimer = useRef<number | undefined>(undefined)
  // A colour picker fires change per movement; land one write after the drag.
  useEffect(() => () => { window.clearTimeout(commitTimer.current) }, [])

  if (form === undefined) return null
  const state = form.state
  const value: SkinConfigValues = { ...DEFAULTS, ...state.value, ...draft }

  if (view === 'summary') {
    return (
      <span>
        {`${copy(value.splash ? 'summary.splashOn' : 'summary.splashOff')} · ${copy('summary.light')} ${value.lightOpacity} · ${copy('summary.dark')} ${value.darkOpacity}`}
      </span>
    )
  }

  if (state.value === undefined) return <p style={hint}>Loading settings…</p>

  const write = (field: keyof SkinConfigValues, next: boolean | number | string): void => {
    setDraft(current => ({ ...current, [field]: next }))
    pending.current[field] = next as never
  }
  const commit = (): void => {
    const ops = Object.entries(pending.current).map(([field, next]) => (
      { op: 'set' as const, path: [field], value: next }
    ))
    if (ops.length === 0) return
    pending.current = {}
    void form.mutate(ops).then(accepted => { if (accepted) setDraft({}) })
  }
  const commitSoon = (): void => {
    window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => { commit() }, 350)
  }
  const [wallpaperError, setWallpaperError] = useState<string | undefined>(undefined)
  const pickWallpaper = async (file: File | undefined): Promise<void> => {
    if (file === undefined || setWallpaper === undefined) return
    if (!file.type.startsWith('image/')) {
      setWallpaperError(copy('image.errorType'))
      return
    }
    try {
      setWallpaperError(undefined)
      await setWallpaper(file)
      write('customWallpaper', true)
      commit()
    } catch (error) {
      setWallpaperError(error instanceof Error ? error.message : copy('image.errorStore'))
    }
  }
  const resetWallpaper = async (): Promise<void> => {
    if (clearWallpaper === undefined) return
    try {
      setWallpaperError(undefined)
      await clearWallpaper()
    } catch (error) {
      setWallpaperError(error instanceof Error ? error.message : copy('image.errorClear'))
    }
  }
  const disabled = !state.writable

  return (
    <div style={{ display: 'grid', gap: 4, maxWidth: 520 }}>
      <label style={row}>
        <span style={label}>
          {copy('splash.title')}
          <br />
          <span style={hint}>{copy('splash.description')}</span>
        </span>
        <Switch
          checked={value.splash}
          label={copy('splash.title')}
          disabled={disabled}
          onChange={next => { write('splash', next); commit() }}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('lightOpacity.title')}
          <br />
          <span style={hint}>{copy('lightOpacity.description')}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.lightOpacity}
          disabled={disabled}
          onChange={event => {
            const next = Number(event.target.value)
            write('lightOpacity', next)
            preview?.({ lightOpacity: next })
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('darkOpacity.title')}
          <br />
          <span style={hint}>{copy('darkOpacity.description')}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.darkOpacity}
          disabled={disabled}
          onChange={event => {
            const next = Number(event.target.value)
            write('darkOpacity', next)
            preview?.({ darkOpacity: next })
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('sidebarWallpaper.title')}
          <br />
          <span style={hint}>{copy('sidebarWallpaper.description')}</span>
        </span>
        <Switch
          checked={value.sidebarWallpaper}
          label={copy('sidebarWallpaper.title')}
          disabled={disabled}
          onChange={next => { write('sidebarWallpaper', next); commit() }}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('sidebarOpacity.title')}
          <br />
          <span style={hint}>{copy('sidebarOpacity.description')}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.sidebarOpacity}
          disabled={disabled || !value.sidebarWallpaper}
          onChange={event => {
            const next = Number(event.target.value)
            write('sidebarOpacity', next)
            preview?.({ sidebarOpacity: next })
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('bootLight.title')}
          <br />
          <span style={hint}>{copy('bootLight.description')}</span>
        </span>
        <input
          type="color"
          value={value.bootColorLight}
          disabled={disabled}
          onChange={event => {
            write('bootColorLight', event.target.value)
            preview?.({ bootColorLight: event.target.value })
            commitSoon()
          }}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('bootDark.title')}
          <br />
          <span style={hint}>{copy('bootDark.description')}</span>
        </span>
        <input
          type="color"
          value={value.bootColorDark}
          disabled={disabled}
          onChange={event => {
            write('bootColorDark', event.target.value)
            preview?.({ bootColorDark: event.target.value })
            commitSoon()
          }}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('custom.title')}
          <br />
          <span style={hint}>{copy('custom.description')}</span>
        </span>
        <Switch
          checked={value.customWallpaper}
          label={copy('custom.title')}
          disabled={disabled}
          onChange={next => { write('customWallpaper', next); commit() }}
        />
      </label>

      <label style={row}>
        <span style={label}>
          {copy('bundled.title')}
          <br />
          <span style={hint}>{copy('bundled.description')}</span>
        </span>
        <Switch
          checked={value.bundledWallpaper}
          label={copy('bundled.title')}
          disabled={disabled}
          onChange={next => { write('bundledWallpaper', next); commit() }}
        />
      </label>

      {value.customWallpaper ? (
        <div style={row}>
          <span style={label}>
            {copy('image.title')}
            <br />
            <span style={hint}>{copy('image.description')}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ ...hint, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickedName === undefined ? copy('image.none') : `${copy('image.selected')}: ${pickedName}`}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={disabled}
              style={{ display: 'none' }}
              onChange={event => {
                const file = event.target.files?.[0]
                setPickedName(file?.name)
                void pickWallpaper(file)
                event.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => inputRef.current?.click()}
            >
              {copy('image.choose')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => { setPickedName(undefined); void resetWallpaper() }}
            >
              {copy('image.remove')}
            </Button>
          </span>
        </div>
      ) : null}

      {wallpaperError === undefined ? null : <p style={hint}>{wallpaperError}</p>}

      {state.writable ? null : <p style={hint}>{copy('profile.locked')}</p>}
    </div>
  )
}
