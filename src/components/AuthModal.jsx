import { useState, useRef, useEffect } from 'react'
import useOverlay from '../hooks/useOverlay.js'

export default function AuthModal({ open, onClose, onSuccess }) {
  const [mode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)
  const googleRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!open) {
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      setAvatar(null)
      setAvatarPreview(null)
      setError('')
    }
  }, [open])

  useOverlay(open, onClose)

  useEffect(() => {
    if (!open || !googleClientId || !googleRef.current) return
    const render = () => {
      if (!window.google?.accounts?.id || !googleRef.current) return
      googleRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setLoading(true); setError('')
          try {
            const r = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ credential }) })
            const j = await r.json()
            if (!r.ok) throw new Error(j.error || 'فشل تسجيل الدخول')
            onSuccess(j); onClose()
          } catch (e) { setError(e.message) } finally { setLoading(false) }
        },
      })
      window.google.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', width: 280, text: 'continue_with' })
    }
    if (window.google?.accounts?.id) render()
    else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true; script.defer = true; script.onload = render
      document.head.appendChild(script)
    }
  }, [open, googleClientId, onClose, onSuccess])

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

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && !name.trim()) { setError('الاسم مطلوب'); return }
    if (!email.trim() && !phone.trim()) { setError('البريد أو رقم الهاتف مطلوب'); return }
    if (password.length < 6) { setError('كلمة السر 6 احرف على الاقل'); return }
    setLoading(true)
    try {
      const body = mode === 'register'
        ? { name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, password }
        : { email: email.trim() || undefined, phone: phone.trim() || undefined, password }
      const r = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'خطأ'); return }
      let user = j
      if (avatar) {
        try {
          const fd = new FormData()
          fd.append('file', avatar)
          const ur = await fetch('/api/auth/avatar', { method: 'POST', credentials: 'include', body: fd })
          if (ur.ok) {
            const uj = await ur.json()
            user = { ...user, avatar: uj.avatar }
          }
        } catch {}
      }
      onSuccess(user)
      onClose()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>{mode === 'login' ? 'تسجيل الدخول' : 'انشاء حساب'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="اغلاق">✕</button>
        </div>
        <div className="red-line small" style={{margin:'0 16px 12px'}}></div>
        <form onSubmit={submit} className="modal-body" autoComplete="off">
          {mode === 'register' && (
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
              <button type="button" className="auth-avatar-btn" onClick={() => fileRef.current?.click()}>
                {avatarPreview ? <img src={avatarPreview} alt="صورتي" /> : <span>📷</span>}
              </button>
              <span className="upload-hint">صورتك الشخصية (تظهر على اعلاناتك)</span>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
            </div>
          )}
          {mode === 'register' && (
            <label>الاسم الحقيقي<input value={name} onChange={e=>setName(e.target.value)} placeholder="اسمك الكامل" required /></label>
          )}
          <label>رقم الهاتف (مفضل)<input autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="09xxxxxxxx" /></label>
          <label>البريد الالكتروني<input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="اختياري" /></label>
          <label>كلمة السر<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="6 احرف على الاقل" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{width:'100%', marginTop:'8px'}}>
            {loading ? 'جاري...' : (mode === 'login' ? 'دخول' : 'انشاء الحساب')}
          </button>
          {googleClientId && <>
            <div className="auth-divider"><span>أو</span></div>
            <div ref={googleRef} className="google-login" />
          </>}
          <p className="auth-switch">إنشاء الحسابات الجديدة يتم عبر Google فقط</p>
        </form>
      </div>
    </div>
  )
}
