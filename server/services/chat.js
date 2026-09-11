import { makeId } from '../utils/auth.js'

function convKey(db, a, b) {
  const [u1, u2] = [a, b].sort()
  const existing = db.prepare('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?').get(u1, u2)
  if (existing) return existing.id
  const id = makeId()
  db.prepare('INSERT INTO conversations(id,user1_id,user2_id) VALUES(?,?,?)').run(id, u1, u2)
  return id
}

export function getOrCreateConversation(db, a, b) {
  return convKey(db, a, b)
}

function otherOf(conv, userId) {
  return conv.user1_id === userId ? conv.user2_id : conv.user1_id
}

export function listConversations(db, userId) {
  const rows = db.prepare(`
    SELECT c.*, m.text AS last_text, m.created_at AS last_time, m.sender_id AS last_sender, m.media_type AS last_media_type
    FROM conversations c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY c.last_message_at DESC
  `).all(userId, userId)

  const unreadStmt = db.prepare(
    "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL"
  )
   const userStmt = db.prepare('SELECT id, email, name, avatar, verified, role FROM users WHERE id = ?')

  return rows.map((row) => {
    const otherId = otherOf(row, userId)
    const other = userStmt.get(otherId)
    return {
      id: row.id,
       user: other || { id: otherId, email: null, name: 'مستخدم محذوف', avatar: null },
      last_text: row.last_text || '',
      last_media_type: row.last_media_type || 'text',
      last_at: row.last_time || row.last_message_at,
      unread: unreadStmt.get(row.id, userId)?.c || 0,
    }
  })
}

export function getHistory(db, convId, userId, limit = 100) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId)
  if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) return null
  const otherId = otherOf(conv, userId)
   const other = db.prepare('SELECT id, email, name, avatar, verified, role FROM users WHERE id = ?').get(otherId)
  const rows = db.prepare(`
    SELECT m.id, m.sender_id, m.text, m.media, m.media_type, m.media_name, m.media_size, m.read_at, m.created_at,
      (SELECT COUNT(*) FROM message_reactions r WHERE r.message_id = m.id AND r.reaction = 'heart') AS reactions,
      EXISTS(SELECT 1 FROM message_reactions r WHERE r.message_id = m.id AND r.user_id = ? AND r.reaction = 'heart') AS reacted
    FROM messages m
    WHERE m.conversation_id = ? ORDER BY m.created_at ASC
  `).all(userId, convId)
  const msgs = rows.slice(-limit).map((r) => ({
    id: r.id,
    from: r.sender_id === userId ? 'me' : 'them',
    text: r.text,
    media: r.media,
    media_type: r.media_type,
    media_name: r.media_name,
    media_size: r.media_size,
    read_at: r.read_at,
    at: r.created_at,
    reactions: r.reactions || 0,
    reacted: Boolean(r.reacted),
  }))
   return { id: conv.id, user: other || { id: otherId, email: null, name: 'مستخدم محذوف', avatar: null }, messages: msgs }
}

export function insertMessage(db, convId, senderId, text, media = null, mediaType = 'text', mediaName = null, mediaSize = null) {
  const id = makeId()
  db.prepare("INSERT INTO messages(id,conversation_id,sender_id,text,media,media_type,media_name,media_size) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, convId, senderId, text || '', media, mediaType, mediaName, mediaSize)
  db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(convId)
  const row = db.prepare('SELECT id, sender_id, text, media, media_type, media_name, media_size, created_at FROM messages WHERE id = ?').get(id)
  return { id: row.id, sender_id: row.sender_id, text: row.text, media: row.media, media_type: row.media_type, media_name: row.media_name, media_size: row.media_size, at: row.created_at, reactions: 0, reacted: false }
}

export function markRead(db, convId, userId) {
  db.prepare(
    "UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL"
  ).run(convId, userId)
}

export function unreadTotal(db, userId) {
  const rows = db.prepare('SELECT id FROM conversations WHERE user1_id = ? OR user2_id = ?').all(userId, userId)
  const stmt = db.prepare(
    "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL"
  )
  return rows.reduce((sum, r) => sum + (stmt.get(r.id, userId)?.c || 0), 0)
}
