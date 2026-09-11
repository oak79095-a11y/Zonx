import { useState, useEffect, useRef } from 'react'
import { cities } from '../data/catalog.js'
import EditProfileModal from './EditProfileModal.jsx'

function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function BottomBar({ city, onCityChange, onHome, onPostAd, user, onLogout, onSetUser, onMessages }) {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [unread, setUnread] = useState(0)
  const menuRef = useRef(null)
  const cityRef = useRef(null)

  useEffect(() => {
    if (!user) { setUnread(0); return }
    let alive = true
    const poll = () => {
      fetch('/api/messages/unread', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setUnread(d.unread || 0) })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 8000)
    return () => { alive = false; clearInterval(timer) }
  }, [user])

  useEffect(() => {
    if (!menuOpen && !cityOpen) return
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
      if (cityRef.current && !cityRef.current.contains(e.target)) setCityOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [menuOpen, cityOpen])

  useEffect(() => {
    if (cityOpen) setCityQuery('')
  }, [cityOpen])

  const q = cityQuery.trim()
  const filteredCities = q ? cities.filter(c => c.name.includes(q)) : cities

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('bazaar-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('bazaar-theme', 'light')
    }
  }

  return (
    <nav className="bottom-bar" aria-label="الشريط السفلي">
      <button type="button" className="bb-item" onClick={onHome} aria-label="الرئيسية" title="الرئيسية">
        <HomeIcon />
      </button>

      <div className="bb-city" ref={cityRef}>
        <button
          type="button"
          className={'bb-item' + (city !== 'all' ? ' active' : '')}
          onClick={() => setCityOpen(o => !o)}
          aria-label="المدينة"
          title="المدينة"
        >
          <PinIcon />
        </button>
        {cityOpen && (
          <div className="bb-city-menu">
            <div className="bb-city-head">
              <span className="bb-city-title">اختر المدينة</span>
              <span className="bb-city-count">{cities.length} مدن</span>
            </div>
            <div className="bb-city-search">
              <input
                value={cityQuery}
                onChange={e => setCityQuery(e.target.value)}
                placeholder="ابحث عن مدينة..."
                autoFocus
              />
            </div>
            <div className="bb-city-list">
              {!q && (
                <button
                  type="button"
                  className={'bb-city-opt' + (city === 'all' ? ' active' : '')}
                  onClick={() => { onCityChange('all'); setCityOpen(false) }}
                >
                  <span className="bb-city-dot all">🌍</span>
                  <span className="bb-city-name">كل المدن</span>
                  <span className={'bb-city-check' + (city === 'all' ? ' on' : '')}>✓</span>
                </button>
              )}
              {filteredCities.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={'bb-city-opt' + (city === c.id ? ' active' : '')}
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => { onCityChange(c.id); setCityOpen(false) }}
                >
                  <span className="bb-city-dot">{c.name.slice(0, 1)}</span>
                  <span className="bb-city-name">{c.name}</span>
                  <span className={'bb-city-check' + (city === c.id ? ' on' : '')}>✓</span>
                </button>
              ))}
              {q && filteredCities.length === 0 && (
                <div className="bb-city-empty">لا توجد نتائج</div>
              )}
            </div>
          </div>
        )}
      </div>

      <button type="button" className="bb-item msg-btn" onClick={onMessages} aria-label="الرسائل" title="الرسائل">
        <ChatIcon />
        {unread > 0 && <span className="bb-badge">{unread > 9 ? '+9' : unread}</span>}
      </button>

      <button type="button" className="bb-add" onClick={onPostAd} aria-label="اضف اعلانك" title="اضف اعلانك">
        <PlusIcon />
      </button>

      <button type="button" className="bb-item" onClick={toggleTheme} aria-label="تبديل الوضع الليلي" title={dark ? 'الوضع النهاري' : 'الوضع الليلي'}>
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>

      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          className="bb-item"
          onClick={() => user ? setMenuOpen(o => !o) : onPostAd()}
          aria-label={user ? 'حسابي' : 'تسجيل الدخول'}
          title={user ? 'حسابي' : 'تسجيل الدخول'}
        >
          {user && user.avatar ? (
            <img className="bb-avatar" src={user.avatar} alt={user.name} />
          ) : user ? (
            <span className="bb-avatar bb-avatar-fallback">{(user.name || 'ب').slice(0, 1)}</span>
          ) : (
            <UserIcon />
          )}
        </button>
        {user && menuOpen && (
          <div className="bb-menu">
            <div className="bb-menu-head">
              {user.avatar
                ? <img src={user.avatar} alt="" />
                : <span className="bb-avatar bb-avatar-fallback">{(user.name || 'ب').slice(0, 1)}</span>}
              <div>
                <div className="bb-menu-name">{user.name}</div>
                <div className="bb-menu-sub">حسابي</div>
              </div>
            </div>
            <button type="button" className="bb-menu-logout" onClick={() => { setMenuOpen(false); setEditOpen(true) }}>
              ✏️ تعديل البيانات والصورة
            </button>
            <button type="button" className="bb-menu-logout" onClick={() => { setMenuOpen(false); onLogout() }}>
              <LogoutIcon /> خروج
            </button>
          </div>
        )}
      </div>
      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        user={user}
        onSuccess={(u) => { onSetUser?.(u); setEditOpen(false) }}
      />
    </nav>
  )
}
