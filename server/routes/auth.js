import { Router } from 'express'
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

const router = Router()
const SESSION_TTL_DAYS = Math.max(Number(process.env.SESSION_TTL_DAYS || 365), 1)
const SESSION_MAX_AGE = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

function setSession(res, user) {
  const token = signToken({ id: user.id, role: user.role }, `${SESSION_TTL_DAYS}d`)
  res.cookie('session', token, {
    httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE, secure: process.env.NODE_ENV === 'production',
  })
  return token
}

router.post('/register', rateLimit({ max: 5 }), async (req, res, next) => {
  try {
    const { email, phone, password, name } = req.body || {}
    if (!password || password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' })
    if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
    if (!email && !phone) return res.status(400).json({ error: 'البريد أو رقم الهاتف مطلوب' })
    const db = req.app.locals.database
    const existing = await db.one('SELECT id FROM users WHERE email = ? OR phone = ?', [email || null, phone || null])
    if (existing) return res.status(409).json({ error: 'الحساب موجود بالفعل' })
    const id = makeId()
    await db.run('INSERT INTO users(id,email,phone,password,name,role) VALUES(?,?,?,?,?,?)', [id, email || null, phone || null, hashPassword(password), name.trim(), 'user'])
    const token = setSession(res, { id, role: 'user' })
    res.json({ ...publicUser(await db.one('SELECT * FROM users WHERE id = ?', [id])), token })
  } catch (error) { next(error) }
})

router.post('/login', rateLimit({ max: 5 }), async (req, res, next) => {
  try {
    const { email, phone, name, password } = req.body || {}
    const identifier = email || phone || name
    if (!identifier || !password) return res.status(400).json({ error: 'البيانات ناقصة' })
    const user = await req.app.locals.database.one('SELECT * FROM users WHERE email = ? OR phone = ? OR name = ?', [email || null, phone || null, name || identifier])
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'البيانات غير صحيحة' })
    const token = setSession(res, user)
    res.json({ ...publicUser(user), token })
  } catch (error) { next(error) }
})

router.post('/google', rateLimit({ max: 10 }), async (req, res) => {
  const credential = String(req.body?.credential || '')
  if (!credential || !process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'تسجيل الدخول عبر Google غير مفعّل حاليا' })
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
    const profile = await response.json()
    if (!response.ok || profile.aud !== process.env.GOOGLE_CLIENT_ID || profile.email_verified !== 'true' || !profile.email) return res.status(401).json({ error: 'تعذر التحقق من حساب Google' })
    const db = req.app.locals.database
    let user = await db.one('SELECT * FROM users WHERE email = ?', [profile.email])
    if (!user) {
      const id = makeId()
      await db.run('INSERT INTO users(id,email,password,name,role,avatar) VALUES(?,?,?,?,?,?)', [id, profile.email, hashPassword(crypto.randomBytes(32).toString('hex')), profile.name || profile.email.split('@')[0], 'user', profile.picture || null])
      user = await db.one('SELECT * FROM users WHERE id = ?', [id])
    }
    const token = setSession(res, user)
    res.json({ ...publicUser(user), token })
  } catch { res.status(502).json({ error: 'تعذر الاتصال بخدمة Google' }) }
})

router.post('/logout', (_req, res) => {
  res.clearCookie('session', { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' })
  res.json({ ok: true })
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await req.app.locals.database.one('SELECT * FROM users WHERE id = ?', [req.user.id])
    if (!user) return res.status(404).json({ error: 'غير موجود' })
    setSession(res, user)
    res.json(publicUser(user))
  } catch (error) { next(error) }
})

router.post('/avatar', authenticate, uploadHandler(singleUpload, async (req, res) => {
  const file = req.file
  if (!file || !file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'صورة غير صحيحة' })
  const rel = saveFile(file, 'avatars')
  await req.app.locals.database.run('UPDATE users SET avatar = ? WHERE id = ?', [rel, req.user.id])
  res.json({ avatar: rel })
}))

router.post('/update', authenticate, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body || {}
    const db = req.app.locals.database
    if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
    if (!email && !phone) return res.status(400).json({ error: 'البريد أو رقم الهاتف مطلوب' })
    if (email && await db.one('SELECT id FROM users WHERE email = ? AND id != ?', [email.trim(), req.user.id])) return res.status(409).json({ error: 'البريد مستخدم بحساب آخر' })
    if (phone && await db.one('SELECT id FROM users WHERE phone = ? AND id != ?', [phone.trim(), req.user.id])) return res.status(409).json({ error: 'الهاتف مستخدم بحساب آخر' })
    await db.run('UPDATE users SET name=?, email=?, phone=? WHERE id=?', [name.trim(), email?.trim() || null, phone?.trim() || null, req.user.id])
    res.json(publicUser(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])))
  } catch (error) { next(error) }
})

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body || {}
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'كلمة السر الجديدة 6 أحرف على الأقل' })
    const db = req.app.locals.database
    const user = await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])
    if (!verifyPassword(oldPassword, user?.password)) return res.status(401).json({ error: 'كلمة السر القديمة غير صحيحة' })
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), req.user.id])
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
