import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'
import { makeId, hashPassword } from '../utils/auth.js'
import { deleteFile } from '../services/storage.js'
import { activateFeatured, activateBusiness } from '../routes/subscriptions.js'
import { v4 as uuid } from 'uuid'
import crypto from 'node:crypto'

const router = Router()

router.use(authenticate, requireAdmin)

// Dashboard stats
router.get('/dashboard', (req, res) => {
  const db = getDb()
  const stats = {
    pending_listings: db.prepare("SELECT COUNT(*) as c FROM listings WHERE status='pending'").get().c,
    active_listings: db.prepare("SELECT COUNT(*) as c FROM listings WHERE status='active'").get().c,
    expired_listings: db.prepare("SELECT COUNT(*) as c FROM listings WHERE status='expired'").get().c,
    pending_payments: db.prepare("SELECT COUNT(*) as c FROM payments WHERE status='pending'").get().c,
    active_subs: db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='active'").get().c,
    total_users: db.prepare("SELECT COUNT(*) as c FROM users").get().c,
    total_stories: db.prepare('SELECT COUNT(*) as c FROM stories').get().c,
    total_messages: db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
    total_conversations: db.prepare('SELECT COUNT(*) as c FROM conversations').get().c,
    total_follows: db.prepare('SELECT COUNT(*) as c FROM follows').get().c,
    unread_notifications: db.prepare('SELECT COUNT(*) as c FROM notifications WHERE read_at IS NULL').get().c,
  }
  res.json(stats)
})

// Operational activity only. E2EE or sensitive message bodies are never returned.
router.get('/activity', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT m.id, m.created_at, m.media_type, c.user1_id, c.user2_id
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    ORDER BY m.created_at DESC LIMIT 40
  `).all()
  res.json(rows.map((row, index) => ({
    id: `ACT-${String(index + 1).padStart(3, '0')}`,
    type: row.media_type === 'text' ? 'رسالة نصية' : `وسائط: ${row.media_type}`,
    scope: `محادثة-${String(row.id).slice(0, 6).toUpperCase()}`,
    participants: `${maskId(row.user1_id)} / ${maskId(row.user2_id)}`,
    created_at: row.created_at,
    privacy: 'المحتوى محمي',
  })))
})

router.get('/conversations', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT c.id, c.last_message_at, c.created_at,
      u1.name AS user1_name, u2.name AS user2_name,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
      (SELECT media_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_media_type
    FROM conversations c
    LEFT JOIN users u1 ON u1.id = c.user1_id
    LEFT JOIN users u2 ON u2.id = c.user2_id
    ORDER BY c.last_message_at DESC
  `).all()
  res.json(rows.map((row) => ({
    id: row.id,
    reference: `CHAT-${String(row.id).slice(0, 8).toUpperCase()}`,
    participants: `${maskName(row.user1_name)} / ${maskName(row.user2_name)}`,
    message_count: row.message_count,
    last_media_type: row.last_media_type,
    last_message_at: row.last_message_at,
  })))
})

router.post('/conversations/:id/observe', (req, res) => {
  const db = getDb()
  const conversation = db.prepare('SELECT id FROM conversations WHERE id = ?').get(req.params.id)
  const reason = String(req.body?.reason || '').trim().slice(0, 300)
  if (!conversation) return res.status(404).json({ error: 'المحادثة غير موجودة' })
  if (reason.length < 8) return res.status(400).json({ error: 'سبب المراقبة مطلوب (8 أحرف على الأقل)' })
  const sessionId = uuid()
  db.prepare('INSERT INTO compliance_sessions(id,admin_id,conversation_id,reason,expires_at) VALUES(?,?,?,?,datetime(\'now\', \'+15 minutes\'))')
    .run(sessionId, req.user.id, conversation.id, reason)
  db.prepare('INSERT INTO compliance_audit(id,admin_id,action,conversation_id,reason) VALUES(?,?,?,?,?)')
    .run(uuid(), req.user.id, 'observation_started', conversation.id, reason)
  res.json({ session: sessionId, expires_in: 900 })
})

router.get('/conversations/:id/messages', (req, res) => {
  const db = getDb()
  const session = db.prepare(`
    SELECT id FROM compliance_sessions
    WHERE id = ? AND admin_id = ? AND conversation_id = ? AND expires_at > datetime('now')
  `).get(String(req.query.session || ''), req.user.id, req.params.id)
  if (!session) return res.status(403).json({ error: 'جلسة المراقبة غير صالحة أو منتهية' })
  const rows = db.prepare(`
    SELECT m.id, m.text, m.media, m.media_type, m.media_name, m.media_size, m.created_at,
      CASE WHEN m.sender_id = c.user1_id THEN 'طرف-أ' ELSE 'طرف-ب' END AS sender_label
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 500
  `).all(req.params.id)
  db.prepare('INSERT INTO compliance_audit(id,admin_id,action,conversation_id,reason) VALUES(?,?,?,?,?)')
    .run(uuid(), req.user.id, 'messages_viewed', req.params.id, 'جلسة مراقبة معتمدة')
  res.json(rows)
})

// Listings: list + approve/reject
router.get('/listings', (req, res) => {
  const db = getDb()
  const status = req.query.status || 'pending'
  const rows = db.prepare(`
    SELECT l.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
      GROUP_CONCAT(li.path, '|') as images
    FROM listings l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN listing_images li ON li.listing_id = l.id
    WHERE l.status = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all(status)
  res.json(rows.map(mapListing))
})

router.patch('/listings/:id', (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  const { status, note } = req.body || {}
  if (status === 'approved') {
    const settings = {
      free_listing_days: Number(db.prepare("SELECT value FROM admin_settings WHERE key='free_listing_days'").get()?.value || 15),
    }
    const expiresAt = new Date(Date.now() + settings.free_listing_days * 24 * 60 * 60 * 1000).toISOString()
    db.prepare("UPDATE listings SET status='active', expires_at=? WHERE id=?").run(expiresAt, req.params.id)
  } else if (status === 'rejected') {
    db.prepare("UPDATE listings SET status='rejected' WHERE id=?").run(req.params.id)
  } else {
    return res.status(400).json({ error: 'حالة غير صحيحة' })
  }
  res.json({ id: req.params.id, status: status === 'approved' ? 'active' : 'rejected' })
})

router.delete('/listings/:id', (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  const images = db.prepare('SELECT path FROM listing_images WHERE listing_id = ?').all(req.params.id)
  db.exec('BEGIN')
  try {
    for (const img of images) deleteFile(img.path)
    db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(req.params.id)
    db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.json({ ok: true })
})

// Payments: list + approve
router.get('/payments', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT p.*, u.name as user_name
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `).all()
  res.json(rows)
})

router.post('/payments/:id/approve', (req, res) => {
  const db = getDb()
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id)
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' })
  if (payment.status !== 'pending') return res.status(400).json({ error: 'الدفعة تم معالجتها' })

  let result = null
  if (payment.listing_id) {
    result = activateFeatured(db, req.params.id)
  } else {
    result = activateBusiness(db, req.params.id)
  }
  if (!result) return res.status(500).json({ error: 'تعذّر التفعيل' })
  res.json({ ok: true, ...result })
})

router.post('/payments/:id/reject', (req, res) => {
  const db = getDb()
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id)
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' })
  if (payment.status !== 'pending') return res.status(400).json({ error: 'الدفعة تم معالجتها' })
  db.prepare("UPDATE payments SET status='rejected' WHERE id=?").run(req.params.id)
  res.json({ ok: true })
})

// Catalog management
router.get('/catalog', (req, res) => {
  const db = getDb()
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all()
  const cities = db.prepare('SELECT * FROM cities ORDER BY sort_order').all()
  res.json({ categories, cities })
})

router.post('/categories', (req, res) => {
  const db = getDb()
  const { name, icon, description } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  const id = makeId()
  db.prepare('INSERT INTO categories(id,name,icon,description,sort_order) VALUES(?,?,?,?,0)').run(id, name.trim(), icon || null, description || null)
  res.json({ id, name: name.trim() })
})

router.post('/cities', (req, res) => {
  const db = getDb()
  const { name } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  const id = makeId()
  db.prepare('INSERT INTO cities(id,name,sort_order) VALUES(?,?,0)').run(id, name.trim())
  res.json({ id, name: name.trim() })
})

router.delete('/categories/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.delete('/cities/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM cities WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// Users management
router.get('/users', (req, res) => {
  const db = getDb()
  const search = (req.query.q || '').trim()
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar, u.verified, u.created_at,
      (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id) as listings
    FROM users u
    WHERE (? = '' OR u.name LIKE '%' || ? || '%' OR u.email LIKE '%' || ? || '%' OR u.phone LIKE '%' || ? || '%')
    ORDER BY u.created_at DESC
  `).all(search, search, search, search)
  res.json(rows.map((u) => ({ ...u, verified: Boolean(u.verified) })))
})

router.post('/users/:id/verify', (req, res) => {
  const db = getDb()
  const u = db.prepare('SELECT id, verified FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' })
  if (u.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك توثيق نفسك' })
  const verified = u.verified ? 0 : 1
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(verified, req.params.id)
  res.json({ id: u.id, verified: Boolean(verified) })
})

router.post('/users/:id/reset-password', (req, res) => {
  const db = getDb()
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' })
  if (user.role === 'admin') return res.status(403).json({ error: 'لا يمكن إعادة تعيين كلمة مرور مدير من هنا' })
  const temporaryPassword = `Bdr-${crypto.randomBytes(9).toString('base64url')}-9!`
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(temporaryPassword), user.id)
  db.prepare('INSERT INTO compliance_audit(id,admin_id,action,reason) VALUES(?,?,?,?)')
    .run(uuid(), req.user.id, 'password_reset', `تم إنشاء كلمة مرور مؤقتة للمستخدم ${user.id}`)
  res.json({ ok: true, temporaryPassword, expiresIn: 'يجب تغييرها عند أول دخول' })
})

function mapListing(row) {
  if (!row) return null
  const images = (row.images || '').split('|').filter(Boolean)
  return {
    id: row.id, title: row.title, description: row.description, price: row.price,
    category_id: row.category_id, city_id: row.city_id, status: row.status,
    featured: Boolean(row.featured), featured_until: row.featured_until,
    expires_at: row.expires_at, views: row.views, created_at: row.created_at,
    user_name: row.user_name, user_email: row.user_email, user_phone: row.user_phone,
    images,
  }
}

function maskId(value) {
  const text = String(value || '')
  return text.length > 6 ? `${text.slice(0, 3)}•••${text.slice(-2)}` : 'مستخدم•••'
}

function maskName(value) {
  const text = String(value || 'مستخدم')
  return text.length > 2 ? `${text.slice(0, 1)}•••` : 'مستخدم•••'
}

export default router
