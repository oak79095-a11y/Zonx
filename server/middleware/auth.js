import { verifyToken } from '../utils/auth.js'
import { getDb } from '../db.js'

export function authenticate(req, res, next) {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'غير مصرح' })

  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'جلسة منتهية' })
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const database = req.app.locals.database
    const user = req.user?.id && await database.one('SELECT role FROM users WHERE id = ?', [req.user.id])
    if (user?.role !== 'admin') return res.status(403).json({ error: 'ممنوع' })
    next()
  } catch (error) {
    next(error)
  }
}

export function optionalAuth(req, _res, next) {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    try { req.user = verifyToken(token) } catch {}
  }
  next()
}
