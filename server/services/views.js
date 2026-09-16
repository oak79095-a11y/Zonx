// Batched listing-view counter.
// A write per page view serializes writers under load, so views accumulate
// in memory and flush in a single batch every FLUSH_MS.
const FLUSH_MS = 15_000
const pending = new Map() // listingId -> count
let timer = null

export function countView(db, listingId) {
  if (!listingId) return
  pending.set(listingId, (pending.get(listingId) || 0) + 1)
  scheduleFlush(db)
}

// Views that reached the DB plus what is still buffered (for fresh responses).
export function pendingViewsOf(listingId) {
  return pending.get(listingId) || 0
}

function scheduleFlush(db) {
  if (timer) return
  timer = setTimeout(() => { flushViews(db).catch(() => {}) }, FLUSH_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export async function flushViews(db) {
  if (timer) { clearTimeout(timer); timer = null }
  if (pending.size === 0) return
  try {
    for (const [id, count] of pending) await db.run('UPDATE listings SET views = views + ? WHERE id = ?', [count, id])
  } catch {
    // Keep unflushed counts so they retry on the next flush.
    scheduleFlush(db)
    return
  }
  pending.clear()
}

// Persist remaining counts on shutdown so views are not lost.
