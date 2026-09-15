import express from 'express'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_PATH, initDb, getDb } from './db.js'
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
import postRoutes from './routes/posts.js'
import { initWs } from './ws.js'
import { expireListings, startExpirationJob } from './services/expiration.js'
import { verifyToken } from './utils/auth.js'
import { UPLOAD_DIR } from './services/storage.js'
import { CLASSIFIEDS_ENABLED } from './config/features.js'
import { mediaProviderName } from './services/media/index.js'
import { createDatabaseAdapter } from './db/adapter.js'
import { closePostgres, verifyPostgres } from './db/postgres.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5199
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
  ? 'https://oak79095-a11y.github.io'
  : 'http://localhost:5199')
const frontendPath = path.join(__dirname, '..', 'dist')

const app = express()

// Trust the first proxy hop (Render/nginx) so req.ip and rate limits see real client IPs.
app.set('trust proxy', 1)
// Keep-alive + gzip shrink JSON/HTML payloads several times under load.
app.use(compression())

// Basic hardening headers (no CSP: the SPA uses inline assets).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '5mb' }))

// Cookies are intentionally cross-site for the GitHub Pages frontend. Require a
// matching browser Origin on state-changing requests to prevent CSRF.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (!origin) return next()
  const allowed = new Set([FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5199'])
  try {
    if (!allowed.has(new URL(origin).origin)) return res.status(403).json({ error: 'مصدر الطلب غير مسموح' })
  } catch {
    return res.status(403).json({ error: 'مصدر الطلب غير صالح' })
  }
  next()
})

// Uploads carry random UUID names and never change in place -> cache them forever.
const STATIC_OPTS = { maxAge: '365d', immutable: true, fallthrough: true }

// Keep chat media behind authentication. A random file path must not grant access.
app.use('/uploads/listings', express.static(path.join(UPLOAD_DIR, 'listings'), STATIC_OPTS))
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars'), STATIC_OPTS))
app.use('/uploads/stories', express.static(path.join(UPLOAD_DIR, 'stories'), STATIC_OPTS))
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
    // Authenticated media: cacheable per-user only, never by shared proxies.
    res.setHeader('Cache-Control', 'private, max-age=86400')
    next()
  } catch {
    res.status(401).end()
  }
}, express.static(path.join(UPLOAD_DIR, 'chat'), { maxAge: '1d', fallthrough: true }))

// API routes
app.use('/api/auth', authRoutes)
if (CLASSIFIEDS_ENABLED) app.use('/api/listings', listingRoutes)
app.use('/api/stories', storyRoutes)
if (CLASSIFIEDS_ENABLED) {
  app.use('/api/subscriptions', subscriptionRoutes)
  app.use('/api/payments', paymentRoutes)
}
app.use('/api/admin', adminRoutes)
app.use('/api/catalog', catalogRoutes)
app.use('/api/users', userRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/posts', postRoutes)

app.get('/health', async (_req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get()
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM listings
    `).get()
    const users = db.prepare('SELECT COUNT(*) AS total FROM users').get()
    const postgres = await verifyPostgres()
    res.json({
      ok: true,
      service: 'limon-bazaar',
      database: 'ok',
      storage: DB_PATH.startsWith('/data/') ? 'persistent-disk' : 'local-filesystem',
      listings: {
        total: Number(totals?.total || 0),
        active: Number(totals?.active || 0),
      },
      users: Number(users?.total || 0),
      retention: {
        listings: Number(process.env.LISTING_EXPIRATION_DAYS ?? 0) > 0 ? '期限ية' : 'دائمة',
        stories: Number(process.env.STORY_RETENTION_DAYS ?? 0) > 0 ? '期限ية' : 'دائمة',
      },
      drivers: {
        database: postgres.enabled ? 'postgres-configured-sqlite-active' : 'sqlite',
        classifieds: CLASSIFIEDS_ENABLED,
        media: mediaProviderName,
      },
    })
  } catch {
    res.status(503).json({ ok: false, service: 'limon-bazaar', database: 'error' })
  }
})

// In production the API, WebSocket endpoint, and SPA share one origin.
if (process.env.NODE_ENV === 'production') {
  // Hashed Vite assets are immutable; index.html must always be revalidated.
  app.use(express.static(frontendPath, {
    setHeaders(res, filePath) {
      if (/\.(js|css|woff2?|png|jpe?g|webp|svg|gif|mp4|webm)$/i.test(filePath) && filePath.includes('assets')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path === '/ws') return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(frontendPath, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

const db = initDb()
app.locals.database = createDatabaseAdapter(db)
if (Number(process.env.LISTING_EXPIRATION_DAYS ?? 0) <= 0) {
  // Preserve active listings indefinitely when production retention is disabled.
  db.prepare("UPDATE listings SET expires_at = NULL WHERE status = 'active'").run()
}
expireListings(db)
startExpirationJob()
setInterval(() => expireListings(db), 5 * 60 * 1000).unref()

const httpServer = http.createServer(app)
const wss = initWs(httpServer)

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}; shutting down`)
  wss.close()
  await new Promise((resolve) => httpServer.close(resolve))
  db.close()
  await closePostgres()
}

process.once('SIGINT', () => { shutdown('SIGINT').finally(() => process.exit(0)) })
process.once('SIGTERM', () => { shutdown('SIGTERM').finally(() => process.exit(0)) })

httpServer.listen(PORT, () => {
  console.log(`limon-bazaar server running on http://localhost:${PORT}`)
})
