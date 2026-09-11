import { useState, useEffect, useRef } from 'react'
import { formatPrice } from '../data/format.js'
import useOverlay from '../hooks/useOverlay.js'

const PLAN_META = {
  free: { icon: '🆓', color: 'gray' },
  featured: { icon: '⭐', color: 'red' },
  business: { icon: '💎', color: 'gold' },
}

export default function PlansModal({ open, onClose, user }) {
  const [plans, setPlans] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const receiptTarget = useRef(null)
  const receiptInput = useRef(null)

  useOverlay(open, onClose)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch('/api/subscriptions/plans').then(r => r.json()),
      user ? fetch('/api/subscriptions/me', { credentials: 'include' }).then(r => r.json()).catch(() => null) : Promise.resolve(null),
    ]).then(([p, m]) => {
      setPlans(Array.isArray(p) ? p : [])
      setMe(m)
    }).finally(() => setLoading(false))
  }, [open, user])

  if (!open) return null

  const reload = () => {
    fetch('/api/subscriptions/me', { credentials: 'include' }).then(r => r.json()).then(setMe).catch(() => {})
  }

  const activeSub = me?.subscriptions?.find(s => s.status === 'active')
  const pendingPayments = (me?.payments || []).filter(p => p.status === 'pending')

  const subscribeBusiness = async () => {
    setBusy('business')
    setError('')
    setMessage('')
    try {
      const r = await fetch('/api/subscriptions/business', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'تعذر انشاء الطلب'); return }
      setMessage(`${j.message} — رقم الطلب: ${j.paymentId}. ارفع صورة إيصال الحوالة ليتم تفعيل الاشتراك بعد التأكيد.`)
      reload()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setBusy('') }
  }

  const pickReceipt = (paymentId) => {
    receiptTarget.current = paymentId
    receiptInput.current?.click()
  }

  const uploadReceipt = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    const id = receiptTarget.current
    if (!f || !id) return
    setBusy(id)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch(`/api/payments/${id}/receipt`, { method: 'POST', credentials: 'include', body: fd })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'تعذر رفع الإيصال'); return }
      setMessage('تم رفع الإيصال بنجاح — سيتم تأكيد الاشتراك بعد مراجعة الادارة')
      reload()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setBusy('') }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg plans-modal" onClick={e => e.stopPropagation()}>
        <div className="pa-head">
          <div className="pa-head-info">
            <span className="pa-badge pl-badge">💎</span>
            <div>
              <h3>خطط الاشتراك</h3>
              <p className="pa-sub">اختر ما يناسبك — الدفع عند الاستلام او عبر الصرافة</p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="اغلاق">✕</button>
        </div>

        <input ref={receiptInput} type="file" accept="image/*" hidden onChange={uploadReceipt} />

        <div className="modal-body">
          {activeSub && (
            <div className="plan-active-banner">
              <span>💎</span>
              <div>
                <b>اشتراكك النشط: {activeSub.plan === 'business' ? 'أعمال' : activeSub.plan}</b>
                <span>حتى {(activeSub.ends_at || '').slice(0, 10)}</span>
              </div>
            </div>
          )}

          {message && <p className="form-success">{message}</p>}
          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="plan-skeletons">
              {[0, 1, 2].map(i => <div key={i} className="plan-skel" />)}
            </div>
          ) : (
            <div className="plans-grid">
              {plans.map((p) => {
                const meta = PLAN_META[p.id] || {}
                return (
                  <div key={p.id} className={`plan-card plan-${meta.color || 'gray'}`}>
                    <span className="plan-icon" aria-hidden="true">{meta.icon || '🏷️'}</span>
                    <h4>{p.name}</h4>
                    <p className="plan-desc">{p.desc}</p>
                    <div className="plan-price">
                      {p.price > 0 ? <><b>{formatPrice(p.price)}</b> <span className="sep">ل.س</span></> : <b>مجاناً</b>}
                    </div>
                    <div className="plan-period">{p.period}</div>
                    <ul className="plan-features">
                      {(p.features || []).map((f, i) => <li key={i}>✓ {f}</li>)}
                    </ul>
                    {p.id === 'business' ? (
                      <button type="button" className="pa-submit" disabled={!user || busy === 'business'} onClick={subscribeBusiness}>
                        {busy === 'business' ? <><span className="pa-spinner" /> جاري الاشتراك...</> : (p.cta || 'اشترك')}
                      </button>
                    ) : p.id === 'featured' ? (
                      <button type="button" className="plan-cta outline" disabled>ميّز إعلانك من صفحة الاعلان</button>
                    ) : (
                      <button type="button" className="plan-cta outline" disabled>{p.cta || 'افتراضي'}</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!user && <p className="form-error">سجل الدخول أولاً للاشتراك</p>}

          {pendingPayments.length > 0 && (
            <div className="pa-section">
              <div className="pa-section-title"><span /> طلباتي المعلقة</div>
              {pendingPayments.map((p) => (
                <div key={p.id} className="pay-row">
                  <div className="pay-row-info">
                    <span className="pay-row-name">طلب #{p.id.slice(0, 8)}</span>
                    <span className="pay-row-sub">{formatPrice(p.amount)} ل.س — بانتظار التأكيد</span>
                  </div>
                  {p.receipt_path ? (
                    <span className="pay-ok">✓ الإيصال مرفوع</span>
                  ) : (
                    <button type="button" className="btn btn-outline" disabled={busy === p.id} onClick={() => pickReceipt(p.id)}>
                      {busy === p.id ? 'جاري الرفع...' : '📤 رفع الإيصال'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
