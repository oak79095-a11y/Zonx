import { getDb } from '../db.js'

// Refresh expiration state at most once per interval under concurrent traffic.
let lastListingExpirationAt = 0

export function expireListings(db) {
  const timestamp = Date.now()
  // Avoid issuing a write on every concurrent catalog request.
  if (timestamp - lastListingExpirationAt < 30_000) return
  lastListingExpirationAt = timestamp
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE listings SET status='expired', updated_at=datetime('now')
     WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?`
  ).run(now)
}

export function expireSubscription(db, subId) {
  db.prepare(
    "UPDATE subscriptions SET status='expired' WHERE id=? AND status='active' AND ends_at < datetime('now')"
  ).run(subId)
}
