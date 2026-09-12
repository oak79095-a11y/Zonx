// Tiny in-memory TTL cache for hot, public GET endpoints.
// Single-process by design (SQLite is single-writer anyway), bounded in size.
const store = new Map() // key -> { value, expiresAt }
const MAX_ENTRIES = 500

export function cacheGet(key) {
  const hit = store.get(key)
  if (!hit) return undefined
  if (hit.expiresAt < Date.now()) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

export function cacheSet(key, value, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k)
    }
    // Still full: drop the oldest inserted entries (Map keeps insertion order).
    if (store.size >= MAX_ENTRIES) {
      let i = 0
      for (const k of store.keys()) {
        store.delete(k)
        if (++i >= 50) break
      }
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

// Drop entries by prefix (e.g. every cached listings page after a mutation).
export function cacheInvalidate(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
