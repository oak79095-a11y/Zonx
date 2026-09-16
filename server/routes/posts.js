import { Router } from 'express'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { singleUpload, uploadHandler } from '../middleware/upload.js'
import { ALLOWED_TYPES } from '../services/storage.js'
import { uploadMedia, destroyMedia } from '../services/media/index.js'
import { createNotification } from '../services/notifications.js'
import { makeId } from '../utils/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = Router()
const mediaTypeOf = (type) => type?.startsWith('image/') ? 'image' : type?.startsWith('video/') ? 'video' : 'text'
function mapPost(row, userId = null) {
  return { id: row.id, user_id: row.user_id, author: { id: row.user_id, name: row.user_name || 'مستخدم', avatar: row.user_avatar || null, verified: Boolean(row.user_verified) }, content: row.content, media: row.media || null, media_type: row.media_type, media_provider: row.media_provider || null, created_at: row.created_at, likes: Number(row.likes || 0), comments: Number(row.comments || 0), shares: Number(row.share_count || 0), liked: Boolean(userId && row.liked), following: Boolean(row.following) }
}
const postSelect = `SELECT p.*, u.name AS user_name, u.avatar AS user_avatar, u.verified AS user_verified, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes, (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments, CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM post_likes me WHERE me.post_id = p.id AND me.user_id = ?) THEN 1 ELSE 0 END AS liked, CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = p.user_id) THEN 1 ELSE 0 END AS following FROM posts p JOIN users u ON u.id = p.user_id WHERE p.visibility = 'public'`

router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || null
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 40)
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
    const rows = await req.app.locals.database.many(`${postSelect} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [userId, userId, userId, userId, limit, offset])
    res.json(rows.map((row) => mapPost(row, userId)))
  } catch (error) { next(error) }
})

router.post('/', authenticate, rateLimit({ windowMs: 60000, max: 20 }), uploadHandler(singleUpload, async (req, res) => {
  const db = req.app.locals.database
  const content = String(req.body?.content || '').trim(); const file = req.file
  if (!content && !file) return res.status(400).json({ error: 'اكتب شيئاً أو أرفق وسائط' })
  if (content.length > 5000) return res.status(400).json({ error: 'المنشور طويل جداً' })
  if (file && !ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'نوع الوسائط غير مدعوم' })
  const asset = file ? await uploadMedia(file, 'posts') : null; const id = makeId()
  try { await db.run('INSERT INTO posts(id,user_id,content,media,media_public_id,media_provider,media_type) VALUES(?,?,?,?,?,?,?)', [id, req.user.id, content, asset?.url || null, asset?.publicId || null, asset?.provider || null, file ? mediaTypeOf(file.mimetype) : 'text']) } catch (error) { if (asset) await destroyMedia(asset); throw error }
  const row = await db.one(`${postSelect} AND p.id = ?`, [req.user.id, req.user.id, req.user.id, req.user.id, id])
  res.status(201).json(mapPost(row, req.user.id))
}))

router.post('/:id/like', authenticate, rateLimit({ windowMs: 60000, max: 60 }), async (req, res, next) => {
  try {
    const db = req.app.locals.database; const post = await db.one('SELECT id, user_id FROM posts WHERE id = ? AND visibility = ?', [req.params.id, 'public'])
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' }); const liked = req.body?.liked !== false
    if (liked) { const result = await db.run('INSERT INTO post_likes(id,post_id,user_id) VALUES(?,?,?) ON CONFLICT (post_id,user_id) DO NOTHING', [makeId(), post.id, req.user.id]); if (result.rowCount && post.user_id !== req.user.id) { const actor = await db.one('SELECT name FROM users WHERE id = ?', [req.user.id]); await createNotification(db, { recipientId: post.user_id, actorId: req.user.id, type: 'post_like', entityId: post.id, message: `${actor?.name || 'مستخدم'} أعجب بمنشورك` }) } } else await db.run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [post.id, req.user.id])
    const count = await db.one('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?', [post.id]); res.json({ liked, likes: Number(count.c) })
  } catch (error) { next(error) }
})

router.get('/:id/comments', async (req, res, next) => { try { res.json(await req.app.locals.database.many('SELECT pc.id, pc.text, pc.created_at, u.id AS user_id, u.name, u.avatar FROM post_comments pc JOIN users u ON u.id = pc.user_id WHERE pc.post_id = ? ORDER BY pc.created_at DESC LIMIT 100', [req.params.id])) } catch (error) { next(error) } })
router.post('/:id/comments', authenticate, rateLimit({ windowMs: 60000, max: 20 }), async (req, res, next) => { try { const db = req.app.locals.database; const post = await db.one('SELECT id, user_id FROM posts WHERE id = ? AND visibility = ?', [req.params.id, 'public']); const text = String(req.body?.text || '').trim(); if (!post) return res.status(404).json({ error: 'المنشور غير موجود' }); if (!text || text.length > 500) return res.status(400).json({ error: 'التعليق غير صالح' }); const id = makeId(); await db.run('INSERT INTO post_comments(id,post_id,user_id,text) VALUES(?,?,?,?)', [id, post.id, req.user.id, text]); if (post.user_id !== req.user.id) { const actor = await db.one('SELECT name FROM users WHERE id = ?', [req.user.id]); await createNotification(db, { recipientId: post.user_id, actorId: req.user.id, type: 'post_comment', entityId: post.id, message: `${actor?.name || 'مستخدم'} علّق على منشورك` }) } const user = await db.one('SELECT id AS user_id, name, avatar FROM users WHERE id = ?', [req.user.id]); res.status(201).json({ id, text, created_at: new Date().toISOString(), ...user }) } catch (error) { next(error) } })
router.post('/:id/share', authenticate, async (req, res, next) => { try { const db = req.app.locals.database; const result = await db.run("UPDATE posts SET share_count = share_count + 1 WHERE id = ? AND visibility = 'public'", [req.params.id]); if (!result.rowCount) return res.status(404).json({ error: 'المنشور غير موجود' }); const row = await db.one('SELECT share_count FROM posts WHERE id = ?', [req.params.id]); res.json({ shares: row.share_count }) } catch (error) { next(error) } })
router.delete('/:id', authenticate, async (req, res, next) => { try { const db = req.app.locals.database; const post = await db.one('SELECT media, media_public_id, media_provider, media_type FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]); if (!post) return res.status(404).json({ error: 'المنشور غير موجود' }); if (post.media) await destroyMedia({ url: post.media, publicId: post.media_public_id, provider: post.media_provider, resourceType: post.media_type }); await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]); res.json({ ok: true }) } catch (error) { next(error) } })
export default router
