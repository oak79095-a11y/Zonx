import { makeId } from '../utils/auth.js'

async function convKey(db, a, b) {
  const [u1, u2] = [a, b].sort()
  const existing = await db.one('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?', [u1, u2])
  if (existing) return existing.id
  const id = makeId()
  await db.run('INSERT INTO conversations(id,user1_id,user2_id) VALUES(?,?,?) ON CONFLICT(user1_id,user2_id) DO NOTHING', [id, u1, u2])
  return (await db.one('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?', [u1, u2])).id
}

export async function getOrCreateConversation(db, a, b) {
  return convKey(db, a, b)
}

function otherOf(conv, userId) {
  return conv.user1_id === userId ? conv.user2_id : conv.user1_id
}

export async function listConversations(db, userId) {
  const rows = await db.many(`
    SELECT c.*, m.text AS last_text, m.created_at AS last_time, m.sender_id AS last_sender, m.media_type AS last_media_type
    FROM conversations c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY c.last_message_at DESC
  `, [userId, userId])

   const unreadRows = new Map((await db.many(
     "SELECT conversation_id, COUNT(*) as c FROM messages WHERE sender_id != ? AND read_at IS NULL GROUP BY conversation_id"
   , [userId])).map((row) => [row.conversation_id, row.c]))

  return Promise.all(rows.map(async (row) => {
    const otherId = otherOf(row, userId)
    const other = await db.one('SELECT id, name, avatar, verified FROM users WHERE id = ?', [otherId])
    return {
      id: row.id,
       user: other || { id: otherId, email: null, name: 'مستخدم محذوف', avatar: null },
      last_text: row.last_text || '',
      last_media_type: row.last_media_type || 'text',
      last_at: row.last_time || row.last_message_at,
       unread: unreadRows.get(row.id) || 0,
    }
  }))
}

export async function getHistory(db, convId, userId, limit = 100) {
  const conv = await db.one('SELECT * FROM conversations WHERE id = ?', [convId])
  if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) return null
  const otherId = otherOf(conv, userId)
    const other = await db.one('SELECT id, name, avatar, verified FROM users WHERE id = ?', [otherId])
  const rows = await db.many(`
    SELECT m.id, m.sender_id, m.text, m.media, m.media_type, m.media_name, m.media_size, m.read_at, m.created_at,
      (SELECT COUNT(*) FROM message_reactions r WHERE r.message_id = m.id AND r.reaction = 'heart') AS reactions,
      EXISTS(SELECT 1 FROM message_reactions r WHERE r.message_id = m.id AND r.user_id = ? AND r.reaction = 'heart') AS reacted
    FROM messages m
     WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT ?
    `, [userId, convId, Math.min(Math.max(Number(limit) || 100, 1), 100)])
   const msgs = rows.reverse().map((r) => ({
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

export async function insertMessage(db, convId, senderId, text, media = null, mediaType = 'text', mediaName = null, mediaSize = null) {
  const id = makeId()
  await db.run("INSERT INTO messages(id,conversation_id,sender_id,text,media,media_type,media_name,media_size) VALUES(?,?,?,?,?,?,?,?)", [id, convId, senderId, text || '', media, mediaType, mediaName, mediaSize])
  await db.run('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [convId])
  const row = await db.one('SELECT id, sender_id, text, media, media_type, media_name, media_size, created_at FROM messages WHERE id = ?', [id])
  return { id: row.id, sender_id: row.sender_id, text: row.text, media: row.media, media_type: row.media_type, media_name: row.media_name, media_size: row.media_size, at: row.created_at, reactions: 0, reacted: false }
}

export async function markRead(db, convId, userId) {
  return db.run(
    'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL',
    [convId, userId]
  )
}

export async function unreadTotal(db, userId) {
   const row = await db.one(
     'SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.read_at IS NULL',
     [userId, userId, userId]
   )
   return Number(row?.c || 0)
}
