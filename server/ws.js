import { WebSocketServer } from 'ws'
import { verifyToken } from './utils/auth.js'
import { getDb } from './db.js'
import { getOrCreateConversation, insertMessage, markRead } from './services/chat.js'
import { isStoredUploadPath } from './services/storage.js'
import { createNotification } from './services/notifications.js'
import { registerPushSender } from './services/push.js'

function parseSessionCookie(header) {
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === 'session') {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

// userId -> Set<socket>
const online = new Map()

export function sendToUser(userId, payload) {
  const sockets = online.get(userId)
  if (!sockets) return
  const data = String(payload)
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(data)
  }
}

export function initWs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  registerPushSender(sendToUser)

  wss.on('connection', (ws, req) => {
    let userId = null
    try {
      const token = parseSessionCookie(req.headers.cookie)
      if (token) userId = verifyToken(token).id
    } catch {}
    if (!userId) {
      ws.close(4001, 'غير مصرح')
      return
    }

    if (!online.has(userId)) online.set(userId, new Set())
    online.get(userId).add(ws)
    ws.send(JSON.stringify({ type: 'hello', id: userId }))

    ws.on('message', (raw) => {
      let data
      try { data = JSON.parse(String(raw)) } catch { return }
      const db = getDb()
      try {
        if (data.type === 'msg') {
          const to = String(data.to || '')
          const text = String(data.text || '').trim()
          const media = typeof data.media === 'string' && data.media ? data.media : null
          const mediaType = ['image', 'video', 'audio', 'file'].includes(data.media_type) ? data.media_type : 'text'
           if (!to || to === userId || (!text && !media) || text.length > 1000) return
           if (media && (!isStoredUploadPath(media, 'chat') || !db.prepare('SELECT path FROM chat_uploads WHERE path = ? AND user_id = ?').get(media, userId))) return
           const mediaSize = Number(data.media_size)
           const mediaName = typeof data.media_name === 'string' ? data.media_name.slice(0, 255) : null
           if (!db.prepare('SELECT id FROM users WHERE id = ?').get(to)) return
           const convId = getOrCreateConversation(db, userId, to)
           const msg = insertMessage(db, convId, userId, text, media, mediaType, mediaName, Number.isSafeInteger(mediaSize) && mediaSize >= 0 ? mediaSize : null)
           const sender = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(userId)
           createNotification(db, {
             recipientId: to,
             actorId: userId,
             type: 'message',
             entityId: msg.id,
             message: `${sender?.name || 'مستخدم'} أرسل لك رسالة`,
           })
           const payload = JSON.stringify({
             type: 'msg', conversation_id: convId,
             from: { id: userId, name: sender?.name || 'مستخدم', avatar: sender?.avatar || null },
            ...msg,
          })
          sendToUser(to, payload)
        } else if (data.type === 'read') {
          const convId = String(data.conversation_id || '')
          const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId)
          if (conv && (conv.user1_id === userId || conv.user2_id === userId)) {
            markRead(db, convId, userId)
            const other = conv.user1_id === userId ? conv.user2_id : conv.user1_id
            sendToUser(other, JSON.stringify({ type: 'read', conversation_id: convId, by: userId }))
          }
        } else if (data.type === 'typing') {
          const to = String(data.to || '')
          if (to && to !== userId) sendToUser(to, JSON.stringify({ type: 'typing', from: userId, on: Boolean(data.on) }))
        } else if (['call', 'call-answer', 'call-ice', 'call-end', 'call-reject'].includes(data.type)) {
          // اشارير المكالمة (WebRTC) — تمرير مباشر بين الطرفين
          const to = String(data.to || '')
          if (!to || to === userId) return
          if (!db.prepare('SELECT id FROM users WHERE id = ?').get(to)) return
          const out = { type: data.type, from: userId, from_name: data.from_name || null, from_avatar: data.from_avatar || null }
          if (data.kind) out.kind = String(data.kind)
          if (data.sdp) out.sdp = String(data.sdp).slice(0, 20000)
          if (data.candidate) out.candidate = data.candidate
          sendToUser(to, JSON.stringify(out))
        }
      } catch {}
    })

    ws.on('close', () => {
      const set = online.get(userId)
      if (set) {
        set.delete(ws)
        if (set.size === 0) online.delete(userId)
      }
    })
  })

  return wss
}
