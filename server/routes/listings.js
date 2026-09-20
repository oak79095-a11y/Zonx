import { Router } from 'express'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { makeId } from '../utils/auth.js'
import { saveFile, deleteFile, MAX_FILES } from '../services/storage.js'
import { listingUpload, singleUpload, uploadHandler } from '../middleware/upload.js'
import { createNotification } from '../services/notifications.js'
import { cacheGet, cacheSet, cacheInvalidate } from '../services/cache.js'
import { countView, pendingViewsOf } from '../services/views.js'

const router = Router()
const LIST_CACHE_PREFIX = 'listings:'
const LIST_CACHE_TTL_MS = 30000
const PUBLIC_STATUSES = "('active', 'expired')"

// Public list responses are cached for a few seconds; any mutation drops them.
export function invalidateListingsCache() {
  cacheInvalidate(LIST_CACHE_PREFIX)
}

function validateListing(body) {
  const { title, description, price, category_id, city_id } = body || {}
  if (!title || String(title).trim().length < 3 || String(title).trim().length > 60) return 'عنوان الاعلان يجب ان يكون بين 3 و60 حرفا'
  if (!description || String(description).trim().length < 10 || String(description).trim().length > 2000) return 'الوصف يجب ان يكون بين 10 و2000 حرف'
  if (!price || !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > Number.MAX_SAFE_INTEGER) return 'السعر غير صحيح'
  if (!category_id) return 'التصنيف مطلوب'
  if (!city_id) return 'المدينة مطلوبة'
  return null
}

router.post('/', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const err = validateListing(req.body)
  if (err) return res.status(400).json({ error: err })
  const { title, description, price, category_id, city_id, phone } = req.body
  const userId = req.user.id
  const user = await db.one('SELECT id FROM users WHERE id = ?', [userId])
  if (!user) return res.status(404).json({ error: 'غير موجود' })
  if (!await db.one('SELECT id FROM categories WHERE id = ?', [category_id])) {
    return res.status(400).json({ error: 'التصنيف غير موجود' })
  }
  if (!await db.one('SELECT id FROM cities WHERE id = ?', [city_id])) {
    return res.status(400).json({ error: 'المدينة غير موجودة' })
  }
  if (phone != null && String(phone).trim().length > 30) {
    return res.status(400).json({ error: 'رقم الهاتف غير صالح' })
  }
  const configuredDays = process.env.LISTING_EXPIRATION_DAYS
  const settings = {
    free_listing_days: configuredDays == null
      ? Number((await db.one("SELECT value FROM admin_settings WHERE key='free_listing_days'"))?.value || 0)
      : Number(configuredDays),
  }
  const id = makeId()
  const expiresAt = settings.free_listing_days > 0
    ? new Date(Date.now() + settings.free_listing_days * 24 * 60 * 60 * 1000).toISOString()
    : null
  await db.run('INSERT INTO listings(id,user_id,title,description,price,category_id,city_id,status,phone,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, userId, title.trim(), description.trim(), Number(price), category_id, city_id, 'active', String(phone || '').trim() || null, expiresAt])
  invalidateListingsCache()
  res.status(201).json({ id, status: 'active', expires_at: expiresAt })
})

// قائمة عامة بالاعلانات النشطة — فلترة وبحث وصفحات من جهة الخادم
router.get('/', async (req, res) => {
  const db = req.app.locals.database
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 40, 1), 60)
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
  const sellerId = String(req.query.user_id || '').trim() || null
  const categoryId = String(req.query.category || '').trim() || null
  const cityId = String(req.query.city || '').trim() || null
  const q = String(req.query.q || '').trim().slice(0, 60) || null
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter((s) => /^[\w-]{6,64}$/.test(s)).slice(0, 60)

  const cacheKey = `${LIST_CACHE_PREFIX}${limit}:${offset}:${sellerId || ''}:${categoryId || ''}:${cityId || ''}:${q || ''}:${ids.join(',')}`
  const cached = cacheGet(cacheKey)
   if (cached) {
     res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30')
     return res.json(cached)
   }

   // Keep previously published listings visible to new users after expiry.
   // Deleted listings are removed from the table and remain private.
   const where = [`l.status IN ${PUBLIC_STATUSES}`]
  const params = []
  if (ids.length) {
    where.push(`l.id IN (${ids.map(() => '?').join(',')})`)
    params.push(...ids)
  }
  if (sellerId) { where.push('l.user_id = ?'); params.push(sellerId) }
  if (categoryId) { where.push('l.category_id = ?'); params.push(categoryId) }
  if (cityId) { where.push('l.city_id = ?'); params.push(cityId) }
  if (q) {
    where.push("(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')")
    const like = '%' + q.replace(/[\\%_]/g, (ch) => `\\${ch}`) + '%'
    params.push(like, like)
  }
   const rows = await db.many(`
     SELECT l.*, u.name as seller_name, u.avatar as seller_avatar, u.verified as seller_verified,
       (SELECT STRING_AGG(li.path, '|') FROM listing_images li WHERE li.listing_id = l.id) as images
     FROM listings l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY l.featured DESC, l.created_at DESC
     LIMIT ? OFFSET ?
   `, [...params, limit, offset])
   const out = rows.map(mapListing)
   cacheSet(cacheKey, out, LIST_CACHE_TTL_MS)
   res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30')
   res.json(out)
})

// ايكات (تبديل)
router.post('/:id/like', optionalAuth, rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT id, status FROM listings WHERE id = ?', [req.params.id])
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
   if (!['active', 'expired'].includes(listing.status)) return res.status(404).json({ error: 'غير موجود' })
  const actorKey = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`
  const liked = req.body?.liked !== false
  if (liked) {
    const result = await db.run('INSERT INTO listing_likes(id, listing_id, actor_key) VALUES(?,?,?) ON CONFLICT DO NOTHING', [makeId(), req.params.id, actorKey])
    if ((result.rowCount ?? result.changes) && req.user?.id) {
      const owner = await db.one('SELECT user_id FROM listings WHERE id = ?', [req.params.id])
      const actor = await db.one('SELECT name FROM users WHERE id = ?', [req.user.id])
      await createNotification(db, {
        recipientId: owner?.user_id,
        actorId: req.user.id,
        type: 'listing_like',
        entityId: req.params.id,
        message: `${actor?.name || 'مستخدم'} أعجب بإعلانك`,
      })
    }
  } else {
    await db.run('DELETE FROM listing_likes WHERE listing_id = ? AND actor_key = ?', [req.params.id, actorKey])
  }
  const { likes } = await db.one('SELECT COUNT(*) AS likes FROM listing_likes WHERE listing_id = ?', [req.params.id])
  await db.run('UPDATE listings SET likes = ? WHERE id = ?', [likes, req.params.id])
  invalidateListingsCache()
  res.json({ likes })
})

// التعليقات
router.get('/:id/comments', async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT id, status FROM listings WHERE id = ?', [req.params.id])
   if (!listing || !['active', 'expired'].includes(listing.status)) return res.status(404).json({ error: 'غير موجود' })
  const rows = await db.many('SELECT id, name, text, created_at FROM listing_comments WHERE listing_id = ? ORDER BY created_at DESC, id DESC', [req.params.id])
  res.json(rows)
})

router.post('/:id/comments', optionalAuth, rateLimit({ windowMs: 60 * 1000, max: 10 }), async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT id, status FROM listings WHERE id = ?', [req.params.id])
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  const text = String(req.body?.text || '').trim()
  const account = req.user && await db.one('SELECT name FROM users WHERE id = ?', [req.user.id])
  const userId = account ? req.user.id : null
  const name = String(account?.name || req.body?.name || 'زائر').trim() || 'زائر'
  if (text.length < 1) return res.status(400).json({ error: 'التعليق فارغ' })
  if (text.length > 300) return res.status(400).json({ error: 'التعليق طويل جدا' })
  const id = makeId()
  await db.run('INSERT INTO listing_comments(id,listing_id,user_id,name,text) VALUES(?,?,?,?,?)', [id, req.params.id, userId, name.slice(0, 40), text])
  res.status(201).json({ id, listing_id: req.params.id, user_id: userId, name: name.slice(0, 40), text, created_at: new Date().toISOString() })
})

// رفع عام للوسائط — كل الانواع مقبولة
router.post('/upload', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), uploadHandler(singleUpload, (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'لا يوجد ملف' })
  const rel = saveFile(file, 'listings')
  res.json({ url: rel, path: rel, mimetype: file.mimetype })
}))

router.post('/:id/images', authenticate, rateLimit({ windowMs: 60 * 1000, max: 10 }), uploadHandler(listingUpload, async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT * FROM listings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  if (!listing) return res.status(404).json({ error: 'الاعلان غير موجود' })
  const files = req.files || []
  const existingCount = (await db.one('SELECT COUNT(*) AS c FROM listing_images WHERE listing_id = ?', [req.params.id])).c
  if (existingCount + files.length > MAX_FILES) return res.status(400).json({ error: `اقصى ${MAX_FILES} ملفات` })
  const saved = []
  try {
    let order = await db.one('SELECT COALESCE(MAX(sort_order),0) as m FROM listing_images WHERE listing_id = ?', [req.params.id])
    let next = (order?.m ?? 0) + 1
    await db.transaction(async (tx) => { for (const f of files) {
      const rel = saveFile(f, 'listings')
      const imgId = makeId()
      await tx.run('INSERT INTO listing_images(id,listing_id,path,sort_order) VALUES(?,?,?,?)', [imgId, req.params.id, rel, next++])
      saved.push({ id: imgId, path: rel })
    } })
  } catch (e) {
    for (const file of saved) deleteFile(file.path)
    throw e
  }
  invalidateListingsCache()
  res.json(saved)
}))

router.get('/mine', authenticate, async (req, res) => {
  const db = req.app.locals.database
   const rows = await db.many(`SELECT l.*, (SELECT STRING_AGG(li.path, '|') FROM listing_images li WHERE li.listing_id = l.id) as images FROM listings l WHERE l.user_id = ? ORDER BY l.created_at DESC`, [req.user.id])
  res.json(rows.map(mapListing))
})

router.get('/:id', async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT * FROM listings WHERE id = ?', [req.params.id])
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  // عداد مشاهدات مجمّع: يُحفظ دورياً بدل كتابة لكل مشاهدة
  countView(req.app.locals.database, req.params.id)
  const images = await db.many('SELECT path FROM listing_images WHERE listing_id = ? ORDER BY sort_order', [req.params.id])
  const out = mapListing({ ...listing, images: images.map((i) => i.path).join('|') })
  out.views = (out.views || 0) + pendingViewsOf(req.params.id)
  res.json(out)
})

router.put('/:id', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT * FROM listings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status === 'expired') {
    return res.status(400).json({ error: 'لا يمكن تعديل اعلان منتهي' })
  }
  const err = validateListing(req.body)
  if (err) return res.status(400).json({ error: err })
  const { title, description, price, category_id, city_id } = req.body
  if (!await db.one('SELECT id FROM categories WHERE id = ?', [category_id])) return res.status(400).json({ error: 'التصنيف غير موجود' })
  if (!await db.one('SELECT id FROM cities WHERE id = ?', [city_id])) return res.status(400).json({ error: 'المدينة غير موجودة' })
  await db.run('UPDATE listings SET title=?,description=?,price=?,category_id=?,city_id=?,updated_at=CURRENT_TIMESTAMP WHERE id = ?', [title.trim(), description.trim(), Number(price), category_id, city_id, req.params.id])
  invalidateListingsCache()
  res.json({ id: req.params.id, ok: true })
})

router.delete('/:id', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const listing = await db.one('SELECT * FROM listings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  const images = await db.many('SELECT path FROM listing_images WHERE listing_id = ?', [req.params.id])
  try {
    for (const img of images) deleteFile(img.path)
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM listing_images WHERE listing_id = ?', [req.params.id])
      await tx.run('DELETE FROM listing_likes WHERE listing_id = ?', [req.params.id])
      await tx.run('DELETE FROM listing_comments WHERE listing_id = ?', [req.params.id])
      await tx.run('DELETE FROM payments WHERE listing_id = ?', [req.params.id])
      await tx.run('DELETE FROM listings WHERE id = ?', [req.params.id])
    })
  } catch (e) { throw e }
  invalidateListingsCache()
  res.json({ ok: true })
})

function mapListing(row) {
  if (!row) return null
  const images = (row.images || '').split('|').filter(Boolean)
   return { id: row.id, user_id: row.user_id, title: row.title, description: row.description, price: row.price, category_id: row.category_id, city_id: row.city_id, status: row.status, phone: row.phone || null, seller_name: row.seller_name || 'بائع', seller_avatar: row.seller_avatar || null, seller_verified: Boolean(row.seller_verified), likes: row.likes || 0, featured: Boolean(row.featured), featured_until: row.featured_until, expires_at: row.expires_at, views: row.views, created_at: row.created_at, images: images.slice(0, MAX_FILES) }
}

export default router

