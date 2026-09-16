import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { expireListings, expireSubscription } from '../services/expiration.js'
import { invalidateListingsCache } from '../routes/listings.js'

const router = Router()

async function getSettings(db) {
  const row = await db.many('SELECT key,value FROM admin_settings')
  const map = {}
  for (const r of row) map[r.key] = r.value
  return {
    free_listing_days: Number(map.free_listing_days || 15),
    featured_fee: Number(map.featured_fee || 75000),
    business_monthly: Number(map.business_monthly || 250000),
    featured_duration_days: Number(map.featured_duration_days || 7),
  }
}

const PLANS = {
  free: { name: 'مجاني', price: 0, days: 15, desc: 'لائحة عادية' },
  featured: { name: 'مميز', price: null, days: 7, desc: 'ظهر في الأعلى' },
  business: { name: 'أعمال', price: null, days: 30, desc: 'محل تخصصي' },
}

router.get('/plans', async (req, res) => {
  const db = req.app.locals.database
  const s = await getSettings(db)
  res.json([
    {
      id: 'free',
      name: 'مجاني',
      desc: 'لائحة عادية',
      price: 0,
      period: 'لكل 15 يوم',
      features: [
        'نشر إعلان واحد',
        'ظهر ضمن التصنيف والمدينة',
        'مدة العرض 15 يوم',
        'إرفاق حتى 8 صور',
      ],
      cta: 'انشر مجاناً',
    },
    {
      id: 'featured',
      name: 'مميز',
      desc: 'ظهر في الأعلى',
      price: s.featured_fee,
      period: `لكل ${s.featured_duration_days} أيام`,
      features: [
        'وسام "مميز" برتقالي بارز',
        'تصدّر نتائج البحث في التصنيف',
        'مدة أطول و مشاهدة أكثر',
        'الدفع عند الاستلام أو عبر مكتب صرافة',
      ],
      cta: 'ميّز إعلانك',
    },
    {
      id: 'business',
      name: 'أعمال',
      desc: 'للمحلات والجار شهرياً',
      price: s.business_monthly,
      period: 'كل شهر',
      features: [
        'نشر إعلانات غير محدودة',
        'تصنيف خاص باسم محلّك',
        'ظهور في الأعلى',
        'إحصائيات المشاهدات الشهرية',
        'أولوية في خدمة العملاء',
      ],
      cta: 'اشتراك الآن',
    },
  ])
})

router.post('/featured/:listingId', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const s = await getSettings(db)
  const listing = await db.one('SELECT * FROM listings WHERE id = ? AND user_id = ?', [req.params.listingId, req.user.id])
  if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' })
  if (listing.status !== 'active') return res.status(400).json({ error: 'الإعلان غير نشط' })

  const paymentId = makeId()
  const amount = s.featured_fee
  await db.run('INSERT INTO payments(id,user_id,listing_id,amount,method,status) VALUES(?,?,?,?,?,?)', [paymentId, req.user.id, req.params.listingId, amount, 'cod', 'pending'])

  res.json({ paymentId, amount, method: 'cod', message: 'تم إنشاء طلب التمييز — الدفع عند الاستلام' })
})

router.post('/business', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const s = await getSettings(db)
  const paymentId = makeId()
  const amount = s.business_monthly
  await db.run('INSERT INTO payments(id,user_id,amount,method,status) VALUES(?,?,?,?,?)', [paymentId, req.user.id, amount, 'cod', 'pending'])

  res.json({ paymentId, amount, method: 'cod', message: 'تم إنشاء طلب اشتراك الأعمال — الدفع عند الاستلام' })
})

// After admin approves a payment, call these to activate:
export async function activateFeatured(db, paymentId) {
  const payment = await db.one('SELECT * FROM payments WHERE id = ?', [paymentId])
  if (!payment || payment.status !== 'pending' || !payment.listing_id) return null
  const listing = await db.one('SELECT id FROM listings WHERE id = ? AND user_id = ?', [payment.listing_id, payment.user_id])
  if (!listing) return null
  const s = await getSettings(db)
  const until = new Date(Date.now() + s.featured_duration_days * 24 * 60 * 60 * 1000).toISOString()
  await db.run('UPDATE listings SET featured=?, featured_until=? WHERE id=?', [true, until, payment.listing_id])
  await db.run("UPDATE payments SET status='approved' WHERE id=?", [paymentId])
  invalidateListingsCache()
  return { listing_id: payment.listing_id, featured_until: until }
}

export async function activateBusiness(db, paymentId) {
  const payment = await db.one('SELECT * FROM payments WHERE id = ?', [paymentId])
  if (!payment || payment.status !== 'pending' || payment.listing_id) return null
  const s = await getSettings(db)
  const starts = new Date().toISOString()
  const ends = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const subId = makeId()
  await db.run('INSERT INTO subscriptions(id,user_id,plan,status,starts_at,ends_at) VALUES(?,?,?,?,?,?)', [subId, payment.user_id, 'business', 'active', starts, ends])
  await db.run("UPDATE payments SET status='approved', subscription_id=? WHERE id=?", [subId, paymentId])
  return { subscription_id: subId, ends_at: ends }
}

router.get('/me', authenticate, async (req, res) => {
  const db = req.app.locals.database
  await expireListings(db)
  const subs = await db.many('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id])
  for (const s of subs) await expireSubscription(db, s.id)
  const subs2 = await db.many('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id])
  const payments = await db.many('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC', [req.user.id])
  res.json({ subscriptions: subs2, payments })
})

export default router
