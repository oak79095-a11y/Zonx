const DB_NAME = 'zonx-media-cache'
const STORE = 'media'
const VERSION = 1
const MAX_BYTES = 80 * 1024 * 1024

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'url' })
        store.createIndex('lastAccessed', 'lastAccessed')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transaction(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE)
}

export async function getCachedMedia(url) {
  if (!url || typeof indexedDB === 'undefined') return null
  try {
    const db = await openDb()
    const entry = await new Promise((resolve, reject) => {
      const request = transaction(db).get(url)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (!entry) return null
    const write = transaction(db, 'readwrite')
    write.put({ ...entry, lastAccessed: Date.now() })
    return URL.createObjectURL(entry.blob)
  } catch {
    return null
  }
}

export async function cacheMedia(url, blob) {
  if (!url || !blob || typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    const store = transaction(db, 'readwrite')
    store.put({ url, blob, size: blob.size, lastAccessed: Date.now() })
    await evictOldMedia(db)
  } catch {
    // Caching is optional and must never block media display.
  }
}

async function evictOldMedia(db) {
  const store = transaction(db, 'readwrite')
  const entries = await new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  let total = entries.reduce((sum, item) => sum + (item.size || 0), 0)
  if (total <= MAX_BYTES) return
  for (const item of entries.sort((a, b) => a.lastAccessed - b.lastAccessed)) {
    if (total <= MAX_BYTES) break
    store.delete(item.url)
    total -= item.size || 0
  }
}
