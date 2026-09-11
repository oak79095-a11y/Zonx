import { useCallback, useEffect, useMemo, useState } from 'react'
import { VerifiedIcon } from './icons.jsx'
import ConversationMonitor from './ConversationMonitor.jsx'

const tabs = [
  ['overview', 'نظرة عامة', '⌂'],
  ['listings', 'الإعلانات', '▣'],
  ['users', 'المستخدمون', '♙'],
  ['payments', 'المدفوعات', '◈'],
  ['activity', 'النشاط والامتثال', '◌'],
  ['conversations', 'مراقبة المحادثات', '◍'],
  ['security', 'الأمان', '◇'],
]

const labels = {
  pending_listings: 'إعلانات قيد المراجعة',
  active_listings: 'إعلانات نشطة',
  total_users: 'إجمالي المستخدمين',
  total_stories: 'القصص النشطة',
  total_messages: 'الرسائل المعالجة',
  total_conversations: 'المحادثات',
  total_follows: 'عمليات المتابعة',
  unread_notifications: 'إشعارات غير مقروءة',
}

function api(url, options) {
  return fetch(url, { credentials: 'include', ...options }).then(async (r) => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب')
    return data
  })
}

function timeOf(value) {
  try { return new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString('ar-SY', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' }
}

export default function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [listings, setListings] = useState([])
  const [listingFilter, setListingFilter] = useState('pending')
  const [users, setUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [payments, setPayments] = useState([])
  const [activity, setActivity] = useState([])
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [selectedListing, setSelectedListing] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const loadStats = useCallback(() => api('/api/admin/dashboard').then(setStats).catch(() => {}), [])
  const loadListings = useCallback(() => api(`/api/admin/listings?status=${listingFilter}`).then(setListings).catch(() => setListings([])), [listingFilter])
  const loadUsers = useCallback(() => api(`/api/admin/users?q=${encodeURIComponent(userQuery)}`).then(setUsers).catch(() => setUsers([])), [userQuery])
  const loadPayments = useCallback(() => api('/api/admin/payments').then(setPayments).catch(() => setPayments([])), [])
  const loadActivity = useCallback(() => api('/api/admin/activity').then(setActivity).catch(() => setActivity([])), [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { if (tab === 'overview' || tab === 'listings') loadListings() }, [tab, loadListings])
  useEffect(() => { if (tab === 'users') { const timer = setTimeout(loadUsers, 250); return () => clearTimeout(timer) } }, [tab, loadUsers])
  useEffect(() => { if (tab === 'payments') loadPayments() }, [tab, loadPayments])
  useEffect(() => { if (tab === 'activity') loadActivity() }, [tab, loadActivity])

  const notify = (ok, text) => { setMessage({ ok, text }); setTimeout(() => setMessage(null), 3500) }

  const updateListing = async (id, status) => {
    try { await api(`/api/admin/listings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); notify(true, status === 'approved' ? 'تم اعتماد الإعلان' : 'تم رفض الإعلان'); loadListings(); loadStats() }
    catch (error) { notify(false, error.message) }
  }

  const deleteListing = async (id) => {
    if (!window.confirm('هل تريد حذف الإعلان نهائيًا؟')) return
    try { await api(`/api/admin/listings/${id}`, { method: 'DELETE' }); notify(true, 'تم حذف الإعلان'); loadListings(); loadStats() }
    catch (error) { notify(false, error.message) }
  }

  const toggleVerify = async (user) => {
    try { const data = await api(`/api/admin/users/${user.id}/verify`, { method: 'POST' }); setUsers((rows) => rows.map((row) => row.id === user.id ? { ...row, verified: data.verified } : row)); notify(true, data.verified ? 'تم توثيق المستخدم' : 'تم إلغاء التوثيق') }
    catch (error) { notify(false, error.message) }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    try { await api('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }) }); setOldPass(''); setNewPass(''); notify(true, 'تم تغيير كلمة مرور الإدارة') }
    catch (error) { notify(false, error.message) }
  }

  const statCards = useMemo(() => stats ? Object.entries(labels).map(([key, label]) => ({ key, label, value: stats[key] ?? 0 })) : [], [stats])

  return (
    <section className="admin-shell">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand"><span className="admin-brand-mark">✦</span><div><b>BAYADER</b><small>CONTROL ROOM</small></div></div>
          <div className="admin-live"><i /> النظام يعمل <span>LIVE</span></div>
          <nav className="admin-nav" aria-label="أقسام الإدارة">
            {tabs.map(([id, label, icon]) => <button key={id} type="button" title={label} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}{id === 'listings' && stats?.pending_listings > 0 ? <em>{stats.pending_listings}</em> : null}</button>)}
          </nav>
          <div className="admin-side-foot"><span>جلسة آمنة</span><small>وصول مدير موثق</small><button type="button" onClick={onLogout}>تسجيل الخروج</button></div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar"><div><span className="admin-kicker">مساحة الإدارة / {tabs.find((item) => item[0] === tab)?.[1]}</span><h1>{tabs.find((item) => item[0] === tab)?.[1]}</h1></div><div className="admin-top-actions"><span className="admin-date">● مراقبة مباشرة</span><button type="button" className="admin-refresh" onClick={() => { loadStats(); if (tab === 'activity') loadActivity() }} aria-label="تحديث">↻</button></div></header>
          {message && <div className={'admin-alert ' + (message.ok ? 'success' : 'error')}>{message.text}</div>}

          {tab === 'overview' && <Overview stats={stats} cards={statCards} listings={listings} onNavigate={setTab} />}
          {tab === 'listings' && <Listings rows={listings} filter={listingFilter} onFilter={setListingFilter} onUpdate={updateListing} onDelete={deleteListing} onDetails={setSelectedListing} />}
          {tab === 'users' && <Users rows={users} query={userQuery} onQuery={setUserQuery} onVerify={toggleVerify} onDetails={setSelectedUser} />}
          {tab === 'payments' && <Payments rows={payments} />}
          {tab === 'activity' && <Activity rows={activity} />}
          {tab === 'conversations' && <ConversationMonitor />}
          {tab === 'security' && <Security oldPass={oldPass} newPass={newPass} setOldPass={setOldPass} setNewPass={setNewPass} onSubmit={changePassword} />}
          {selectedListing && <ListingDetails listing={selectedListing} onClose={() => setSelectedListing(null)} onUpdate={updateListing} onDelete={deleteListing} />}
          {selectedUser && <UserDetails user={selectedUser} onClose={() => { setSelectedUser(null); setTemporaryPassword('') }} onVerify={toggleVerify} temporaryPassword={temporaryPassword} onResetPassword={async (user) => { if (!window.confirm('سيتم إلغاء كلمة المرور الحالية وإنشاء مؤقتة. متابعة؟')) return; try { const data = await api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' }); setTemporaryPassword(data.temporaryPassword); notify(true, 'تم إنشاء كلمة مرور مؤقتة. اعرضها للمستخدم عبر قناة آمنة.') } catch (error) { notify(false, error.message) } }} />}
        </main>
      </div>
    </section>
  )
}

function Overview({ stats, cards, listings, onNavigate }) {
  return <div className="admin-content"><div className="admin-welcome"><div><span>مركز العمليات</span><h2>كل شيء تحت السيطرة.</h2><p>راقب نشاط المنصة، راجع المحتوى، وحافظ على أمان المستخدمين من مكان واحد.</p></div><div className="admin-shield">✓<small>PROTECTED</small></div></div><div className="admin-metric-grid">{cards.map((card, index) => <div className={'admin-metric metric-' + (index % 4)} key={card.key}><span>{card.label}</span><strong>{card.value.toLocaleString('ar-SY')}</strong><small>{card.key === 'unread_notifications' ? 'تحتاج متابعة' : 'إجمالي مسجل'}</small></div>)}</div><div className="admin-overview-grid"><div className="admin-card"><div className="admin-card-head"><div><span className="admin-label">أولوية اليوم</span><h3>المهام التي تحتاج قرارًا</h3></div><button type="button" onClick={() => onNavigate('listings')}>عرض الكل</button></div><div className="admin-task" onClick={() => onNavigate('listings')}><span className="task-icon red">!</span><div><b>{stats?.pending_listings || 0} إعلان بانتظار المراجعة</b><small>تحقق من المحتوى والوسائط والبيانات</small></div><span>←</span></div><div className="admin-task" onClick={() => onNavigate('payments')}><span className="task-icon gold">◈</span><div><b>{stats?.pending_payments || 0} دفعة معلقة</b><small>راجع العمليات المالية قبل التفعيل</small></div><span>←</span></div><div className="admin-task" onClick={() => onNavigate('conversations')}><span className="task-icon red">◍</span><div><b>{stats?.total_conversations || 0} محادثة للمراقبة</b><small>افتح جلسة امتثال مسجلة لمراجعة النصوص والوسائط</small></div><span>←</span></div><div className="admin-recent-head"><span>آخر الإعلانات النشطة</span><button type="button" onClick={() => onNavigate('listings')}>كل الإعلانات</button></div>{listings.slice(0, 4).map((listing) => <button type="button" className="admin-recent-row" key={listing.id} onClick={() => onNavigate('listings')}><span><b>{listing.title}</b><small>{listing.user_name || 'مستخدم'} · {listing.category_id}</small></span><strong>{Number(listing.price || 0).toLocaleString('ar-SY')} ل.س</strong></button>)}</div><div className="admin-card admin-privacy-card"><span className="admin-label">حالة الخصوصية</span><h3>المراقبة الآمنة مفعلة</h3><p>المحتوى الحساس لا يظهر في لوحة الإدارة. سجلات المحادثات تعرض بيانات تشغيلية مجهّلة فقط.</p><div className="privacy-row"><i /> عزل الحسابات <b>مفعل</b></div><div className="privacy-row"><i /> سجل التدقيق <b>مفعل</b></div></div></div></div>
}

function Listings({ rows, filter, onFilter, onUpdate, onDelete, onDetails }) { return <div className="admin-content"><div className="admin-toolbar"><div className="admin-pills">{[['pending','معلقة'],['active','نشطة'],['rejected','مرفوضة'],['expired','منتهية']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => onFilter(id)}>{label}</button>)}</div><span className="admin-count">{rows.length} نتيجة</span></div><div className="admin-table-card"><div className="admin-table-head"><span>الإعلان</span><span>المالك</span><span>السعر</span><span>الحالة / الإجراء</span></div>{rows.length ? rows.map((row) => <div className="admin-table-row" key={row.id}><button type="button" className="admin-listing-title" onClick={() => onDetails(row)}><b>{row.title}</b><small>{row.category_id} · {row.city_id}</small></button><span>{row.user_name || 'مستخدم'}</span><span>{Number(row.price).toLocaleString('ar-SY')} ل.س</span><div className="admin-row-actions"><button className="mini" onClick={() => onDetails(row)}>تفاصيل</button>{filter === 'pending' && <><button className="mini primary" onClick={() => onUpdate(row.id, 'approved')}>اعتماد</button><button className="mini" onClick={() => onUpdate(row.id, 'rejected')}>رفض</button></>}<button className="mini danger" onClick={() => onDelete(row.id)}>حذف</button></div></div>) : <div className="admin-empty">لا توجد إعلانات في هذه القائمة</div>}</div></div> }

function ListingDetails({ listing, onClose, onUpdate, onDelete }) { return <div className="admin-modal-backdrop" onClick={onClose}><div className="admin-listing-modal" onClick={(event) => event.stopPropagation()}><div className="admin-modal-head"><div><span className="admin-label">تفاصيل الإعلان</span><h2>{listing.title}</h2></div><button type="button" onClick={onClose}>×</button></div>{listing.images?.length > 0 && <div className="admin-listing-images">{listing.images.map((image) => <img key={image} src={image} alt="" />)}</div>}<div className="admin-detail-grid"><div><small>المالك</small><b>{listing.user_name || 'غير معروف'}</b></div><div><small>البريد</small><b>{listing.user_email || 'غير متوفر'}</b></div><div><small>الهاتف</small><b>{listing.user_phone || 'غير متوفر'}</b></div><div><small>السعر</small><b>{Number(listing.price || 0).toLocaleString('ar-SY')} ل.س</b></div><div><small>التصنيف</small><b>{listing.category_id || 'غير محدد'}</b></div><div><small>المدينة</small><b>{listing.city_id || 'غير محددة'}</b></div><div><small>المشاهدات</small><b>{listing.views || 0}</b></div><div><small>الحالة</small><b>{listing.status}</b></div></div><div className="admin-description"><small>الوصف</small><p>{listing.description || 'لا يوجد وصف'}</p></div><div className="admin-modal-actions">{listing.status === 'pending' && <><button className="mini primary" onClick={() => { onUpdate(listing.id, 'approved'); onClose() }}>اعتماد الإعلان</button><button className="mini" onClick={() => { onUpdate(listing.id, 'rejected'); onClose() }}>رفض الإعلان</button></>}<button className="mini danger" onClick={() => { onDelete(listing.id); onClose() }}>حذف نهائي</button></div></div></div> }

function Users({ rows, query, onQuery, onVerify, onDetails }) { return <div className="admin-content"><div className="admin-search"><span>⌕</span><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="ابحث بالاسم أو البريد أو الهاتف" /></div><div className="admin-user-grid">{rows.map((row) => <div className="admin-user-card" key={row.id}><button type="button" className="admin-user-avatar" onClick={() => onDetails(row)}>{row.avatar ? <img src={row.avatar} alt="" /> : (row.name || 'م').slice(0, 1)}</button><div className="admin-user-info" onClick={() => onDetails(row)}><b>{row.name} {row.verified && <VerifiedIcon size={13} />}</b><small>{row.email || row.phone || 'بيانات اتصال مخفية'}</small><span>{row.listings} إعلانات · {row.role}</span></div><button className="mini" onClick={() => onDetails(row)}>تفاصيل</button><button className={row.verified ? 'mini' : 'mini primary'} onClick={() => onVerify(row)}>{row.verified ? 'إلغاء التوثيق' : 'توثيق'}</button></div>)}</div></div> }

function UserDetails({ user, onClose, onVerify, onResetPassword, temporaryPassword }) { return <div className="admin-modal-backdrop" onClick={onClose}><div className="admin-listing-modal" onClick={(event) => event.stopPropagation()}><div className="admin-modal-head"><div className="admin-profile-title"><span className="admin-user-avatar large">{user.avatar ? <img src={user.avatar} alt="" /> : (user.name || 'م').slice(0, 1)}</span><div><span className="admin-label">ملف المستخدم</span><h2>{user.name}</h2></div></div><button type="button" onClick={onClose}>×</button></div><div className="admin-detail-grid"><div><small>المعرف</small><b className="mono">{user.id}</b></div><div><small>الدور</small><b>{user.role}</b></div><div><small>البريد</small><b>{user.email || 'غير متوفر'}</b></div><div><small>الهاتف</small><b>{user.phone || 'غير متوفر'}</b></div><div><small>الإعلانات</small><b>{user.listings || 0}</b></div><div><small>التوثيق</small><b>{user.verified ? 'موثق' : 'غير موثق'}</b></div><div><small>تاريخ التسجيل</small><b>{user.created_at || 'غير متوفر'}</b></div></div>{temporaryPassword && <div className="temporary-password"><small>كلمة المرور المؤقتة - اعرضها مرة واحدة للمستخدم</small><code>{temporaryPassword}</code><p>لا تحفظها في الدردشة أو في ملاحظات عامة. سيحتاج المستخدم إلى تغييرها.</p></div>}<div className="admin-modal-actions"><button className={user.verified ? 'mini' : 'mini primary'} onClick={() => { onVerify(user); onClose() }}>{user.verified ? 'إلغاء التوثيق' : 'توثيق المستخدم'}</button>{user.role !== 'admin' && <button className="mini danger" onClick={() => onResetPassword(user)}>إعادة تعيين كلمة المرور</button>}<button className="mini" onClick={onClose}>إغلاق</button></div></div></div> }

function Payments({ rows }) { return <div className="admin-content"><div className="admin-card"><div className="admin-card-head"><div><span className="admin-label">المعاملات</span><h3>مراجعة المدفوعات</h3></div><span className="admin-count">{rows.length} معاملة</span></div>{rows.length ? rows.map((row) => <div className="admin-payment" key={row.id}><div><b>{row.user_name || 'مستخدم'}</b><small>{row.plan || row.method} · {timeOf(row.created_at)}</small></div><strong>{Number(row.amount).toLocaleString('ar-SY')} ل.س</strong><span className={'payment-status ' + row.status}>{row.status}</span></div>) : <div className="admin-empty">لا توجد مدفوعات</div>}</div></div> }

function Activity({ rows }) { return <div className="admin-content"><div className="admin-compliance-banner"><span>◉</span><div><b>وضع الامتثال الآمن</b><p>يتم عرض البيانات التشغيلية فقط. نصوص الرسائل ومفاتيح E2EE غير متاحة لمسؤولي المنصة.</p></div></div><div className="admin-table-card"><div className="admin-table-head"><span>المعرف</span><span>النشاط</span><span>النطاق المجهّل</span><span>الوقت</span></div>{rows.length ? rows.map((row) => <div className="admin-table-row" key={row.id}><b className="mono">{row.id}</b><span>{row.type}<small>{row.privacy}</small></span><span className="mono">{row.participants}</span><span>{timeOf(row.created_at)}</span></div>) : <div className="admin-empty">لا يوجد نشاط مسجل</div>}</div></div> }

function Security({ oldPass, newPass, setOldPass, setNewPass, onSubmit }) { return <div className="admin-content"><div className="admin-security-grid"><div className="admin-card"><span className="admin-label">حماية الحساب</span><h3>تحديث كلمة مرور المدير</h3><p>استخدم كلمة مرور طويلة وفريدة. لا تتم مشاركة بيانات الدخول مع أي مستخدم.</p><form className="admin-password-form" onSubmit={onSubmit}><input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} placeholder="كلمة المرور الحالية" required /><input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="كلمة المرور الجديدة 12+ حرف" minLength={12} required /><button className="mini primary" type="submit">حفظ التغيير</button></form></div><div className="admin-card"><span className="admin-label">السياسات</span><h3>ضوابط الوصول</h3><div className="privacy-row"><i /> مصادقة المدير <b>مفعلة</b></div><div className="privacy-row"><i /> حماية ملفات الدردشة <b>مفعلة</b></div><div className="privacy-row"><i /> إخفاء معرفات المستخدمين <b>مفعل</b></div><div className="privacy-row"><i /> مراقبة نصوص E2EE <b>غير متاحة</b></div></div></div></div> }
