import { makeId } from '../utils/auth.js'

export function createNotification(db, { recipientId, actorId = null, type, entityId = null, message }) {
  if (!recipientId || recipientId === actorId || !type || !message) return null
  const result = db.prepare(`
    INSERT INTO notifications(id, recipient_id, actor_id, type, entity_id, message)
    VALUES(?,?,?,?,?,?)
  `).run(makeId(), recipientId, actorId, type, entityId, message)
  return result.changes ? result : null
}

export function listNotifications(db, userId, limit = 50) {
  return db.prepare(`
    SELECT n.id, n.type, n.entity_id, n.message, n.read_at, n.created_at,
      a.id AS actor_id, a.name AS actor_name, a.avatar AS actor_avatar
    FROM notifications n
    LEFT JOIN users a ON a.id = n.actor_id
    WHERE n.recipient_id = ?
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(userId, Math.min(Math.max(Number(limit) || 50, 1), 100))
}

export function unreadNotifications(db, userId) {
  return db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND read_at IS NULL').get(userId).count
}

export function markNotificationsRead(db, userId) {
  return db.prepare('UPDATE notifications SET read_at = datetime(\'now\') WHERE recipient_id = ? AND read_at IS NULL').run(userId)
}
