import { makeId } from '../utils/auth.js'
import { pushToUser } from './push.js'

export async function createNotification(db, { recipientId, actorId = null, type, entityId = null, message }) {
  if (!recipientId || recipientId === actorId || !type || !message) return null
  const result = await db.run('INSERT INTO notifications(id, recipient_id, actor_id, type, entity_id, message) VALUES(?,?,?,?,?,?)', [makeId(), recipientId, actorId, type, entityId, message])
  if (result.rowCount) pushToUser(recipientId, { type: 'notification', notification_type: type, entity_id: entityId, unread: await unreadNotifications(db, recipientId) })
  return result.rowCount ? result : null
}

export async function listNotifications(db, userId, limit = 50) {
  return db.many(`SELECT n.id, n.type, n.entity_id, n.message, n.read_at, n.created_at, a.id AS actor_id, a.name AS actor_name, a.avatar AS actor_avatar FROM notifications n LEFT JOIN users a ON a.id = n.actor_id WHERE n.recipient_id = ? ORDER BY n.created_at DESC LIMIT ?`, [userId, Math.min(Math.max(Number(limit) || 50, 1), 100)])
}

export async function unreadNotifications(db, userId) {
  const row = await db.one('SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND read_at IS NULL', [userId])
  return Number(row?.count || 0)
}

export async function markNotificationsRead(db, userId) {
  return db.run("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = ? AND read_at IS NULL", [userId])
}
