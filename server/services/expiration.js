import { getDb } from '../db.js'
import { cacheInvalidate } from './cache.js'

// Expiration runs periodically (not per request) to keep writes off the hot path.
const EXPIRE_INTERVAL_MS = 5 * 60 * 1000
let timer = null

export function expireListings(db) {
  const retentionDays = Number(process.env.LISTING_EXPIRATION_DAYS ?? 0)
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  const now = new Date().toISOString()
  const result = db.prepare(
    `UPDATE listings SET status='expired', updated_at=datetime('now')
     WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?`
  ).run(now)
  // Freshness matters only when something actually changed.
  if (result.changes) cacheInvalidate('listings:')
  return result.changes
}

export function startExpirationJob() {
  if (timer) return
  timer = setInterval(() => {
    try { expireListings(getDb()) } catch {}
  }, EXPIRE_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export function expireSubscription(db, subId) {
  db.prepare(
    "UPDATE subscriptions SET status='expired' WHERE id=? AND status='active' AND ends_at < datetime('now')"
  ).run(subId)
}
