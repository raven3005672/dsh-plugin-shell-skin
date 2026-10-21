/**
 * Settings-pane wrapper for the shell-skin controls.
 *
 * The Plugin Manager row used to hand the settings form to `SkinSettingsRow`
 * directly. A `settings.section` registration gets no owner props, so this
 * wrapper subscribes to the row namespace itself and projects the same
 * snapshot shape the row component already understands.
 */
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { SkinKey } from './locales.ts'
import { SkinSettingsRow } from './SkinSettingsRow.tsx'
import type { SkinConfigOp, SkinConfigState, SkinConfigValues } from './SkinSettingsRow.tsx'

/** The subset of `configForms`' form face this wrapper needs. */
export interface SkinSettingsForm {
  /** Current snapshot, including the namespace revision used to fence writes. */
  getSnapshot(): SkinConfigState
  /** Re-run the listener on every snapshot change. */
  subscribe(listener: () => void): () => void
  /** Apply one batch of writes, fenced by the snapshot's revision. */
  mutate(ops: readonly SkinConfigOp[], revision?: number): Promise<boolean>
}

/** Owner props plus the inject face supplied by the section registration. */
export interface SkinSettingsSectionProps {
  /** Namespace translator supplied by the slot registration. */
  t?(key: SkinKey): string
  /** Row settings form, resolved from the plugin's own namespace. */
  form: SkinSettingsForm
  /** Repaint the skin without persisting, used while a control is dragged. */
  preview?(patch: Partial<SkinConfigValues>): void
  /** List the images stored in this browser. */
  listWallpapers?(): readonly { id: string; name?: string; url: string }[]
  /** Id of the active image. */
  activeWallpaperId?(): string | undefined
  /** Append one image. */
  addWallpaper?(file: File): Promise<void>
  /** Drop one image. */
  removeWallpaper?(id: string): Promise<void>
  /** Select one image. */
  selectWallpaper?(id: string): Promise<void>
  /** Subscribe to store changes made outside this row. */
  subscribeWallpapers?(listener: () => void): () => void
  /** Plugin version shown in the footer. */
  version?: string
  /** Bundled artwork choices, with the thumbnail the row shows. */
  presets?: readonly { id: string; src: string; labelKey: SkinKey }[]
}

/**
 * Render the skin settings inside the Settings panel.
 * @param props - form face, skin actions and the namespace translator.
 * @returns the settings page body.
 */
export function SkinSettingsSection({
  t, form, preview, listWallpapers, activeWallpaperId, addWallpaper, removeWallpaper, selectWallpaper, subscribeWallpapers, version, presets,
}: SkinSettingsSectionProps): ReactElement {
  const [state, setState] = useState<SkinConfigState>(() => form.getSnapshot())

  useEffect(() => {
    const sync = (): void => { setState(form.getSnapshot()) }
    // Subscribe first: a change landing between the read and the subscription
    // would otherwise be lost, and the replay is idempotent.
    const unsubscribe = form.subscribe(sync)
    sync()
    return unsubscribe
  }, [form])

  return (
    <SkinSettingsRow
      view="page"
      t={t}
      form={{ state, mutate: (ops, revision) => form.mutate(ops, revision) }}
      preview={preview}
      listWallpapers={listWallpapers}
      activeWallpaperId={activeWallpaperId}
      addWallpaper={addWallpaper}
      removeWallpaper={removeWallpaper}
      selectWallpaper={selectWallpaper}
      subscribeWallpapers={subscribeWallpapers}
      version={version}
      presets={presets}
    />
  )
}
