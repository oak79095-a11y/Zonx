import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { singleUpload, uploadHandler } from '../middleware/upload.js'
import { ALLOWED_TYPES, saveFile, deleteFile } from '../services/storage.js'
import { createNotification } from '../services/notifications.js'
import { makeId } from '../utils/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = Router()

function mediaTypeOf(mimetype) {
  if (mimetype?.startsWith('image/')) return 'image'
  if (mimetype?.startsWith('video/')) return 'video'
  return 'text'
}

function mapPost(row, userId = null) {
  return {
    id: row.id,
    user_id: row.user_id,
    author: {
      id: row.user_id,
      name: row.user_name || 'مستخدم',
      avatar: row.user_avatar || null,
      verified: Boolean(row.user_verified),
    },
    content: row.content,
    media: row.media || null,
    media_type: row.media_type,
    created_at: row.created_at,
    likes: Number(row.likes || 0),
    comments: Number(row.comments || 0),
    shares: Number(row.share_count || 0),
    liked: Boolean(userId && row.liked),
    following: Boolean(row.following),
  }
}

router.get('/feed', optionalAuth, (req, res) => {
  const db = getDb()
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 40)
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
  const userId = req.user?.id || null
  const rows = db.prepare(`
    SELECT
      p.*,
      u.name AS user_name,
      u.avatar AS user_avatar,
      u.verified AS user_verified,
      (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
      (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments,
      CASE WHEN ? IS NOT NULL AND EXISTS(
        SELECT 1 FROM post_likes me WHERE me.post_id = p.id AND me.user_id = ?
      ) THEN 1 ELSE 0 END AS liked,
      CASE WHEN ? IS NOT NULL AND EXISTS(
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = p.user_id
      ) THEN 1 ELSE 0 END AS following
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.visibility = 'public'
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, userId, userId, userId, limit, offset)

  res.json(rows.map((row) => mapPost(row, userId)))
})

router.post('/', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), uploadHandler(singleUpload, (req, res) => {
  const db = getDb()
  const content = String(req.body?.content || '').trim()
  const file = req.file
  if (!content && !file) return res.status(400).json({ error: 'اكتب شيئاً أو أرفق وسائط' })
  if (content.length > 5000) return res.status(400).json({ error: 'المنشور طويل جداً' })
  if (file && !ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'نوع الوسائط غير مدعوم' })

  const mediaType = file ? mediaTypeOf(file.mimetype) : 'text'
  const media = file ? saveFile(file, 'posts') : null
  const id = makeId()
  try {
    db.prepare(`
      INSERT INTO posts(id,user_id,content,media,media_type)
      VALUES(?,?,?,?,?)
    `).run(id, req.user.id, content, media, mediaType)
  } catch (error) {
    if (media) deleteFile(media)
    throw error
  }

  const row = db.prepare(`
    SELECT p.*, u.name AS user_name, u.avatar AS user_avatar, u.verified AS user_verified,
      0 AS likes, 0 AS comments, 0 AS liked, 0 AS following
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(id)
  res.status(201).json(mapPost(row, req.user.id))
}))

router.post('/:id/like', authenticate, rateLimit({ windowMs: 60 * 1000, max: 60 }), (req, res) => {
  const db = getDb()
  const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ? AND visibility = ?').get(req.params.id, 'public')
  if (!post) return res.status(404).json({ error: 'المنشور غير موجود' })
  const liked = req.body?.liked !== false
  if (liked) {
    const result = db.prepare('INSERT OR IGNORE INTO post_likes(id,post_id,user_id) VALUES(?,?,?)').run(makeId(), post.id, req.user.id)
    if (result.changes && post.user_id !== req.user.id) {
      const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
      createNotification(db, { recipientId: post.user_id, actorId: req.user.id, type: 'post_like', entityId: post.id, message: `${actor?.name || 'مستخدم'} أعجب بمنشورك` })
    }
  } else {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id)
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(post.id).c
  res.json({ liked, likes: count })
})

router.get('/:id/comments', (req, res) => {
  const rows = getDb().prepare(`
    SELECT pc.id, pc.text, pc.created_at, u.id AS user_id, u.name, u.avatar
    FROM post_comments pc JOIN users u ON u.id = pc.user_id
    WHERE pc.post_id = ? ORDER BY pc.created_at DESC LIMIT 100
  `).all(req.params.id)
  res.json(rows)
})

router.post('/:id/comments', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), (req, res) => {
  const db = getDb()
  const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ? AND visibility = ?').get(req.params.id, 'public')
  const text = String(req.body?.text || '').trim()
  if (!post) return res.status(404).json({ error: 'المنشور غير موجود' })
  if (!text || text.length > 500) return res.status(400).json({ error: 'التعليق غير صالح' })
  const id = makeId()
  db.prepare('INSERT INTO post_comments(id,post_id,user_id,text) VALUES(?,?,?,?)').run(id, post.id, req.user.id, text)
  if (post.user_id !== req.user.id) {
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
    createNotification(db, { recipientId: post.user_id, actorId: req.user.id, type: 'post_comment', entityId: post.id, message: `${actor?.name || 'مستخدم'} علّق على منشورك` })
  }
  const user = db.prepare('SELECT id AS user_id, name, avatar FROM users WHERE id = ?').get(req.user.id)
  res.status(201).json({ id, text, created_at: new Date().toISOString(), ...user })
})

router.post('/:id/share', authenticate, rateLimit({ windowMs: 60 * 1000, max: 30 }), (req, res) => {
  const result = getDb().prepare("UPDATE posts SET share_count = share_count + 1 WHERE id = ? AND visibility = 'public'").run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'المنشور غير موجود' })
  const shares = getDb().prepare('SELECT share_count FROM posts WHERE id = ?').get(req.params.id).share_count
  res.json({ shares })
})

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb()
  const post = db.prepare('SELECT media FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!post) return res.status(404).json({ error: 'المنشور غير موجود' })
  if (post.media) deleteFile(post.media)
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
