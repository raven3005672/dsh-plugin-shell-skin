/**
 * IndexedDB storage for the wallpapers the user picked in this browser.
 *
 * Blob URLs only live as long as the document that created them, so the files
 * are kept here and re-materialised on every page load. The store is
 * origin-scoped: another port or another browser sees nothing, and nothing
 * leaves this machine.
 *
 * Records:
 *   `wallpapers` — StoredWallpaper[] (up to MAX_WALLPAPERS)
 *   `active`     — id of the image selected when random mode is off
 *   `wallpaper`  — legacy single-image record, migrated on first read
 */

const DATABASE = 'shell-skin'
const STORE = 'assets'
const KEY = 'wallpapers'
const ACTIVE = 'active'
const LEGACY = 'wallpaper'

/** How many uploads the store keeps. */
export const MAX_WALLPAPERS = 9

/** One stored image. */
export interface StoredWallpaper {
  /** Stable id used by the settings gallery and the active pointer. */
  id: string
  /** Original file name, when the record kept one. */
  name?: string
  /** The image itself. */
  blob: Blob
}

/** Open the plugin's database, creating its single object store on first use. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('shell-skin: cannot open IndexedDB')) }
  })
}

/**
 * Run one transaction against the wallpaper store.
 * @param mode - read or write access.
 * @param work - schedules the request on the store.
 * @returns the request's result once the transaction commits.
 */
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      let result: T
      request.onsuccess = () => { result = request.result }
      request.onerror = () => { reject(request.error ?? new Error('shell-skin: IndexedDB request failed')) }
      // Resolve on completion, not on the request: closing the database while
      // the transaction is still open aborts it, and a write would be lost.
      transaction.oncomplete = () => { resolve(result) }
      transaction.onabort = () => { reject(transaction.error ?? new Error('shell-skin: IndexedDB transaction aborted')) }
    })
  } finally {
    database.close()
  }
}

/** Whether this browser can hold a wallpaper at all. */
export function wallpaperStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

/** Build an id without assuming `crypto.randomUUID` exists. */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `w${Date.now()}${Math.round(Math.random() * 1e6)}`
}

/**
 * Read the stored wallpapers, migrating the old single-image record.
 * @returns the stored images, oldest first.
 */
export async function loadWallpapers(): Promise<StoredWallpaper[]> {
  if (!wallpaperStorageAvailable()) return []
  const stored = await transact<unknown>('readonly', store => store.get(KEY))
  if (Array.isArray(stored)) return stored as StoredWallpaper[]
  const legacy = await transact<unknown>('readonly', store => store.get(LEGACY))
  if (legacy === undefined) return []
  const blob = legacy instanceof Blob
    ? legacy
    : (typeof legacy === 'object' && legacy !== null && 'blob' in legacy ? (legacy as StoredWallpaper).blob : undefined)
  if (!(blob instanceof Blob)) return []
  const name = typeof legacy === 'object' && legacy !== null && 'name' in legacy ? (legacy as StoredWallpaper).name : undefined
  const migrated: StoredWallpaper[] = [{ id: newId(), ...name === undefined ? {} : { name }, blob }]
  await transact('readwrite', store => store.put(migrated, KEY))
  await transact('readwrite', store => store.delete(LEGACY))
  return migrated
}

/**
 * Append one image.
 * @param file - the picked file.
 * @returns the stored images after the write.
 */
export async function addWallpaper(file: File): Promise<StoredWallpaper[]> {
  const images = await loadWallpapers()
  if (images.length >= MAX_WALLPAPERS) throw new Error('wallpaper-limit')
  const next = [...images, { id: newId(), name: file.name, blob: file }]
  await transact('readwrite', store => store.put(next, KEY))
  return next
}

/**
 * Remove one image by id.
 * @param id - record to drop.
 * @returns the stored images after the write.
 */
export async function removeWallpaper(id: string): Promise<StoredWallpaper[]> {
  const images = (await loadWallpapers()).filter(image => image.id !== id)
  await transact('readwrite', store => store.put(images, KEY))
  return images
}

/**
 * Read the active image id.
 * @returns the id, or undefined when nothing is selected.
 */
export async function loadActiveId(): Promise<string | undefined> {
  if (!wallpaperStorageAvailable()) return undefined
  const stored = await transact<unknown>('readonly', store => store.get(ACTIVE))
  return typeof stored === 'string' ? stored : undefined
}

/**
 * Persist the active image id.
 * @param id - the id to remember, or undefined to clear it.
 */
export async function saveActiveId(id: string | undefined): Promise<void> {
  if (!wallpaperStorageAvailable()) return
  if (id === undefined) {
    await transact('readwrite', store => store.delete(ACTIVE))
    return
  }
  await transact('readwrite', store => store.put(id, ACTIVE))
}
