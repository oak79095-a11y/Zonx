import { useState, useRef, useEffect } from 'react'
import useOverlay from '../hooks/useOverlay.js'
import { apiFetch, mediaUrl } from '../config.js'

export default function EditProfileModal({ open, onClose, user, onSuccess }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const fileRef = useRef(null)

  useOverlay(open, onClose)

  useEffect(() => {
    if (open && user) {
      setName(user.name || '')
      setEmail(user.email || '')
      setPhone(user.phone || '')
      setAvatar(null)
      setAvatarPreview(null)
      setOldPassword('')
      setNewPassword('')
      setError('')
      setSuccess('')
    }
  }, [open, user])

  if (!open) return null

  const pickAvatar = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('اختر صورة صحيحة'); return }
    if (f.size > 5 * 1024 * 1024) { setError('الصورة كبيرة جدا (الحد 5MB)'); return }
    setError('')
    setAvatar(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  const saveInfo = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!name.trim()) { setError('الاسم مطلوب'); return }
    if (!email.trim() && !phone.trim()) { setError('البريد أو رقم الهاتف مطلوب'); return }
    setSaving(true)
    try {
      const r = await apiFetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'تعذر الحفظ'); return }
      let updated = j
      if (avatar) {
        try {
          const fd = new FormData()
          fd.append('file', avatar)
          const ur = await apiFetch('/api/auth/avatar', { method: 'POST', credentials: 'include', body: fd })
          if (ur.ok) {
            const uj = await ur.json()
            updated = { ...updated, avatar: uj.avatar }
          }
        } catch {}
      }
      onSuccess(updated)
      setSuccess('تم حفظ البيانات بنجاح')
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setSaving(false) }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPassword.length < 6) { setError('كلمة السر الجديدة 6 احرف على الاقل'); return }
    setSavingPass(true)
    try {
      const r = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'تعذر تغيير كلمة السر'); return }
      setOldPassword('')
      setNewPassword('')
      setSuccess('تم تغيير كلمة السر بنجاح')
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setSavingPass(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="pa-head">
          <div className="pa-head-info">
            <span className="pa-badge ep-badge">
              {avatarPreview ? <img src={avatarPreview} alt="" /> : user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name || 'ب').slice(0, 1)}
            </span>
            <div>
              <h3>حسابي</h3>
              <p className="pa-sub">تعديل بياناتك الشخصية</p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="اغلاق">✕</button>
        </div>

        <form onSubmit={saveInfo} className="modal-body">
          <div className="ep-avatar-wrap">
            <button type="button" className="ep-avatar" onClick={() => fileRef.current?.click()} aria-label="تغيير الصورة">
              {avatarPreview ? <img src={avatarPreview} alt="صورتي" /> : user?.avatar ? <img src={mediaUrl(user.avatar)} alt="صورتي" /> : <span>📷</span>}
              <span className="ep-avatar-edit">✎</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
            <span className="upload-hint">اضغط على الصورة لتغييرها</span>
          </div>

          <div className="pa-section">
            <div className="pa-section-title"><span /> البيانات الشخصية</div>
            <label>الاسم
              <div className="pa-field">
                <span className="pa-field-icon">👤</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="اسمك الكامل" />
              </div>
            </label>
            <label>البريد الالكتروني
              <div className="pa-field">
                <span className="pa-field-icon">✉️</span>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="example@mail.com" />
              </div>
            </label>
            <label>رقم الهاتف
              <div className="pa-field">
                <span className="pa-field-icon">📞</span>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09xxxxxxxx" />
              </div>
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}
          <button type="submit" className="pa-submit" disabled={saving}>
            {saving ? <><span className="pa-spinner" /> جاري الحفظ...</> : <>💾 حفظ البيانات</>}
          </button>
        </form>

        <form onSubmit={savePassword} className="modal-body" style={{ paddingTop: 0 }}>
          <div className="pa-section">
            <div className="pa-section-title"><span /> تغيير كلمة السر</div>
            <label>كلمة السر الحالية
              <div className="pa-field">
                <span className="pa-field-icon">🔒</span>
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="••••••" />
              </div>
            </label>
            <label>كلمة السر الجديدة
              <div className="pa-field">
                <span className="pa-field-icon">🔑</span>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 احرف على الاقل" />
              </div>
            </label>
          </div>
          <button type="submit" className="btn btn-outline" disabled={savingPass} style={{ width: '100%', justifyContent: 'center' }}>
            {savingPass ? 'جاري التغيير...' : '🔐 تغيير كلمة السر'}
          </button>
        </form>
      </div>
    </div>
  )
}
