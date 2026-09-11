import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { getDb } from '../db.js'
import { listNotifications, unreadNotifications, markNotificationsRead } from '../services/notifications.js'

const router = Router()
router.use(authenticate)

router.get('/', (req, res) => {
  const db = getDb()
  res.json({ notifications: listNotifications(db, req.user.id), unread: unreadNotifications(db, req.user.id) })
})

router.post('/read', (req, res) => {
  const db = getDb()
  markNotificationsRead(db, req.user.id)
  res.json({ ok: true, unread: 0 })
})

export default router
