import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { createNotification } from '../services/notifications.js'

const router = Router()

function counts(db, userId) {
  return {
    followers: db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(userId)?.c || 0,
    following: db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(userId)?.c || 0,
    listings: db.prepare("SELECT COUNT(*) as c FROM listings WHERE user_id = ? AND status = 'active'").get(userId)?.c || 0,
  }
}

// بروفايل عام لأي مستخدم
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDb()
  const u = db.prepare('SELECT id, name, avatar, verified, created_at FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'غير موجود' })
  const c = counts(db, u.id)
  const is_me = req.user?.id === u.id
  const is_following = !is_me && req.user
    ? Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, u.id))
    : false
  res.json({ id: u.id, name: u.name, avatar: u.avatar || null, created_at: u.created_at, verified: Boolean(u.verified), ...c, is_following, is_me })
})

// متابعة / الغاء متابعة (تبديل)
router.post('/:id/follow', authenticate, (req, res) => {
  const db = getDb()
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'غير موجود' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك متابعة نفسك' })
  const existing = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, target.id)
  let following
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id)
    following = false
  } else {
    db.prepare('INSERT INTO follows(id,follower_id,following_id) VALUES(?,?,?)').run(makeId(), req.user.id, target.id)
    following = true
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
    createNotification(db, {
      recipientId: target.id,
      actorId: req.user.id,
      type: 'follow',
      entityId: req.user.id,
      message: `${actor?.name || 'مستخدم'} بدأ بمتابعتك`,
    })
  }
  const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(target.id)?.c || 0
  res.json({ following, followers })
})

export default router
