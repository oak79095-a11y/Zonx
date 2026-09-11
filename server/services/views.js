import { getDb } from '../db.js'

// Batched listing-view counter.
// A write per page view serializes writers under load, so views accumulate
// in memory and flush to SQLite in a single transaction every FLUSH_MS.
const FLUSH_MS = 15_000
const pending = new Map() // listingId -> count
let timer = null

export function countView(listingId) {
  if (!listingId) return
  pending.set(listingId, (pending.get(listingId) || 0) + 1)
  scheduleFlush()
}

// Views that reached the DB plus what is still buffered (for fresh responses).
export function pendingViewsOf(listingId) {
  return pending.get(listingId) || 0
}

function scheduleFlush() {
  if (timer) return
  timer = setTimeout(flushViews, FLUSH_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export function flushViews() {
  if (timer) { clearTimeout(timer); timer = null }
  if (pending.size === 0) return
  const db = getDb()
  const stmt = db.prepare('UPDATE listings SET views = views + ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    for (const [id, count] of pending) stmt.run(count, id)
    db.exec('COMMIT')
  } catch {
    try { db.exec('ROLLBACK') } catch {}
    // Keep unflushed counts so they retry on the next flush.
    scheduleFlush()
    return
  }
  pending.clear()
}

// Persist remaining counts on shutdown so views are not lost.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { flushViews() } catch {} })
}
