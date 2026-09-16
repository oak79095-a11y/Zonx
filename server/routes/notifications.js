import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { listNotifications, unreadNotifications, markNotificationsRead } from '../services/notifications.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.database
    res.json({ notifications: await listNotifications(db, req.user.id), unread: await unreadNotifications(db, req.user.id) })
  } catch (error) { next(error) }
})

router.post('/read', async (req, res, next) => {
  try {
    await markNotificationsRead(req.app.locals.database, req.user.id)
    res.json({ ok: true, unread: 0 })
  } catch (error) { next(error) }
})

export default router
