import { cacheInvalidate } from './cache.js'

// Expiration runs periodically (not per request) to keep writes off the hot path.
const EXPIRE_INTERVAL_MS = 5 * 60 * 1000
let timer = null

export async function expireListings(db) {
  const retentionDays = Number(process.env.LISTING_EXPIRATION_DAYS ?? 0)
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  if (!db?.run) {
    const result = db.prepare(
      "UPDATE listings SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?"
    ).run(new Date().toISOString())
    if (result.changes) cacheInvalidate('listings:')
    return result.changes
  }
  const result = await db.run(
    `UPDATE listings SET status='expired', updated_at=CURRENT_TIMESTAMP
     WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?`, [new Date().toISOString()]
  )
  // Freshness matters only when something actually changed.
  const changed = result.rowCount ?? result.changes ?? 0
  if (changed) cacheInvalidate('listings:')
  return changed
}

export function startExpirationJob(db) {
  if (timer) return
  timer = setInterval(() => {
    expireListings(db).catch(() => {})
  }, EXPIRE_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export async function expireSubscription(db, subId) {
  if (!db?.run) {
    return db.prepare(
      "UPDATE subscriptions SET status='expired' WHERE id=? AND status='active' AND ends_at < CURRENT_TIMESTAMP"
    ).run(subId)
  }
  return db.run(
    "UPDATE subscriptions SET status='expired' WHERE id=? AND status='active' AND ends_at < CURRENT_TIMESTAMP", [subId]
  )
}
