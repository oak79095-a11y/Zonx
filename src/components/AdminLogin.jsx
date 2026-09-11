import { useState } from 'react'

export default function AdminLogin({ onSuccess }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, password, email: name })
      })
      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('تعذر الاتصال بالخادم - تأكد من تشغيل السيرفر ثم اعد المحاولة')
      }
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول')
      if (data.role !== 'admin') throw new Error('ليس لديك صلاحية أدمن')
      onSuccess(data)
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <section className="section">
      <div className="admin-login-wrap">
        <div className="container" style={{maxWidth:'400px'}}>
          <div style={{textAlign:'center'}}>
            <h2 className="section-title">غرفة الأدمن</h2>
            <div className="red-line small" style={{margin:'8px auto'}}></div>
            <p className="section-sub">ZONX - دخول قوي وشامل</p>
          </div>
          <div className="admin-login-card fade-in">
            <div className="admin-login-icon" aria-hidden="true">🔐</div>
            <form onSubmit={submit} style={{display:'flex', flexDirection:'column', gap:'12px'}}>
               <label style={{fontSize:'12px', fontWeight:600, display:'flex', flexDirection:'column', gap:'5px'}}>البريد الإلكتروني
                 <input type="email" value={name} onChange={e=>setName(e.target.value)} autoComplete="username" required style={{border:'1px solid var(--border)', borderRadius:'10px', padding:'9px 12px', fontSize:'13px', outline:'none'}} />
              </label>
              <label style={{fontSize:'12px', fontWeight:600, display:'flex', flexDirection:'column', gap:'5px'}}>كلمة السر
                 <input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required style={{border:'1px solid var(--border)', borderRadius:'10px', padding:'9px 12px', fontSize:'13px', outline:'none'}} />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={loading} style={{width:'100%', justifyContent:'center'}}>{loading ? 'جاري الدخول...' : 'دخول'}</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
