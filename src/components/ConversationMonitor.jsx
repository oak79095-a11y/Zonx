import { useEffect, useState } from 'react'
import { apiFetch } from '../config.js'

function timeOf(value) {
  try { return new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString('ar-SY', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' }
}

export default function ConversationMonitor() {
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const load = () => apiFetch('/api/admin/conversations', { credentials: 'include' }).then((r) => r.ok ? r.json() : []).then(setConversations).catch(() => setConversations([]))
  useEffect(() => { load() }, [])

  const observe = async (conversation) => {
    const reason = window.prompt('اكتب سبب فتح جلسة المراقبة (سيتم تسجيله):')
    if (!reason) return
    setLoading(true)
    try {
      const start = await apiFetch(`/api/admin/conversations/${conversation.id}/observe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason }) })
      const session = await start.json()
      if (!start.ok) throw new Error(session.error || 'تعذر فتح جلسة المراقبة')
      const response = await apiFetch(`/api/admin/conversations/${conversation.id}/messages?session=${encodeURIComponent(session.session)}`, { credentials: 'include' })
      const rows = await response.json()
      if (!response.ok) throw new Error(rows.error || 'تعذر تحميل المحادثة')
      setActive({ ...conversation, expires: Date.now() + session.expires_in * 1000 })
      setMessages(Array.isArray(rows) ? rows : [])
      setNotice('جلسة المراقبة فعالة لمدة 15 دقيقة وتم تسجيل الوصول.')
    } catch (error) { setNotice(error.message) }
    finally { setLoading(false) }
  }

  return <div className="admin-content"><div className="admin-compliance-banner"><span>⚿</span><div><b>مراقبة محادثات مقيدة</b><p>كل فتح يتطلب سببًا، ويُسجل في سجل التدقيق. الجلسة تنتهي تلقائيًا بعد 15 دقيقة.</p></div></div>{notice && <div className="admin-alert success">{notice}</div>}<div className="conversation-monitor-grid"><div className="admin-table-card conversation-list"><div className="admin-table-title"><b>المحادثات النشطة</b><span>{conversations.length} محادثة</span></div>{conversations.length ? conversations.map((conversation) => <button type="button" className={'conversation-row' + (active?.id === conversation.id ? ' active' : '')} key={conversation.id} onClick={() => observe(conversation)}><span className="conversation-icon">◌</span><span><b>{conversation.reference}</b><small>{conversation.participants}</small></span><em>{conversation.message_count} رسالة</em></button>) : <div className="admin-empty">لا توجد محادثات</div>}</div><div className="admin-card conversation-viewer">{!active ? <div className="admin-empty"><span className="conversation-empty-icon">◌</span><h3>اختر محادثة للمراجعة</h3><p>سيتم إخفاء هويات الأطراف وتسجيل سبب الوصول.</p></div> : <><div className="conversation-viewer-head"><div><span className="admin-label">جلسة امتثال مؤقتة</span><h3>{active.reference}</h3><small>{active.participants}</small></div><button className="mini" onClick={() => setActive(null)}>إغلاق</button></div><div className="conversation-messages">{messages.map((message) => <article key={message.id} className="compliance-message"><div><b>{message.sender_label}</b><small>{timeOf(message.created_at)}</small></div>{message.text && <p>{message.text}</p>}{message.media && <a href={message.media} target="_blank" rel="noreferrer" className="compliance-media">{message.media_type === 'image' ? '▧ فتح الصورة' : `📎 ${message.media_name || 'فتح المرفق'}`}</a>}</article>)}{messages.length === 0 && <div className="admin-empty">لا توجد رسائل</div>}</div></>}</div></div>{loading && <div className="admin-loading">جاري فتح جلسة المراقبة...</div>}</div>
}
