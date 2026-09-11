import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { makeId } from '../utils/auth.js'
import { saveFile, deleteFile, MAX_FILES, ALLOWED_TYPES, MAX_FILE_SIZE } from '../services/storage.js'
import { listingUpload, singleUpload, uploadHandler } from '../middleware/upload.js'
import { expireListings } from '../services/expiration.js'
import { createNotification } from '../services/notifications.js'

const router = Router()

function validateListing(body) {
  const { title, description, price, category_id, city_id } = body || {}
  if (!title || String(title).trim().length < 3 || String(title).trim().length > 60) return 'عنوان الاعلان يجب ان يكون بين 3 و60 حرفا'
  if (!description || String(description).trim().length < 10 || String(description).trim().length > 2000) return 'الوصف يجب ان يكون بين 10 و2000 حرف'
  if (!price || !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > Number.MAX_SAFE_INTEGER) return 'السعر غير صحيح'
  if (!category_id) return 'التصنيف مطلوب'
  if (!city_id) return 'المدينة مطلوبة'
  return null
}

router.post('/', authenticate, (req, res) => {
  const db = getDb()
  const err = validateListing(req.body)
  if (err) return res.status(400).json({ error: err })
  const { title, description, price, category_id, city_id, phone } = req.body
  const userId = req.user.id
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId)
  if (!user) return res.status(404).json({ error: 'غير موجود' })
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id)) {
    return res.status(400).json({ error: 'التصنيف غير موجود' })
  }
  if (!db.prepare('SELECT id FROM cities WHERE id = ?').get(city_id)) {
    return res.status(400).json({ error: 'المدينة غير موجودة' })
  }
  if (phone != null && String(phone).trim().length > 30) {
    return res.status(400).json({ error: 'رقم الهاتف غير صالح' })
  }
  const settings = {
    free_listing_days: Number(db.prepare("SELECT value FROM admin_settings WHERE key='free_listing_days'").get()?.value || 15),
  }
  const id = makeId()
  const expiresAt = new Date(Date.now() + settings.free_listing_days * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`INSERT INTO listings(id,user_id,title,description,price,category_id,city_id,status,phone,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, userId, title.trim(), description.trim(), Number(price), category_id, city_id, 'active', String(phone || '').trim() || null, expiresAt)
  res.status(201).json({ id, status: 'active', expires_at: expiresAt })
})

// قائمة عامة بالاعلانات النشطة
router.get('/', (req, res) => {
  const db = getDb()
  expireListings(db)
  const rows = db.prepare(`
     SELECT l.*, u.name as seller_name, u.email as seller_email, u.avatar as seller_avatar, u.verified as seller_verified, GROUP_CONCAT(li.path, '|') as images
    FROM listings l
    LEFT JOIN listing_images li ON li.listing_id = l.id
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.status = 'active'
    GROUP BY l.id
    ORDER BY l.featured DESC, l.created_at DESC
  `).all()
  res.json(rows.map(mapListing))
})

// ايكات (تبديل)
router.post('/:id/like', optionalAuth, rateLimit({ windowMs: 60 * 1000, max: 30 }), (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT id, status FROM listings WHERE id = ?').get(req.params.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  const actorKey = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`
  const liked = req.body?.liked !== false
  if (liked) {
    const result = db.prepare('INSERT OR IGNORE INTO listing_likes(id, listing_id, actor_key) VALUES(?,?,?)')
      .run(makeId(), req.params.id, actorKey)
    if (result.changes && req.user?.id) {
      const owner = db.prepare('SELECT user_id FROM listings WHERE id = ?').get(req.params.id)
      const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
      createNotification(db, {
        recipientId: owner?.user_id,
        actorId: req.user.id,
        type: 'listing_like',
        entityId: req.params.id,
        message: `${actor?.name || 'مستخدم'} أعجب بإعلانك`,
      })
    }
  } else {
    db.prepare('DELETE FROM listing_likes WHERE listing_id = ? AND actor_key = ?').run(req.params.id, actorKey)
  }
  const { likes } = db.prepare('SELECT COUNT(*) AS likes FROM listing_likes WHERE listing_id = ?').get(req.params.id)
  db.prepare('UPDATE listings SET likes = ? WHERE id = ?').run(likes, req.params.id)
  res.json({ likes })
})

// التعليقات
router.get('/:id/comments', (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT id, status FROM listings WHERE id = ?').get(req.params.id)
  if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  const rows = db.prepare('SELECT id, name, text, created_at FROM listing_comments WHERE listing_id = ? ORDER BY created_at DESC, rowid DESC').all(req.params.id)
  res.json(rows)
})

router.post('/:id/comments', optionalAuth, rateLimit({ windowMs: 60 * 1000, max: 10 }), (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT id FROM listings WHERE id = ?').get(req.params.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  const text = String(req.body?.text || '').trim()
  const account = req.user && db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)
  const userId = account ? req.user.id : null
  const name = String(account?.name || req.body?.name || 'زائر').trim() || 'زائر'
  if (text.length < 1) return res.status(400).json({ error: 'التعليق فارغ' })
  if (text.length > 300) return res.status(400).json({ error: 'التعليق طويل جدا' })
  const id = makeId()
  db.prepare('INSERT INTO listing_comments(id,listing_id,user_id,name,text) VALUES(?,?,?,?,?)').run(id, req.params.id, userId, name.slice(0, 40), text)
  res.status(201).json({ id, listing_id: req.params.id, user_id: userId, name: name.slice(0, 40), text, created_at: new Date().toISOString() })
})

// رفع عام للصور والفيديو (30ث يتحقق في الواجهة + هنا حجم)
router.post('/upload', authenticate, rateLimit({ windowMs: 60 * 1000, max: 20 }), uploadHandler(singleUpload, (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'لا يوجد ملف' })
  if (!ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'نوع غير مدعوم' })
  if (file.size > MAX_FILE_SIZE) return res.status(400).json({ error: 'الملف كبير جدا' })
  const rel = saveFile(file, 'listings')
  res.json({ url: rel, path: rel, mimetype: file.mimetype })
}))

router.post('/:id/images', authenticate, rateLimit({ windowMs: 60 * 1000, max: 10 }), uploadHandler(listingUpload, (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!listing) return res.status(404).json({ error: 'الاعلان غير موجود' })
  const files = req.files || []
  const existingCount = db.prepare('SELECT COUNT(*) AS c FROM listing_images WHERE listing_id = ?').get(req.params.id).c
  if (existingCount + files.length > MAX_FILES) return res.status(400).json({ error: 'اقصى 8 ملفات' })
  const saved = []
  db.exec('BEGIN')
  try {
    let order = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM listing_images WHERE listing_id = ?').get(req.params.id)
    let next = (order?.m ?? 0) + 1
    for (const f of files) {
      if (!ALLOWED_TYPES.has(f.mimetype)) continue
      if (f.size > MAX_FILE_SIZE) continue
      const rel = saveFile(f, 'listings')
      const imgId = makeId()
      db.prepare('INSERT INTO listing_images(id,listing_id,path,sort_order) VALUES(?,?,?,?)').run(imgId, req.params.id, rel, next++)
      saved.push({ id: imgId, path: rel })
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    for (const file of saved) deleteFile(file.path)
    throw e
  }
  res.json(saved)
}))

router.get('/mine', authenticate, (req, res) => {
  const db = getDb()
  expireListings(db)
  const rows = db.prepare(`SELECT l.*, GROUP_CONCAT(li.path, '|') as images FROM listings l LEFT JOIN listing_images li ON li.listing_id = l.id WHERE l.user_id = ? GROUP BY l.id ORDER BY l.created_at DESC`).all(req.user.id)
  res.json(rows.map(mapListing))
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status !== 'active') return res.status(404).json({ error: 'غير موجود' })
  db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(req.params.id)
  const images = db.prepare('SELECT path FROM listing_images WHERE listing_id = ? ORDER BY sort_order').all(req.params.id)
  res.json(mapListing({ ...listing, images: images.map((i) => i.path).join('|') }))
})

router.put('/:id', authenticate, (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!listing) return res.status(404).json({ error: 'غير موجود' })
  if (listing.status === 'active' || listing.status === 'expired') {
    return res.status(400).json({ error: 'لا يمكن تعديل اعلان نشط او منتهي' })
  }
  const err = validateListing(req.body)
  if (err) return res.status(400).json({ error: err })
  const { title, description, price, category_id, city_id } = req.body
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id)) return res.status(400).json({ error: 'التصنيف غير موجود' })
  if (!db.prepare('SELECT id FROM cities WHERE id = ?').get(city_id)) return res.status(400).json({ error: 'المدينة غير موجودة' })
  db.prepare(`UPDATE listings SET title=?,description=?,price=?,category_id=?,city_id=?,updated_at=datetime('now') WHERE id = ?`).run(title.trim(), description.trim(), Number(price), category_id, city_id, req.params.id)
  res.json({ id: req.params.id, ok: true })
})

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb()
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
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

function mapListing(row) {
  if (!row) return null
  const images = (row.images || '').split('|').filter(Boolean)
   return { id: row.id, user_id: row.user_id, title: row.title, description: row.description, price: row.price, category_id: row.category_id, city_id: row.city_id, status: row.status, phone: row.phone || null, seller_name: row.seller_name || 'بائع', seller_email: row.seller_email || null, seller_avatar: row.seller_avatar || null, seller_verified: Boolean(row.seller_verified), likes: row.likes || 0, featured: Boolean(row.featured), featured_until: row.featured_until, expires_at: row.expires_at, views: row.views, created_at: row.created_at, images }
}

export default router

