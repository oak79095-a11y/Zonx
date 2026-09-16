import { useState, useEffect, useCallback } from 'react'
import { cities } from '../data/catalog.js'
import useOverlay from '../hooks/useOverlay.js'
import EditProfileModal from './EditProfileModal.jsx'
import { mediaUrl } from '../config.js'
import PlansModal from './PlansModal.jsx'
import { setToastsEnabled } from './Toast.jsx'

const ACCENTS = {
  red: { label: 'احمر', main: '#dc2626', hover: '#f87171', dark: '#b91c1c', soft: '#fee2e2' },
  blue: { label: 'ازرق', main: '#2563eb', hover: '#60a5fa', dark: '#1d4ed8', soft: '#dbeafe' },
  green: { label: 'اخضر', main: '#16a34a', hover: '#4ade80', dark: '#15803d', soft: '#dcfce7' },
  purple: { label: 'بنفسجي', main: '#7c3aed', hover: '#a78bfa', dark: '#6d28d9', soft: '#ede9fe' },
}
const DARK_SOFT = { red: '#3d1a1d', blue: '#16233d', green: '#12241a', purple: '#241633' }

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ')
}

export function applyAccent(id, dark) {
  const a = ACCENTS[id] || ACCENTS.red
  const s = document.documentElement.style
  s.setProperty('--red', a.main)
  s.setProperty('--red-dark', dark ? a.hover : a.dark)
  s.setProperty('--red-soft', dark ? (DARK_SOFT[id] || DARK_SOFT.red) : a.soft)
  s.setProperty('--shadow-red', `0 6px 18px rgba(${hexRgb(a.main)}, ${dark ? 0.3 : 0.22})`)
  s.setProperty('--ring', `0 0 0 3px rgba(${hexRgb(a.main)}, ${dark ? 0.3 : 0.18})`)
}

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v } catch { return fallback }
}
function writePref(key, v) {
  try { localStorage.setItem(key, v) } catch {}
}

const TABS = [
  { id: 'account', label: 'الحساب', icon: '👤' },
  { id: 'appearance', label: 'المظهر', icon: '🎨' },
  { id: 'location', label: 'الموقع', icon: '📍' },
  { id: 'about', label: 'حول', icon: 'ℹ️' },
]

export default function Sidebar({ open, onClose, city, onCityChange, user, onSetUser, onLogout, onRequireAuth }) {
  const [tab, setTab] = useState('account')
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [accent, setAccent] = useState(() => readPref('bazaar-accent', 'red'))
  const [motion, setMotion] = useState(() => readPref('bazaar-motion', 'on'))
  const [toasts, setToasts] = useState(() => readPref('bazaar-toasts', 'on'))
  const [accountOpen, setAccountOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  useOverlay(open, onClose)

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    const savedCity = readPref('bazaar-city', '')
    if (savedCity) onCityChange(savedCity)
    setToastsEnabled(readPref('bazaar-toasts', 'on') === 'on')
    applyAccent(readPref('bazaar-accent', 'red'), document.documentElement.getAttribute('data-theme') === 'dark')
    if (readPref('bazaar-motion', 'on') === 'off') document.documentElement.setAttribute('data-motion', 'off')
  }, [])

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [open])

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
    applyAccent(accent, next)
  }

  const changeAccent = (id) => {
    setAccent(id)
    writePref('bazaar-accent', id)
    applyAccent(id, dark)
  }

  const toggleMotion = () => {
    const next = motion === 'on' ? 'off' : 'on'
    setMotion(next)
    writePref('bazaar-motion', next)
    if (next === 'off') document.documentElement.setAttribute('data-motion', 'off')
    else document.documentElement.removeAttribute('data-motion')
  }

  const toggleToasts = () => {
    const next = toasts === 'on' ? 'off' : 'on'
    setToasts(next)
    writePref('bazaar-toasts', next)
    setToastsEnabled(next === 'on')
  }

  const pickCity = useCallback((c) => {
    onCityChange(c)
    writePref('bazaar-city', c)
  }, [onCityChange])

  const resetSettings = () => {
    try {
      localStorage.removeItem('bazaar-accent')
      localStorage.removeItem('bazaar-motion')
      localStorage.removeItem('bazaar-toasts')
      localStorage.removeItem('bazaar-city')
    } catch {}
    document.documentElement.style.removeProperty('--red')
    document.documentElement.style.removeProperty('--red-dark')
    document.documentElement.style.removeProperty('--red-soft')
    document.documentElement.style.removeProperty('--shadow-red')
    document.documentElement.style.removeProperty('--ring')
    document.documentElement.removeAttribute('data-motion')
    setAccent('red'); setMotion('on'); setToasts('on')
    pickCity('all')
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <div className="sb-hero">
          <span className="sb-hero-icon" aria-hidden="true"><span>⚙</span></span>
          <div>
            <div className="sb-hero-name">الإعدادات</div>
            <div className="sb-hero-sub">تحكم كامل بالتطبيق</div>
          </div>
        </div>

        <div className="set-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'set-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <nav className="sidebar-nav">
          {tab === 'account' && (
            <div className="set-panel" key="account">
              <div className="set-card">
                <div className="set-card-label">الحساب</div>
                {user ? (
                  <>
                    <button type="button" className={'acc-main' + (accountOpen ? ' expanded' : '')} onClick={() => setAccountOpen(o => !o)}>
                      <span className="acc-avatar">
                        {user.avatar ? <img src={mediaUrl(user.avatar)} alt={user.name} /> : (user.name || 'ب').slice(0, 1)}
                      </span>
                      <span className="set-row-text">
                        <span className="set-row-name">{user.name}</span>
                        <span className="set-row-sub">{user.email || user.phone || 'حسابي'}</span>
                      </span>
                      <span className={'acc-chevron' + (accountOpen ? ' up' : '')}>▾</span>
                    </button>
                    {accountOpen && (
                      <div className="acc-menu">
                        <button type="button" className="acc-action" onClick={() => { setEditOpen(true); setAccountOpen(false) }}>
                          ✏️ تعديل البيانات
                        </button>
                        <button type="button" className="acc-action" onClick={() => { setPlansOpen(true); setAccountOpen(false) }}>
                          💎 خطط الاشتراك
                        </button>
                        <button type="button" className="acc-action" onClick={() => { setAccountOpen(false); onLogout(); onRequireAuth() }}>
                          🔄 تبديل الحساب
                        </button>
                        <button type="button" className="acc-action danger" onClick={() => { setAccountOpen(false); onLogout() }}>
                          ⎋ تسجيل الخروج
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button type="button" className="acc-main" onClick={onRequireAuth}>
                    <span className="acc-avatar empty">👤</span>
                    <span className="set-row-text">
                      <span className="set-row-name">تسجيل الدخول</span>
                      <span className="set-row-sub">او انشاء حساب جديد</span>
                    </span>
                    <span className="acc-chevron">‹</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="set-panel" key="appearance">
              <div className="set-card">
                <div className="set-card-label">الوضع</div>
                <div className="set-row">
                  <span className="set-row-icon" aria-hidden="true">{dark ? '🌙' : '☀️'}</span>
                  <div className="set-row-text">
                    <span className="set-row-name">الوضع الليلي</span>
                    <span className="set-row-sub">{dark ? 'مفعل' : 'غير مفعل'}</span>
                  </div>
                  <button
                    type="button"
                    className={'set-switch' + (dark ? ' on' : '')}
                    onClick={toggleTheme}
                    role="switch"
                    aria-checked={dark}
                    aria-label="الوضع الليلي"
                  >
                    <span className="set-knob">{dark ? '🌙' : '☀️'}</span>
                  </button>
                </div>
              </div>

              <div className="set-card">
                <div className="set-card-label">لون التمييز</div>
                <div className="set-row static">
                  <span className="set-row-icon" aria-hidden="true">🎨</span>
                  <div className="set-row-text">
                    <span className="set-row-name">اللون الاساسي</span>
                    <span className="set-row-sub">{ACCENTS[accent]?.label || 'احمر'}</span>
                  </div>
                  <div className="set-swatches">
                    {Object.entries(ACCENTS).map(([id, a]) => (
                      <button
                        key={id}
                        type="button"
                        className={'set-swatch' + (accent === id ? ' active' : '')}
                        style={{ background: a.main }}
                        title={a.label}
                        aria-label={a.label}
                        onClick={() => changeAccent(id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="set-card">
                <div className="set-card-label">التفاعل</div>
                <div className="set-row">
                  <span className="set-row-icon" aria-hidden="true">✨</span>
                  <div className="set-row-text">
                    <span className="set-row-name">الحركات والتأثيرات</span>
                    <span className="set-row-sub">{motion === 'on' ? 'مفعلة' : 'معطلة (اداء افضل)'}</span>
                  </div>
                  <button
                    type="button"
                    className={'set-switch' + (motion === 'on' ? ' on' : '')}
                    onClick={toggleMotion}
                    role="switch"
                    aria-checked={motion === 'on'}
                    aria-label="الحركات والتأثيرات"
                  >
                    <span className="set-knob">{motion === 'on' ? '✨' : '🚫'}</span>
                  </button>
                </div>
                <div className="set-row" style={{ marginTop: '6px' }}>
                  <span className="set-row-icon" aria-hidden="true">🔔</span>
                  <div className="set-row-text">
                    <span className="set-row-name">التنبيهات المنبثقة</span>
                    <span className="set-row-sub">{toasts === 'on' ? 'تظهر عند كل حدث' : 'مخفية'}</span>
                  </div>
                  <button
                    type="button"
                    className={'set-switch' + (toasts === 'on' ? ' on' : '')}
                    onClick={toggleToasts}
                    role="switch"
                    aria-checked={toasts === 'on'}
                    aria-label="التنبيهات المنبثقة"
                  >
                    <span className="set-knob">{toasts === 'on' ? '🔔' : '🔕'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'location' && (
            <div className="set-panel" key="location">
              <div className="set-card">
                <div className="set-card-label">الموقع</div>
                <div className="set-cities">
                  <button
                    type="button"
                    className={'set-city' + (city === 'all' ? ' active' : '')}
                    onClick={() => pickCity('all')}
                  >🌍 الكل</button>
                  {cities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={'set-city' + (city === c.id ? ' active' : '')}
                      onClick={() => pickCity(c.id)}
                    >{c.name}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="set-panel" key="about">
              <div className="set-card">
                <div className="set-card-label">حول التطبيق</div>
                <div className="set-row static">
                  <span className="set-row-icon brand-x" aria-hidden="true">✕</span>
                  <div className="set-row-text">
                    <span className="set-row-name">ZONX</span>
                    <span className="set-row-sub">الإصدار 1.0</span>
                  </div>
                </div>
                <div className="set-row static" style={{ marginTop: '6px' }}>
                  <span className="set-row-icon" aria-hidden="true">🇸🇾</span>
                  <div className="set-row-text">
                    <span className="set-row-name">سوق سورية</span>
                    <span className="set-row-sub">تواصل مع المجتمع وشارك أفكارك</span>
                  </div>
                </div>
              </div>

              <div className="set-card">
                <div className="set-card-label">الاعدادات المتقدمة</div>
                <button type="button" className="set-danger-btn" onClick={resetSettings}>
                  ↺ استعادة الاعدادات الافتراضية
                </button>
              </div>
            </div>
          )}
        </nav>
        <div className="sidebar-foot">
          <p>ZONX © 2026</p>
        </div>

        <EditProfileModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          user={user}
          onSuccess={(u) => { onSetUser(u); setEditOpen(false) }}
        />
        <PlansModal open={plansOpen} onClose={() => setPlansOpen(false)} user={user} />
      </aside>
    </>
  )
}
