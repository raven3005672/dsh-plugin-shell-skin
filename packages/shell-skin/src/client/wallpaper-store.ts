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
      request.onsuccess = () => { resolve(request.result) }
      request.onerror = () => { reject(request.error ?? new Error('shell-skin: IndexedDB request failed')) }
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
export async function loadWallpaper(): Promise<Blob | undefined> {
  if (!wallpaperStorageAvailable()) return undefined
  const stored = await transact<unknown>('readonly', store => store.get(KEY))
  return stored instanceof Blob ? stored : undefined
}

/**
 * Replace the stored wallpaper.
 * @param image - the file the user picked.
 */
export async function saveWallpaper(image: Blob): Promise<void> {
  await transact('readwrite', store => store.put(image, KEY))
}

/** Remove the stored wallpaper. */
export async function clearStoredWallpaper(): Promise<void> {
  if (!wallpaperStorageAvailable()) return
  await transact('readwrite', store => store.delete(KEY))
}
