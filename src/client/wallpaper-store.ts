/**
 * IndexedDB storage for a wallpaper the user picked in this browser.
 *
 * A Blob URL only lives as long as the document that created it, so the file
 * itself is kept here and re-materialised on every page load. The store is
 * origin-scoped: another port or another browser sees no wallpaper, and
 * nothing leaves this machine.
 */

const DATABASE = 'shell-skin'
const STORE = 'assets'
const KEY = 'wallpaper'

/** What the store holds: the image plus the name it was picked under. */
export interface StoredWallpaper {
  /** The image itself. */
  blob: Blob
  /** Original file name, absent for records written before it was kept. */
  name?: string
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

/**
 * Read the stored wallpaper.
 * @returns the stored image, or undefined when none was ever saved.
 */
export async function loadWallpaper(): Promise<StoredWallpaper | undefined> {
  if (!wallpaperStorageAvailable()) return undefined
  const stored = await transact<unknown>('readonly', store => store.get(KEY))
  if (stored instanceof Blob) return { blob: stored }
  if (typeof stored === 'object' && stored !== null && 'blob' in stored) {
    const record = stored as StoredWallpaper
    return record.blob instanceof Blob ? record : undefined
  }
  return undefined
}

/**
 * Replace the stored wallpaper.
 * @param image - the file the user picked, and the name to show for it.
 */
export async function saveWallpaper(image: File): Promise<void> {
  await transact('readwrite', store => store.put({ blob: image, name: image.name } satisfies StoredWallpaper, KEY))
}

/** Remove the stored wallpaper. */
export async function clearStoredWallpaper(): Promise<void> {
  if (!wallpaperStorageAvailable()) return
  await transact('readwrite', store => store.delete(KEY))
}
