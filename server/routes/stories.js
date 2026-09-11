import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { createNotification } from '../services/notifications.js'
import { saveFile, deleteFile, ALLOWED_TYPES, MAX_FILE_SIZE } from '../services/storage.js'
import { storyUpload, uploadHandler } from '../middleware/upload.js'

const router = Router()

// مدة بقاء الستوري 24 ساعة
export const STORY_TTL_MS = 24 * 60 * 60 * 1000

function cleanExpiredStories(db) {
  const expired = db.prepare("SELECT media FROM stories WHERE created_at < datetime('now', '-1 day')").all()
  for (const s of expired) deleteFile(s.media)
  db.prepare("DELETE FROM stories WHERE created_at < datetime('now', '-1 day')").run()
}

// عرض الستوريات - للمسجلين فقط
router.get('/', authenticate, (req, res) => {
  const db = getDb()
  cleanExpiredStories(db)
  const rows = db.prepare(`
     SELECT s.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar
    FROM stories s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `).all()
  res.json(rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
     user_name: r.user_name || 'مستخدم',
     user_email: r.user_email || null,
    user_avatar: r.user_avatar || null,
    media: r.media,
    media_type: r.media_type,
    caption: r.caption || null,
    views: r.views || 0,
    created_at: r.created_at,
    mine: r.user_id === req.user.id,
  })))
})

// نشر ستوري (صورة او فيديو) - للمسجلين فقط
router.post('/', authenticate, uploadHandler(storyUpload, (req, res) => {
  const db = getDb()
  const file = req.file
  if (!file) return res.status(400).json({ error: 'لا يوجد ملف' })
  if (!ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'نوع غير مدعوم' })
  if (file.size > MAX_FILE_SIZE) return res.status(400).json({ error: 'الملف كبير جدا' })
  const isVideo = file.mimetype.startsWith('video/')
  const rel = saveFile(file, 'stories')
  const id = makeId()
  const caption = String(req.body?.caption || '').trim().slice(0, 120) || null
  try {
    db.prepare('INSERT INTO stories(id,user_id,media,media_type,caption) VALUES(?,?,?,?,?)').run(id, req.user.id, rel, isVideo ? 'video' : 'image', caption)
  } catch (error) {
    deleteFile(rel)
    throw error
  }
  res.status(201).json({ id, media: rel, media_type: isVideo ? 'video' : 'image', caption })
}))

router.post('/:id/view', authenticate, (req, res) => {
  const db = getDb()
  const story = db.prepare('SELECT id, user_id FROM stories WHERE id = ?').get(req.params.id)
  if (!story) return res.status(404).json({ error: 'غير موجود' })
  const result = db.prepare('INSERT OR IGNORE INTO story_views(story_id, viewer_id) VALUES(?,?)').run(story.id, req.user.id)
  if (result.changes && story.user_id !== req.user.id) {
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
    createNotification(db, {
      recipientId: story.user_id,
      actorId: req.user.id,
      type: 'story_view',
      entityId: story.id,
      message: `${actor?.name || 'مستخدم'} شاهد قصتك`,
    })
  }
  res.json({ ok: true })
})

// حذف ستوري (صاحبه فقط)
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb()
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id)
  if (!story) return res.status(404).json({ error: 'غير موجود' })
  if (story.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'ممنوع' })
  deleteFile(story.media)
  db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
