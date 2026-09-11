import { useEffect, useState } from 'react'
import AdCard from './AdCard.jsx'
import { toast } from './Toast.jsx'
import {
  VerifiedIcon, CrownIcon, ArrowBackIcon,
  GridIcon, ListIcon, UserPlusIcon, UserCheckIcon, ZonxMark,
} from './icons.jsx'

function ChatIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
import { formatPrice, formatDate } from '../data/format.js'
import { cityName, categoryIcon } from '../data/catalog.js'
import { mediaUrl } from '../config.js'

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

function mapApiAd(l) {
  const all = (l.images || []).filter(Boolean).map(mediaUrl)
  const videos = all.filter((p) => VIDEO_EXT.test(p))
  const imgs = all.filter((p) => !VIDEO_EXT.test(p))
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price,
    category: l.category_id,
    city: l.city_id,
    phone: l.phone || '',
    seller_id: l.user_id || l.seller_id || null,
    seller_name: l.seller_name || 'بائع',
    seller_email: l.seller_email || null,
    seller_avatar: mediaUrl(l.seller_avatar),
    seller_verified: Boolean(l.seller_verified),
    likes: l.likes || 0,
    featured: Boolean(l.featured),
    date: (l.created_at || '').slice(0, 10),
    image: imgs[0] || null,
    images: imgs,
    video: videos[0] || null,
  }
}

export default function SellerProfile({ seller, user, onBack, onOpenAd, onSeller, onMessage, userId }) {
  const [ads, setAds] = useState(null)
  const [offline, setOffline] = useState(false)
  const [info, setInfo] = useState(null)
  const [mode, setMode] = useState('grid')
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setAds(null)
    setInfo(null)
    setOffline(false)
    fetch('/api/listings')
      .then((r) => { if (!r.ok) throw new Error('offline'); return r.json() })
      .then((rows) => { if (alive) setAds(Array.isArray(rows) ? rows.map(mapApiAd) : []) })
      .catch(() => { if (alive) { setOffline(true); setAds([]) } })
    if (seller.id) {
      fetch(`/api/users/${seller.id}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setInfo(d) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [seller.id])

  const own = (ads || []).filter((a) => (
    seller.id ? a.seller_id === seller.id : a.seller_name === seller.name
  ))

  const email = info?.email || seller.email || own[0]?.seller_email || null
  const isAdminProfile = email === 'oak79095@gmail.com'
  const name = info?.name || seller.name || 'بائع'
  const avatar = info?.avatar || seller.avatar
  const verified = isAdminProfile
  const followers = info ? info.followers : 0
  const following = info ? info.following : 0
  const isOwner = isAdminProfile
  const isMe = Boolean(info?.is_me)
  const isFollowing = Boolean(info?.is_following)

  const canFollow = Boolean(user && seller.id && info && !isMe && !isOwner)

  const toggleFollow = async () => {
    if (!canFollow || followBusy) return
    setFollowBusy(true)
    const next = !isFollowing
    setInfo((d) => ({ ...d, is_following: next, followers: d.followers + (next ? 1 : -1) }))
    try {
      const r = await fetch(`/api/users/${seller.id}/follow`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!r.ok) throw new Error('fail')
      const d = await r.json()
      setInfo((prev) => ({ ...prev, is_following: d.following, followers: d.followers }))
      toast(next ? `تابعت ${name} ✓` : 'تم الغاء المتابعة', 'success')
    } catch {
      setInfo((prev) => ({ ...prev, is_following: !next, followers: prev.followers + (next ? -1 : 1) }))
      toast('تعذر الاتصال - جرب مرة اخرى', 'error')
    } finally {
      setFollowBusy(false)
    }
  }

  return (
    <section className="section seller-profile-section">
      <div className="container">
        <button type="button" className="back-btn" onClick={onBack} aria-label="رجوع" title="رجوع"><ArrowBackIcon size={20} /></button>

        <div className="seller-card fade-in">
          <div className="seller-cover">
            <span className="cover-glow" />
            <span className="cover-ring r1" />
            <span className="cover-ring r2" />
            {isOwner ? (
              <span className="cover-owner-chip"><CrownIcon size={13} /> المالك الرسمي لمنصة ZONX</span>
            ) : null}
          </div>

          <div className="seller-head">
            <div className="seller-avatar-wrap">
              {avatar ? (
                <img className="seller-avatar" src={avatar} alt={name} />
              ) : (
                <span className="seller-avatar empty">{(name || '؟').trim().charAt(0)}</span>
              )}
            </div>

            <div className="seller-id">
              <span className="seller-name">
                {name}
                {verified && <VerifiedIcon size={17} />}
                {isAdminProfile && <span className="post-seller-brand">على <ZonxMark /></span>}
                {isOwner ? (
                  <span className="owner-badge">
                    <CrownIcon size={13} /> مالك منصة <b className="owner-platform">ZONX</b>
                  </span>
                ) : null}
              </span>
            </div>
          </div>

          {(canFollow || (seller.id && user && !isMe && !isOwner)) ? (
            <div className="seller-follow-row">
              {canFollow ? (
                <button
                  type="button"
                  className={'profile-icon-btn follow-ic' + (isFollowing ? ' following' : '')}
                  onClick={toggleFollow}
                  disabled={followBusy}
                  title={isFollowing ? 'تمت المتابعة - اضغط للالغاء' : 'متابعة'}
                  aria-label={isFollowing ? 'الغاء المتابعة' : 'متابعة'}
                >
                  {isFollowing ? <UserCheckIcon size={17} /> : <UserPlusIcon size={17} />}
                </button>
              ) : null}
              {seller.id && user && !isMe ? (
                <button
                  type="button"
                  className="profile-icon-btn msg-ic"
                  onClick={() => onMessage?.({ id: seller.id, name, avatar })}
                  title="مراسلة"
                  aria-label="مراسلة"
                >
                  <ChatIcon size={16} />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="seller-stats">
            <div className="seller-stat">
              <b>{own.length}</b><span>اعلان</span>
            </div>
            <div className="seller-stat">
              <b>{followers}</b><span>متابع</span>
            </div>
            <div className="seller-stat">
              <b>{following}</b><span>يتابع</span>
            </div>
          </div>
        </div>

        {ads === null ? (
          <div className="feed">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel-card">
                <div className="skel-media" />
                <div className="skel-body">
                  <div className="skel-line w60" />
                  <div className="skel-line w80" />
                </div>
              </div>
            ))}
          </div>
        ) : own.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">📭</span>
            <h3>{offline ? 'تعذر الاتصال بالخادم' : 'لا توجد اعلانات'}</h3>
            <p>لا يعلن هذا البائع عن اي شيء حاليا</p>
          </div>
        ) : (
          <>
            <div className="profile-ads-head fade-in">
              <div className="profile-ads-title">
                <h2>اعلانات {name}</h2>
                <span className="profile-ads-count">{own.length} اعلان</span>
              </div>
              <div className="profile-view-toggle" role="group" aria-label="طريقة العرض">
                <button
                  type="button"
                  className={mode === 'grid' ? 'on' : ''}
                  onClick={() => setMode('grid')}
                  title="عرض شبكة"
                  aria-label="عرض شبكة"
                ><GridIcon size={16} /></button>
                <button
                  type="button"
                  className={mode === 'list' ? 'on' : ''}
                  onClick={() => setMode('list')}
                  title="عرض قائمة"
                  aria-label="عرض قائمة"
                ><ListIcon size={16} /></button>
              </div>
            </div>

            {mode === 'grid' ? (
              <div className="profile-grid">
                {own.map((ad) => {
                  const icon = categoryIcon(ad.category) || '🏷️'
                  return (
                    <button type="button" key={ad.id} className="profile-mini fade-in" onClick={() => onOpenAd(ad)}>
                      <span className="profile-mini-media">
                        {ad.image ? (
                          <img src={ad.image} alt={ad.title} loading="lazy" />
                        ) : (
                          <span className="profile-mini-ph">{icon}</span>
                        )}
                        {ad.featured && <span className="profile-mini-flag">مميز</span>}
                        {ad.video && <span className="profile-mini-video">▶</span>}
                        {ad.images.length > 1 && <span className="profile-mini-count">{ad.images.length}</span>}
                      </span>
                      <span className="profile-mini-body">
                        <span className="profile-mini-title">{ad.title}</span>
                        <span className="profile-mini-price">{formatPrice(ad.price)} <small>ل.س</small></span>
                        <span className="profile-mini-meta">
                          <span>{cityName(ad.city)}</span>
                          <span className="dot">·</span>
                          <span>{formatDate(ad.date)}</span>
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="feed">
                {own.map((ad) => (
                  <AdCard key={ad.id} ad={ad} userId={userId} onClick={onOpenAd} onAvatar={onSeller} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
