import { Router } from 'express'
import multer from 'multer'
import { getDb } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import {
  getOrCreateConversation, listConversations, getHistory,
  insertMessage, markRead, unreadTotal,
} from '../services/chat.js'
import { saveFile, deleteFile } from '../services/storage.js'
import { CHAT_ALLOWED_TYPES, isStoredUploadPath } from '../services/storage.js'
import { makeId } from '../utils/auth.js'
import { sendToUser } from '../ws.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { createNotification } from '../services/notifications.js'

const router = Router()

const chatUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    cb(null, CHAT_ALLOWED_TYPES.has(file.mimetype))
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

function mediaKindOf(mime) {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

// رفع وسائط الدردشة (صورة/فيديو/صوت/ملف)
router.post('/upload', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'نوع الملف غير مدعوم أو الملف كبير جدا' })
    const file = req.file
    if (!file) return res.status(400).json({ error: 'لا يوجد ملف' })
    if (!CHAT_ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'نوع الملف غير مدعوم' })
    const kind = mediaKindOf(file.mimetype)
    if (kind === 'file' && !/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|apk)$/i.test(file.originalname || '')) {
      return res.status(400).json({ error: 'نوع الملف غير مدعوم' })
    }
    const path = saveFile(file, 'chat')
    getDb().prepare('INSERT INTO chat_uploads(id,user_id,path,media_type) VALUES(?,?,?,?)')
      .run(makeId(), req.user.id, path, kind)
    res.json({ path, kind, name: file.originalname || 'ملف', size: file.size })
  })
})

router.use(authenticate)

function messageAccess(db, messageId, userId) {
  return db.prepare(`
    SELECT m.*, c.user1_id, c.user2_id
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = ? AND (c.user1_id = ? OR c.user2_id = ?)
  `).get(messageId, userId, userId)
}

function ownedChatMedia(db, mediaPath, userId) {
  return db.prepare('SELECT path FROM chat_uploads WHERE path = ? AND user_id = ?').get(mediaPath, userId)
}

router.post('/:id/reaction', (req, res) => {
  const db = getDb()
  const message = messageAccess(db, req.params.id, req.user.id)
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' })
  const reaction = req.body?.reaction === 'heart' ? 'heart' : null
  if (!reaction) return res.status(400).json({ error: 'تفاعل غير صالح' })
  const existing = db.prepare('SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?').get(message.id, req.user.id, reaction)
  if (existing) db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id)
  else db.prepare('INSERT INTO message_reactions(id,message_id,user_id,reaction) VALUES(?,?,?,?)').run(makeId(), message.id, req.user.id, reaction)
  const count = db.prepare("SELECT COUNT(*) AS c FROM message_reactions WHERE message_id = ? AND reaction = 'heart'").get(message.id).c
  const reacted = !existing
  const other = message.user1_id === req.user.id ? message.user2_id : message.user1_id
  sendToUser(other, JSON.stringify({ type: 'reaction', message_id: message.id, reactions: count }))
  res.json({ reactions: count, reacted })
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const message = messageAccess(db, req.params.id, req.user.id)
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' })
  if (message.sender_id !== req.user.id) return res.status(403).json({ error: 'يمكنك حذف رسائلك فقط' })
  db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(message.id)
  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id)
  if (message.media) {
    deleteFile(message.media)
    db.prepare('DELETE FROM chat_uploads WHERE path = ? AND user_id = ?').run(message.media, req.user.id)
  }
  const other = message.user1_id === req.user.id ? message.user2_id : message.user1_id
  sendToUser(other, JSON.stringify({ type: 'message-deleted', message_id: message.id }))
  res.json({ ok: true, message_id: message.id })
})

// قائمة محادثاتي
router.get('/conversations', (req, res) => {
  res.json(listConversations(getDb(), req.user.id))
})

// سجل رسائل محادثة مع مستخدم
router.get('/with/:userId', (req, res) => {
  const db = getDb()
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'لا يمكنك محادثة نفسك' })
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' })
  const convId = getOrCreateConversation(db, req.user.id, req.params.userId)
  res.json(getHistory(db, convId, req.user.id))
})

// ارسال رسالة (احتياط عندما يكون WS غير متصل)
router.post('/with/:userId', (req, res) => {
  const db = getDb()
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'لا يمكنك محادثة نفسك' })
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' })
  const text = String(req.body?.text || '').trim()
  const media = typeof req.body?.media === 'string' && req.body.media ? req.body.media : null
  const mediaType = ['image', 'video', 'audio', 'file'].includes(req.body?.media_type) ? req.body.media_type : 'text'
  if (!text && !media) return res.status(400).json({ error: 'الرسالة فارغة' })
  if (media && (!isStoredUploadPath(media, 'chat') || !ownedChatMedia(db, media, req.user.id))) {
    return res.status(403).json({ error: 'ملف الوسائط غير مملوك لهذا الحساب' })
  }
  if (text.length > 1000) return res.status(400).json({ error: 'الرسالة طويلة جداً' })
  const mediaName = typeof req.body?.media_name === 'string' ? req.body.media_name.slice(0, 255) : null
  const mediaSize = Number(req.body?.media_size)
  const convId = getOrCreateConversation(db, req.user.id, req.params.userId)
  const msg = insertMessage(db, convId, req.user.id, text, media, mediaType, mediaName, Number.isSafeInteger(mediaSize) && mediaSize >= 0 ? mediaSize : null)
  const me = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(req.user.id)
  createNotification(db, {
    recipientId: req.params.userId,
    actorId: req.user.id,
    type: 'message',
    entityId: msg.id,
    message: `${me?.name || 'مستخدم'} أرسل لك رسالة`,
  })
  // فوري عبر WS ان كان الطرف الآخر متصلاً
  sendToUser(req.params.userId, JSON.stringify({
    type: 'msg', conversation_id: convId,
    from: { id: req.user.id, name: me?.name || 'مستخدم', avatar: me?.avatar || null },
    ...msg,
  }))
  res.json({ ok: true, conversation_id: convId, ...msg })
})

// تعليم كمقروء
router.post('/with/:userId/read', (req, res) => {
  const db = getDb()
  const [u1, u2] = [req.user.id, req.params.userId].sort()
  const conv = db.prepare('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?').get(u1, u2)
  if (conv) markRead(db, conv.id, req.user.id)
  res.json({ ok: true })
})

// مجموع غير المقروء (شارة)
router.get('/unread', (req, res) => {
  res.json({ unread: unreadTotal(getDb(), req.user.id) })
})

export default router
