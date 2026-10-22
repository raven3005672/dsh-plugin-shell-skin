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
import { MAX_WALLPAPERS, wallpaperStorageAvailable } from './wallpaper-store.ts'
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
  /** Use the images stored in this browser. */
  customWallpaper: boolean
  /** Pick one stored image at random on every start. */
  randomWallpaper: boolean
  /** Fall back to the artwork shipped with the plugin. */
  bundledWallpaper: boolean
  /** Which bundled artwork to use. */
  bundledPreset: string
}

/** Largest image the browser store accepts, in bytes. */
const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024

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
  /** List the images stored in this browser, newest last. */
  listWallpapers?(): readonly { id: string; name?: string; url: string }[]
  /** Id of the image selected while random mode is off. */
  activeWallpaperId?(): string | undefined
  /** Append one picked image. */
  addWallpaper?(file: File): Promise<void>
  /** Drop one image by id. */
  removeWallpaper?(id: string): Promise<void>
  /** Make one image the active selection. */
  selectWallpaper?(id: string): Promise<void>
  /** Notify when the stored images change outside this row. */
  subscribeWallpapers?(listener: () => void): () => void
  /** Plugin version, shown at the bottom of the page. */
  version?: string
  /** Bundled artwork choices rendered as thumbnails. */
  presets?: readonly { id: string; src: string; labelKey: SkinKey }[]
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

/**
 * Render the row config page.
 * @param props - owner props supplied by the Plugins page.
 * @returns the description line, the form, or null while nothing is known.
 */
export function SkinSettingsRow({ view, form, preview, listWallpapers, activeWallpaperId, addWallpaper, removeWallpaper, selectWallpaper, subscribeWallpapers, version, presets, t }: SkinSettingsRowProps): ReactElement | null {
  // Dragging a range fires `change` per pixel. Staging the preview locally and
  // committing once on release keeps the Host at one write per gesture instead
  // of one per frame.
  /** Translate a key, falling back to the English dictionary outside a locale host. */
  const copy = (key: SkinKey): string => t?.(key) ?? en[key]
  const [draft, setDraft] = useState<Partial<SkinConfigValues>>({})
  const [gallery, setGallery] = useState<readonly { id: string; name?: string; url: string }[]>([])
  const [active, setActive] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [wallpaperError, setWallpaperError] = useState<string | undefined>(undefined)
  const [storageAvailable] = useState(() => wallpaperStorageAvailable())
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Partial<SkinConfigValues>>({})
  const commitTimer = useRef<number | undefined>(undefined)
  /** Latest commit, so unmount can flush without capturing a stale closure. */
  const flushRef = useRef<() => void>(() => {})
  /** Fences draft cleanup: an older write must not hide a newer edit. */
  const writeSeq = useRef(0)
  /** Re-read the gallery after a write. */
  const refreshGallery = (): void => {
    setGallery(listWallpapers?.() ?? [])
    setActive(activeWallpaperId?.())
  }

  // Stored images survive reloads, so the gallery starts from what the skin
  // already holds, and follows writes the skin makes elsewhere.
  useEffect(() => {
    refreshGallery()
    return subscribeWallpapers?.(refreshGallery)
  }, [])

  // A colour picker fires change per movement; land one write after the drag,
  // and flush (not drop) it when the panel closes first.
  useEffect(() => () => {
    window.clearTimeout(commitTimer.current)
    flushRef.current()
  }, [])

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
    const seq = ++writeSeq.current
    const settle = (accepted: boolean): void => {
      if (seq !== writeSeq.current) return
      setDraft({})
      setSaveFailed(!accepted)
    }
    void form.mutate(ops).then(settle).catch(() => { settle(false) })
  }
  const commitSoon = (): void => {
    window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => { commit() }, 350)
  }
  flushRef.current = commit
  /** Friendly copy for the storage failures a browser can raise. */
  const storageMessage = (error: unknown): string => {
    if (String(error).includes('wallpaper-limit')) return copy('image.errorLimit')
    const known = ['QuotaExceededError', 'SecurityError', 'InvalidStateError', 'UnknownError', 'NotSupportedError']
    if (error instanceof DOMException && known.includes(error.name)) return copy('image.errorStore')
    return error instanceof Error ? error.message : copy('image.errorStore')
  }

  const pickWallpapers = async (files: FileList | undefined): Promise<void> => {
    if (files === undefined || addWallpaper === undefined) return
    if (!storageAvailable) {
      setWallpaperError(copy('image.errorUnavailable'))
      return
    }
    setWallpaperError(undefined)
    let added = 0
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setWallpaperError(copy('image.errorType'))
        continue
      }
      if (file.size > MAX_WALLPAPER_BYTES) {
        setWallpaperError(copy('image.errorTooLarge'))
        continue
      }
      try {
        await addWallpaper(file)
        added += 1
      } catch (error) {
        const limit = String(error).includes('wallpaper-limit')
        setWallpaperError(limit ? copy('image.errorLimit') : (error instanceof Error ? error.message : copy('image.errorStore')))
        break
      }
    }
    refreshGallery()
    if (added > 0) {
      write('customWallpaper', true)
      commit()
    }
  }
  const removeOne = async (id: string): Promise<void> => {
    if (removeWallpaper === undefined) return
    try {
      setWallpaperError(undefined)
      await removeWallpaper(id)
      refreshGallery()
    } catch (error) {
      setWallpaperError(storageMessage(error))
    }
  }
  const chooseWallpaper = async (id: string): Promise<void> => {
    if (selectWallpaper === undefined) return
    setActive(id)
    await selectWallpaper(id)
  }
  /** One block of context a bug report needs, none of it personal. */
  const diagnostics = (): string => [
    `version: ${version ?? 'unknown'}`,
    `platform: ${document.documentElement.dataset.platform ?? 'web'}`,
    `locale: ${document.documentElement.lang || navigator.language}`,
    `settings: splash=${value.splash}, light=${value.lightOpacity}, dark=${value.darkOpacity}, `
      + `sidebar=${value.sidebarWallpaper ? value.sidebarOpacity : 'off'}, `
      + `bundled=${value.bundledWallpaper ? value.bundledPreset : 'off'}, `
      + `custom=${value.customWallpaper ? `${gallery.length} images` : 'off'}, random=${value.randomWallpaper}`,
  ].join('\n')

  /** Put text on the clipboard, falling back to a hidden textarea. */
  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
  }

  const reportIssue = (): void => {
    const body = [copy('feedback.issueBody'), '', '---', '', diagnostics()].join('\n')
    const url = `https://github.com/raven3005672/dsh-plugin-shell-skin/issues/new`
      + `?title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank', 'noopener')
  }

  const copyDiagnostics = async (): Promise<void> => {
    await copyText(diagnostics())
    setCopied(true)
    window.setTimeout(() => { setCopied(false) }, 2000)
  }

  const restoreDefaults = (): void => {
    pending.current = {}
    setDraft({})
    const ops = (Object.keys(DEFAULTS) as (keyof SkinConfigValues)[]).map(field => ({
      op: 'unset' as const,
      path: [field],
    }))
    const seq = ++writeSeq.current
    void form.mutate(ops, state.revision).then(accepted => {
      if (seq !== writeSeq.current) return
      setSaveFailed(!accepted)
    }).catch(() => { if (seq === writeSeq.current) setSaveFailed(true) })
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
          {copy('random.title')}
          <br />
          <span style={hint}>{copy('random.description')}</span>
        </span>
        <Switch
          checked={value.randomWallpaper}
          label={copy('random.title')}
          disabled={disabled || !value.customWallpaper}
          onChange={next => { write('randomWallpaper', next); commit() }}
        />
      </label>

      {value.customWallpaper ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={label}>
            {copy('image.title')}
            <br />
            <span style={hint}>{copy('image.description')}</span>
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {gallery.map(item => (
              <div key={item.id} className="shell-skin-thumb" style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label={item.name ?? copy('image.title')}
                  aria-pressed={active === item.id}
                  data-wallpaper-thumb={item.id}
                  onClick={() => { void chooseWallpaper(item.id) }}
                  style={{
                    padding: 0,
                    width: '100%',
                    aspectRatio: '16 / 9',
                    overflow: 'hidden',
                    borderRadius: 'var(--dsw-radius-xl)',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '0.5px solid var(--dsw-alias-border-l4)',
                    boxShadow: active === item.id ? '0 0 0 2px var(--dsw-alias-state-business-primary)' : 'none',
                  }}
                >
                  <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
                <button
                  type="button"
                  className="shell-skin-thumb-delete"
                  aria-label={item.name === undefined ? copy('image.delete') : `${copy('image.delete')} ${item.name}`}
                  data-wallpaper-delete={item.id}
                  onClick={() => { void removeOne(item.id) }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1.2 1.2 8.8 8.8M8.8 1.2 1.2 8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || !storageAvailable || gallery.length >= MAX_WALLPAPERS}
              onClick={() => inputRef.current?.click()}
              style={{ aspectRatio: '16 / 9', width: '100%', height: 'auto', borderStyle: 'dashed' }}
            >
              {copy('image.add')}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={event => {
                void pickWallpapers(event.target.files ?? undefined)
                event.target.value = ''
              }}
            />
          </div>
          {gallery.length >= MAX_WALLPAPERS ? <span style={hint}>{copy('image.max')}</span> : null}
        </div>
      ) : null}


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

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={label}>
          {copy('preset.title')}
          <br />
          <span style={hint}>{copy('preset.description')}</span>
        </span>
        <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {(presets ?? []).map(preset => {
            const available = (presets ?? []).some(item => item.id === value.bundledPreset)
            const selected = (available ? value.bundledPreset : presets?.[0]?.id) === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={copy(preset.labelKey)}
                aria-pressed={selected}
                disabled={disabled || !value.bundledWallpaper}
                onClick={() => { write('bundledPreset', preset.id); commit() }}
                style={{
                  padding: 0,
                  width: '100%',
                  aspectRatio: '16 / 9',
                  overflow: 'hidden',
                  borderRadius: 'var(--dsw-radius-xl)',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '0.5px solid var(--dsw-alias-border-l4)',
                  boxShadow: selected ? '0 0 0 2px var(--dsw-alias-state-business-primary)' : 'none',
                  opacity: disabled || !value.bundledWallpaper ? 0.5 : 1,
                }}
              >
                <img
                  src={preset.src}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            )
          })}
        </span>
      </div>

      {storageAvailable ? null : <p style={hint}>{copy('image.unavailable')}</p>}
      {wallpaperError === undefined ? null : <p style={hint}>{wallpaperError}</p>}
      {saveFailed ? <p style={hint}>{copy('save.failed')}</p> : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <Button size="sm" variant="outline" disabled={disabled} onClick={restoreDefaults}>
          {copy('reset.label')}
        </Button>
        <span style={hint}>{copy('reset.hint')}</span>
      </div>

      {state.writable ? null : <p style={hint}>{copy('profile.locked')}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <Button size="sm" variant="outline" onClick={reportIssue}>{copy('feedback.report')}</Button>
        <Button size="sm" variant="outline" onClick={() => { void copyDiagnostics() }}>
          {copied ? copy('feedback.copied') : copy('feedback.copy')}
        </Button>
        <span style={hint}>{`${copy('version.label')} ${version ?? '—'}`}</span>
      </div>
    </div>
  )
}
