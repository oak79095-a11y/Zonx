import { useEffect, useState } from 'react'
import { ArrowBackIcon } from './icons.jsx'
import { mediaUrl } from '../config.js'

function timeOf(value) {
  try {
    return new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString('ar-SY', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export default function NotificationCenter({ onBack }) {
  const [items, setItems] = useState(null)
  const [requests, setRequests] = useState([])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/notifications', { credentials: 'include' }).then((r) => r.ok ? r.json() : null),
      fetch('/api/users/friend-requests', { credentials: 'include' }).then((r) => r.ok ? r.json() : []),
      fetch('/api/notifications/read', { method: 'POST', credentials: 'include' }),
    ]).then(([data, incoming]) => {
      if (alive) setItems(Array.isArray(data?.notifications) ? data.notifications : [])
      if (alive) setRequests(Array.isArray(incoming) ? incoming : [])
      window.dispatchEvent(new Event('notifications-read'))
    }).catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  const respond = async (id, action) => {
    const r = await fetch(`/api/users/friend-requests/${encodeURIComponent(id)}/respond`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    if (r.ok) setRequests((prev) => prev.filter((request) => request.id !== id))
  }

  return (
    <section className="section notifications-section">
      <div className="container">
        <button type="button" className="back-btn" onClick={onBack} aria-label="رجوع">
          <ArrowBackIcon size={20} />
        </button>
        <div className="notifications-head">
          <div>
            <h2 className="section-title">الإشعارات</h2>
            <p className="section-sub">آخر التفاعلات على حسابك</p>
          </div>
          <span className="notification-status">تمت القراءة</span>
        </div>
        {items === null ? <div className="empty-state"><p>جاري تحميل الإشعارات...</p></div> : items.length === 0 ? (
          <div className="empty-state"><span className="empty-icon" aria-hidden="true">🔔</span><h3>لا توجد إشعارات</h3><p>ستظهر هنا الإعجابات والمتابعات والرسائل الجديدة.</p></div>
        ) : (
          <div className="notification-list">
            {items.map((item) => (
              <article className={'notification-item' + (!item.read_at ? ' unread' : '')} key={item.id}>
                <span className="notification-avatar">{item.actor_avatar ? <img src={mediaUrl(item.actor_avatar)} alt="" /> : (item.actor_name || 'م').slice(0, 1)}</span>
                <div className="notification-copy"><b>{item.message}</b><small>{timeOf(item.created_at)}</small></div>
              </article>
            ))}
          </div>
          )}
        {requests.length > 0 && (
          <div className="friend-requests-panel">
            <h3>طلبات الصداقة</h3>
            {requests.map((request) => (
              <article className="friend-request-item" key={request.id}>
                <span className="notification-avatar">{request.avatar ? <img src={mediaUrl(request.avatar)} alt="" /> : request.name.slice(0, 1)}</span>
                <b>{request.name}</b>
                <button type="button" className="btn btn-primary" onClick={() => respond(request.id, 'accept')}>قبول</button>
                <button type="button" className="btn btn-outline" onClick={() => respond(request.id, 'reject')}>رفض</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
