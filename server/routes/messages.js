import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import {
  getOrCreateConversation, listConversations, getHistory,
  insertMessage, markRead, unreadTotal,
} from '../services/chat.js'
import { saveFile, deleteFile, isStoredUploadPath, MAX_FILE_SIZE } from '../services/storage.js'
import { makeId } from '../utils/auth.js'
import { sendToUser } from '../ws.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { createNotification } from '../services/notifications.js'

const router = Router()

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
})

function mediaKindOf(mime) {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

// رفع وسائط الدردشة (صورة/فيديو/صوت/ملف)
router.post('/upload', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), async (req, res, next) => {
  chatUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'تعذر رفع الملف' })
    const file = req.file
    if (!file) return res.status(400).json({ error: 'لا يوجد ملف' })
    const kind = mediaKindOf(file.mimetype)
    const path = saveFile(file, 'chat')
    try {
      await req.app.locals.database.run('INSERT INTO chat_uploads(id,user_id,path,media_type) VALUES(?,?,?,?)', [makeId(), req.user.id, path, kind])
      res.json({ path, kind, name: file.originalname || 'ملف', size: file.size })
    } catch (error) { next(error) }
  })
})

router.use(authenticate)

async function messageAccess(db, messageId, userId) {
  return db.one(`
    SELECT m.*, c.user1_id, c.user2_id
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = ? AND (c.user1_id = ? OR c.user2_id = ?)
  `, [messageId, userId, userId])
}

async function ownedChatMedia(db, mediaPath, userId) {
  return db.one('SELECT path FROM chat_uploads WHERE path = ? AND user_id = ?', [mediaPath, userId])
}

router.post('/:id/reaction', async (req, res, next) => {
 try {
  const db = req.app.locals.database
  const message = await messageAccess(db, req.params.id, req.user.id)
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' })
  const reaction = req.body?.reaction === 'heart' ? 'heart' : null
  if (!reaction) return res.status(400).json({ error: 'تفاعل غير صالح' })
  const existing = await db.one('SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?', [message.id, req.user.id, reaction])
  if (existing) await db.run('DELETE FROM message_reactions WHERE id = ?', [existing.id])
  else await db.run('INSERT INTO message_reactions(id,message_id,user_id,reaction) VALUES(?,?,?,?)', [makeId(), message.id, req.user.id, reaction])
  const count = Number((await db.one("SELECT COUNT(*) AS c FROM message_reactions WHERE message_id = ? AND reaction = 'heart'", [message.id])).c)
  const reacted = !existing
  const other = message.user1_id === req.user.id ? message.user2_id : message.user1_id
  sendToUser(other, JSON.stringify({ type: 'reaction', message_id: message.id, reactions: count }))
  res.json({ reactions: count, reacted })
 } catch (error) { next(error) }
})

router.delete('/:id', async (req, res, next) => {
 try {
  const db = req.app.locals.database
  const message = await messageAccess(db, req.params.id, req.user.id)
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' })
  if (message.sender_id !== req.user.id) return res.status(403).json({ error: 'يمكنك حذف رسائلك فقط' })
  await db.run('DELETE FROM message_reactions WHERE message_id = ?', [message.id])
  await db.run('DELETE FROM messages WHERE id = ?', [message.id])
  if (message.media) {
    deleteFile(message.media)
    await db.run('DELETE FROM chat_uploads WHERE path = ? AND user_id = ?', [message.media, req.user.id])
  }
  const other = message.user1_id === req.user.id ? message.user2_id : message.user1_id
  sendToUser(other, JSON.stringify({ type: 'message-deleted', message_id: message.id }))
  res.json({ ok: true, message_id: message.id })
 } catch (error) { next(error) }
})

// قائمة محادثاتي
router.get('/conversations', async (req, res, next) => {
 try { res.json(await listConversations(req.app.locals.database, req.user.id)) } catch (error) { next(error) }
})

// سجل رسائل محادثة مع مستخدم
router.get('/with/:userId', async (req, res, next) => {
 try {
  const db = req.app.locals.database
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'لا يمكنك محادثة نفسك' })
  const target = await db.one('SELECT id FROM users WHERE id = ?', [req.params.userId])
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' })
  const convId = await getOrCreateConversation(db, req.user.id, req.params.userId)
  res.json(await getHistory(db, convId, req.user.id))
 } catch (error) { next(error) }
})

// ارسال رسالة (احتياط عندما يكون WS غير متصل)
router.post('/with/:userId', async (req, res, next) => {
 try {
  const db = req.app.locals.database
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'لا يمكنك محادثة نفسك' })
  const target = await db.one('SELECT id FROM users WHERE id = ?', [req.params.userId])
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' })
  const text = String(req.body?.text || '').trim()
  const media = typeof req.body?.media === 'string' && req.body.media ? req.body.media : null
  const mediaType = ['image', 'video', 'audio', 'file'].includes(req.body?.media_type) ? req.body.media_type : 'text'
  if (!text && !media) return res.status(400).json({ error: 'الرسالة فارغة' })
  if (media && (!isStoredUploadPath(media, 'chat') || !(await ownedChatMedia(db, media, req.user.id)))) {
    return res.status(403).json({ error: 'ملف الوسائط غير مملوك لهذا الحساب' })
  }
  if (text.length > 1000) return res.status(400).json({ error: 'الرسالة طويلة جداً' })
  const mediaName = typeof req.body?.media_name === 'string' ? req.body.media_name.slice(0, 255) : null
  const mediaSize = Number(req.body?.media_size)
  const convId = await getOrCreateConversation(db, req.user.id, req.params.userId)
  const msg = await insertMessage(db, convId, req.user.id, text, media, mediaType, mediaName, Number.isSafeInteger(mediaSize) && mediaSize >= 0 ? mediaSize : null)
  const me = await db.one('SELECT name, avatar FROM users WHERE id = ?', [req.user.id])
  await createNotification(db, {
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
 } catch (error) { next(error) }
})

// تعليم كمقروء
router.post('/with/:userId/read', async (req, res, next) => {
 try {
  const db = req.app.locals.database
  const [u1, u2] = [req.user.id, req.params.userId].sort()
  const conv = await db.one('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?', [u1, u2])
  if (conv) await markRead(db, conv.id, req.user.id)
  res.json({ ok: true })
 } catch (error) { next(error) }
})

// مجموع غير المقروء (شارة)
router.get('/unread', async (req, res, next) => {
 try { res.json({ unread: await unreadTotal(req.app.locals.database, req.user.id) }) } catch (error) { next(error) }
})

export default router
