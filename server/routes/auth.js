import { Router } from 'express'
import { getDb } from '../db.js'
import { signToken, verifyPassword, hashPassword, makeId } from '../utils/auth.js'
import { authenticate } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { singleUpload, uploadHandler } from '../middleware/upload.js'
import { saveFile } from '../services/storage.js'
import crypto from 'node:crypto'

function publicUser(u) {
  if (!u) return null
  return { id: u.id, email: u.email, phone: u.phone, name: u.name, role: u.role, avatar: u.avatar || null }
}

function setSession(res, user) {
  res.cookie('session', signToken({ id: user.id, role: user.role }), {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  })
}

const router = Router()

router.post('/register', rateLimit({ max: 5 }), (req, res) => {
  const db = getDb()
  const { email, phone, password, name } = req.body || {}

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' })
  }
  if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  if (!email && !phone) return res.status(400).json({ error: 'البريد أو رقم الهاتف مطلوب' })

  const existing = db.prepare(
    'SELECT id FROM users WHERE email = ? OR phone = ?'
  ).get(email || null, phone || null)
  if (existing) return res.status(409).json({ error: 'الحساب موجود بالفعل' })

  const id = makeId()
  db.prepare(
    'INSERT INTO users(id,email,phone,password,name,role) VALUES(?,?,?,?,?,?)'
  ).run(id, email || null, phone || null, hashPassword(password), name.trim(), 'user')

  const token = signToken({ id, role: 'user' })
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  })
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)))
})

router.post('/login', rateLimit({ max: 5 }), (req, res) => {
  const db = getDb()
  const { email, phone, name, password } = req.body || {}
  const identifier = email || phone || name
  if (!identifier || !password) return res.status(400).json({ error: 'البيانات ناقصة' })

  const user = db.prepare(
    'SELECT * FROM users WHERE email = ? OR phone = ? OR name = ?'
  ).get(email || null, phone || null, name || identifier)

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'البيانات غير صحيحة' })
  }

  const token = signToken({ id: user.id, role: user.role })
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  })
  res.json(publicUser(user))
})

// Google Identity Services sends a signed ID token. Google verifies it and the
// server creates or reuses the local account, so the browser never gets a JWT.
router.post('/google', rateLimit({ max: 10 }), async (req, res) => {
  const credential = String(req.body?.credential || '')
  if (!credential || !process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'تسجيل الدخول عبر Google غير مفعّل حاليا' })
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
    const profile = await response.json()
    if (!response.ok || profile.aud !== process.env.GOOGLE_CLIENT_ID || profile.email_verified !== 'true' || !profile.email) {
      return res.status(401).json({ error: 'تعذر التحقق من حساب Google' })
    }
    const db = getDb()
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email)
    if (!user) {
      const id = makeId()
      db.prepare('INSERT INTO users(id,email,password,name,role,avatar) VALUES(?,?,?,?,?,?)')
        .run(id, profile.email, hashPassword(crypto.randomBytes(32).toString('hex')), profile.name || profile.email.split('@')[0], 'user', profile.picture || null)
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    }
    setSession(res, user)
    res.json(publicUser(user))
  } catch {
    res.status(502).json({ error: 'تعذر الاتصال بخدمة Google' })
  }
})

router.post('/logout', (_req, res) => {
  res.clearCookie('session', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  res.json({ ok: true })
})

router.get('/me', authenticate, (req, res) => {
  const db = getDb()
  const user = db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).get(req.user.id)
  if (!user) return res.status(404).json({ error: 'غير موجود' })
  res.json(publicUser(user))
})

// رفع الصورة الشخصية
router.post('/avatar', authenticate, uploadHandler(singleUpload, (req, res) => {
  const db = getDb()
  const file = req.file
  if (!file || !file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'صورة غير صحيحة' })
  if (file.size > 5 * 1024 * 1024) return res.status(400).json({ error: 'الصورة كبيرة جدا (الحد 5MB)' })
  const rel = saveFile(file, 'avatars')
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(rel, req.user.id)
  res.json({ avatar: rel })
}))

// تحديث البيانات الشخصية
router.post('/update', authenticate, (req, res) => {
  const db = getDb()
  const { name, email, phone } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
  if (!email && !phone) return res.status(400).json({ error: 'البريد أو رقم الهاتف مطلوب' })
  if (email) {
    const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.trim(), req.user.id)
    if (dup) return res.status(409).json({ error: 'البريد مستخدم بحساب آخر' })
  }
  if (phone) {
    const dup = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone.trim(), req.user.id)
    if (dup) return res.status(409).json({ error: 'الهاتف مستخدم بحساب آخر' })
  }
  db.prepare('UPDATE users SET name=?, email=?, phone=? WHERE id=?')
    .run(name.trim(), email?.trim() || null, phone?.trim() || null, req.user.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)))
})

router.post('/change-password', authenticate, (req, res) => {
  const db = getDb()
  const { oldPassword, newPassword } = req.body || {}
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'كلمة السر الجديدة 6 أحرف على الأقل' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!verifyPassword(oldPassword, user.password)) return res.status(401).json({ error: 'كلمة السر القديمة غير صحيحة' })
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id)
  res.json({ ok: true })
})

export default router
