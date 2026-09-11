import { HeartIcon } from './icons.jsx'

export default function Header({ onHome, onMenu, onNotifications, onMessages, likedCount = 0, user = null }) {
  return (
    <header className="header">
      <div className="container header-inner">
        <button type="button" className="menu-btn" onClick={onMenu} aria-label="القائمة">
          <span></span><span></span><span></span>
        </button>
        <div className="brand" onClick={onHome} role="button" tabIndex={0} aria-label="ZONX">
          <span className="zonx-icon" aria-hidden="true"><span className="zonx-icon-x">✕</span></span>
          <span className="zonx-wordmark">ZON<span className="zonx-x">X</span></span>
        </div>
        <div className="header-quick-actions">
        <button type="button" className="hd-message" onClick={onMessages} aria-label="المراسلات" title="المراسلات">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 12h5" /></svg>
        </button>
        <button type="button" className="hd-heart" onClick={onNotifications} aria-label="الإشعارات" title="الإشعارات">
          <HeartIcon size={19} />
          {user && likedCount > 0 && <span className="hd-heart-badge">{likedCount > 99 ? '+99' : likedCount}</span>}
        </button>
        </div>
      </div>
    </header>
  )
}
