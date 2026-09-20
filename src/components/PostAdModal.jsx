import { useState } from 'react'
import { categories, cities } from '../data/catalog.js'
import useOverlay from '../hooks/useOverlay.js'
import { apiFetch } from '../config.js'

const MAX_FILES = 30

export default function PostAdModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('men')
  const [city, setCity] = useState('damascus')
  const [phone, setPhone] = useState('')
  const [media, setMedia] = useState([]) // [{file, url, kind}]
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  useOverlay(open, onClose)

  if (!open) return null

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    setError('')
    if (!picked.length) return

    const room = MAX_FILES - media.length
    if (room <= 0) { setError(`اقصى ${MAX_FILES} ملفات`); return }
    if (picked.length > room) setError(`تم قبول اول ${room} ملفات فقط (الحد ${MAX_FILES})`)

    const accepted = []
    for (const f of picked.slice(0, room)) {
      const isVideo = f.type.startsWith('video/')
      const isImage = f.type.startsWith('image/')
      if (!isVideo && !isImage) { setError('يسمح فقط بالصور والفيديو'); continue }
      accepted.push({ file: f, url: URL.createObjectURL(f), kind: isVideo ? 'video' : 'image' })
    }
    if (accepted.length) setMedia(prev => [...prev, ...accepted])
  }

  const removeMedia = (i) => {
    setMedia(prev => {
      const copy = [...prev]
      const [rm] = copy.splice(i, 1)
      if (rm?.url?.startsWith('blob:')) URL.revokeObjectURL(rm.url)
      return copy
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (title.trim().length < 3) { setError('العنوان قصير جدا'); return }
    if (description.trim().length < 10) { setError('الوصف 10 احرف على الاقل'); return }
    if (!price || Number(price) <= 0) { setError('السعر غير صحيح'); return }
    setLoading(true)
    try {
      // 1) انشاء الاعلان
      const r = await apiFetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: Number(price),
          category_id: category,
          city_id: city,
          phone: phone.trim() || null,
        })
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error || 'تعذر نشر الاعلان')
        return
      }
      const created = await r.json()

      // 2) رفع كل الصور والفيديو معا في طلب واحد
      if (media.length) {
        setUploading(true)
        const fd = new FormData()
        media.forEach(m => fd.append('images', m.file))
        const ur = await apiFetch(`/api/listings/${created.id}/images`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        })
        if (!ur.ok) {
          await apiFetch(`/api/listings/${created.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
          setError('تعذر رفع الوسائط، لم يتم نشر الاعلان')
          return
        }
        setUploading(false)
      }

      onCreate(created)
      media.forEach(m => { if (m.url?.startsWith('blob:')) URL.revokeObjectURL(m.url) })
      setTitle(''); setDescription(''); setPrice(''); setPhone(''); setMedia([])
      onClose()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally {
      setUploading(false)
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
        <div className="pa-head">
          <div className="pa-head-info">
            <span className="pa-badge">＋</span>
            <div>
              <h3>اضف اعلانك</h3>
              <p className="pa-sub">يظهر للجميع بعد المراجعة</p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="اغلاق">✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <div className="pa-section">
            <div className="pa-section-title"><span /> تفاصيل الاعلان</div>
            <label className="pa-label-row">
              <span>العنوان</span>
              <span className="pa-charcount">{title.length}/60</span>
            </label>
            <div className="pa-field">
              <span className="pa-field-icon">📝</span>
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: سيارة للبيع" maxLength={60} required />
            </div>
            <label className="pa-label-row">
              <span>الوصف</span>
              <span className="pa-charcount">{description.length}/2000</span>
            </label>
            <div className="pa-field pa-field-ta">
              <span className="pa-field-icon">📄</span>
              <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="تفاصيل الاعلان..." rows={4} maxLength={2000} required />
            </div>
          </div>

          <div className="pa-section">
            <div className="pa-section-title"><span /> السعر والتواصل</div>
            <label>السعر</label>
            <div className="pa-field pa-field-suffix">
              <span className="pa-field-icon">💰</span>
              <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0" required />
              <span className="pa-suffix">ل.س</span>
            </div>
            <label>الهاتف</label>
            <div className="pa-field">
              <span className="pa-field-icon">📞</span>
              <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="09xxxxxxxx" />
            </div>
          </div>

          <div className="pa-section">
            <div className="pa-section-title"><span /> التصنيف</div>
            <div className="pa-chips">
              {categories.map(c => (
                <button key={c.id} type="button" className={'pa-chip' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>
                  <span className="pa-chip-icon">{c.icon}</span> {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pa-section">
            <div className="pa-section-title"><span /> المدينة</div>
            <div className="pa-cities">
              {cities.map(c => (
                <button key={c.id} type="button" className={'pa-city' + (city === c.id ? ' active' : '')} onClick={() => setCity(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pa-section">
            <div className="pa-section-title"><span /> الوسائط</div>
            <label className={'pa-upload' + (media.length >= MAX_FILES ? ' full' : '')}>
              <span className="pa-upload-icon">🖼️</span>
              <span className="pa-upload-text">اضف صورا او فيديو</span>
              <span className="pa-counter">{media.length} / {MAX_FILES}</span>
              <span className="pa-upload-hint">صور وفيديو بدون قيود على الحجم او المدة - حتى {MAX_FILES} ملف</span>
              <input type="file" accept="image/*,video/*" multiple onChange={handleFiles} disabled={media.length >= MAX_FILES} />
            </label>
            {media.length > 0 && (
              <div className="pa-progress">
                <span style={{ width: `${(media.length / MAX_FILES) * 100}%` }} />
              </div>
            )}

            {media.length > 0 && (
              <div className="media-preview-grid">
                {media.map((m, i) => (
                  <div key={i} className="media-preview-item">
                    {m.kind === 'video'
                      ? <video src={m.url} muted preload="metadata" />
                      : <img src={m.url} alt="معاينة" />}
                    <button type="button" className="media-remove" onClick={() => removeMedia(i)} aria-label="ازالة">✕</button>
                    {m.kind === 'video' && <span className="media-kind-badge">فيديو</span>}
                    {i === 0 && m.kind === 'image' && <span className="media-kind-badge main-badge">الغلاف</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="pa-submit" disabled={loading}>
            {loading ? (
              <><span className="pa-spinner" /> {uploading ? 'جاري رفع الوسائط...' : 'جاري النشر...'}</>
            ) : (
              <>🚀 انشر الاعلان</>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
