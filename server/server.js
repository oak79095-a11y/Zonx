import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb, getDb } from './db.js'
import authRoutes from './routes/auth.js'
import listingRoutes from './routes/listings.js'
import storyRoutes from './routes/stories.js'
import subscriptionRoutes from './routes/subscriptions.js'
import paymentRoutes from './routes/payments.js'
import adminRoutes from './routes/admin.js'
import catalogRoutes from './routes/catalog.js'
import userRoutes from './routes/users.js'
import messageRoutes from './routes/messages.js'
import notificationRoutes from './routes/notifications.js'
import { initWs } from './ws.js'
import { expireListings } from './services/expiration.js'
import { verifyToken } from './utils/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5199
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5199')
if (!FRONTEND_URL) throw new Error('FRONTEND_URL must be set in production')
const frontendPath = path.join(__dirname, '..', 'dist')

const app = express()

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '5mb' }))

// Keep chat media behind authentication. A random file path must not grant access.
app.use('/uploads/listings', express.static(path.join(__dirname, 'uploads', 'listings')))
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')))
app.use('/uploads/stories', express.static(path.join(__dirname, 'uploads', 'stories')))
app.use('/uploads/chat', (req, res, next) => {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).end()
  try {
    const payload = verifyToken(token)
    const userId = payload.id
    const mediaPath = `/uploads/chat/${path.basename(req.path)}`
    const allowed = getDb().prepare(`
      SELECT 1
      FROM chat_uploads cu
      WHERE cu.path = ?
        AND (
          cu.user_id = ? OR EXISTS (
            SELECT 1
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.media = ? AND (c.user1_id = ? OR c.user2_id = ?)
          )
        )
    `).get(mediaPath, userId, mediaPath, userId, userId)
    const admin = payload.role === 'admin'
    if (!allowed && !admin) return res.status(404).end()
    next()
  } catch {
    res.status(401).end()
  }
}, express.static(path.join(__dirname, 'uploads', 'chat')))

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/listings', listingRoutes)
app.use('/api/stories', storyRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/catalog', catalogRoutes)
app.use('/api/users', userRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/notifications', notificationRoutes)

app.get('/health', (_req, res) => res.json({ ok: true, service: 'limon-bazaar' }))

// In production the API, WebSocket endpoint, and SPA share one origin.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path === '/ws') return next()
    res.sendFile(path.join(frontendPath, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

const db = initDb()
expireListings(db)

const httpServer = http.createServer(app)
initWs(httpServer)

httpServer.listen(PORT, () => {
  console.log(`limon-bazaar server running on http://localhost:${PORT}`)
})
