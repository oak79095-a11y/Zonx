import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { expireListings, expireSubscription } from '../services/expiration.js'
import { invalidateListingsCache } from '../routes/listings.js'

const router = Router()

function getSettings(db) {
  const row = db.prepare("SELECT key,value FROM admin_settings").all()
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
  free: { name: 'مجاني', price: 0, days: 15, desc: '列表ة عادية' },
  featured: { name: 'مميز', price: null, days: 7, desc: 'ظهر في الأعلى' },
  business: { name: 'أعمال', price: null, days: 30, desc: 'محل تخصصي' },
}

router.get('/plans', (req, res) => {
  const db = getDb()
  const s = getSettings(db)
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
        'تصدّر نتائجبحث في التصنيف',
        'مدة أطول و مشاهدة أكثر',
        'المدفوعة عند الاستلام أو عبر مكتب صرافة',
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
        ' Publish إعلانات غير محدودة',
        'تصنيف خاص باسم محلّك',
        ' ظهور في الأعلى',
        'إحصائيات المشاهدات الشهرية',
        'أولوية في خدمة العملاء',
      ],
      cta: 'اشتراك الآن',
    },
  ])
})

router.post('/featured/:listingId', authenticate, (req, res) => {
  const db = getDb()
  const s = getSettings(db)
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND user_id = ?').get(req.params.listingId, req.user.id)
  if (!listing) return res.status(404).json({ error: 'الannounce غير موجود' })
  if (listing.status !== 'active') return res.status(400).json({ error: 'الannounce غير نشط' })

  const paymentId = makeId()
  const amount = s.featured_fee
  db.prepare(
    'INSERT INTO payments(id,user_id,listing_id,amount,method,status) VALUES(?,?,?,?,?,?)'
  ).run(paymentId, req.user.id, req.params.listingId, amount, 'cod', 'pending')

  res.json({ paymentId, amount, method: 'cod', message: 'تم إنشاء طلب التمييز — الدفع عند الاستلام' })
})

router.post('/business', authenticate, (req, res) => {
  const db = getDb()
  const s = getSettings(db)
  const paymentId = makeId()
  const amount = s.business_monthly
  db.prepare(
    'INSERT INTO payments(id,user_id,amount,method,status) VALUES(?,?,?,?,?)'
  ).run(paymentId, req.user.id, amount, 'cod', 'pending')

  res.json({ paymentId, amount, method: 'cod', message: 'تم إنشاء طلب اشتراك الأعمال — الدفع عند الاستلام' })
})

// After admin approves a payment, call these to activate:
export function activateFeatured(db, paymentId) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)
  if (!payment || payment.status !== 'pending' || !payment.listing_id) return null
  const listing = db.prepare('SELECT id FROM listings WHERE id = ? AND user_id = ?').get(payment.listing_id, payment.user_id)
  if (!listing) return null
  const s = getSettings(db)
  const until = new Date(Date.now() + s.featured_duration_days * 24 * 60 * 60 * 1000).toISOString()
  db.prepare("UPDATE listings SET featured=1, featured_until=? WHERE id=?").run(until, payment.listing_id)
  db.prepare("UPDATE payments SET status='approved' WHERE id=?").run(paymentId)
  invalidateListingsCache()
  return { listing_id: payment.listing_id, featured_until: until }
}

export function activateBusiness(db, paymentId) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)
  if (!payment || payment.status !== 'pending' || payment.listing_id) return null
  const s = getSettings(db)
  const starts = new Date().toISOString()
  const ends = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const subId = makeId()
  db.prepare(
    'INSERT INTO subscriptions(id,user_id,plan,status,starts_at,ends_at) VALUES(?,?,?,?,?,?)'
  ).run(subId, payment.user_id, 'business', 'active', starts, ends)
  db.prepare("UPDATE payments SET status='approved', subscription_id=? WHERE id=?").run(subId, paymentId)
  return { subscription_id: subId, ends_at: ends }
}

router.get('/me', authenticate, (req, res) => {
  const db = getDb()
  expireListings(db)
  const subs = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  for (const s of subs) expireSubscription(db, s.id)
  const subs2 = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  res.json({ subscriptions: subs2, payments })
})

export default router
