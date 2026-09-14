import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { createNotification } from '../services/notifications.js'

const router = Router()

router.get('/friend-requests', authenticate, (req, res) => {
  const rows = getDb().prepare(`
    SELECT fr.id, fr.status, fr.created_at, u.id AS user_id, u.name, u.avatar
    FROM friend_requests fr JOIN users u ON u.id = fr.sender_id
    WHERE fr.recipient_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(req.user.id)
  res.json(rows)
})

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
  let friend_status = 'none'
  if (!is_me && req.user) {
    const request = db.prepare(`
      SELECT status, sender_id FROM friend_requests
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id, u.id, u.id, req.user.id)
    if (request?.status === 'accepted') friend_status = 'accepted'
    else if (request?.status === 'pending') friend_status = request.sender_id === req.user.id ? 'sent' : 'received'
  }
  res.json({ id: u.id, name: u.name, avatar: u.avatar || null, created_at: u.created_at, verified: Boolean(u.verified), ...c, is_following, friend_status, is_me })
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

router.post('/:id/friend-request', authenticate, (req, res) => {
  const db = getDb()
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'غير موجود' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك إرسال طلب لنفسك' })
  const existing = db.prepare(`
    SELECT * FROM friend_requests
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id, target.id, target.id, req.user.id)
  if (existing?.status === 'accepted') return res.json({ status: 'accepted' })
  if (existing?.status === 'pending') {
    if (existing.sender_id === req.user.id) {
      db.prepare('DELETE FROM friend_requests WHERE id = ?').run(existing.id)
      return res.json({ status: 'none' })
    }
    return res.json({ status: 'received' })
  }
  if (existing?.status === 'rejected' && existing.sender_id === req.user.id) {
    db.prepare("UPDATE friend_requests SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(existing.id)
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
    createNotification(db, { recipientId: target.id, actorId: req.user.id, type: 'friend_request', entityId: req.user.id, message: `${actor?.name || 'مستخدم'} أرسل لك طلب صداقة` })
    return res.status(201).json({ status: 'sent' })
  }
  db.prepare('INSERT INTO friend_requests(id,sender_id,recipient_id) VALUES(?,?,?)').run(makeId(), req.user.id, target.id)
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
  createNotification(db, { recipientId: target.id, actorId: req.user.id, type: 'friend_request', entityId: req.user.id, message: `${actor?.name || 'مستخدم'} أرسل لك طلب صداقة` })
  res.status(201).json({ status: 'sent' })
})

router.post('/friend-requests/:id/respond', authenticate, (req, res) => {
  const db = getDb()
  const request = db.prepare("SELECT * FROM friend_requests WHERE id = ? AND recipient_id = ? AND status = 'pending'").get(req.params.id, req.user.id)
  if (!request) return res.status(404).json({ error: 'طلب الصداقة غير موجود' })
  if (req.body?.action === 'accept') {
    db.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = datetime('now') WHERE id = ?").run(request.id)
    db.prepare('INSERT OR IGNORE INTO follows(id,follower_id,following_id) VALUES(?,?,?)').run(makeId(), request.sender_id, request.recipient_id)
    db.prepare('INSERT OR IGNORE INTO follows(id,follower_id,following_id) VALUES(?,?,?)').run(makeId(), request.recipient_id, request.sender_id)
    createNotification(db, { recipientId: request.sender_id, actorId: req.user.id, type: 'friend_accepted', entityId: req.user.id, message: 'تم قبول طلب الصداقة' })
    return res.json({ status: 'accepted' })
  }
  if (req.body?.action === 'reject') {
    db.prepare("UPDATE friend_requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(request.id)
    return res.json({ status: 'none' })
  }
  res.status(400).json({ error: 'الإجراء غير صحيح' })
})

export default router
