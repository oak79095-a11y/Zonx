import { useState, useRef, useEffect } from 'react'
import { categoryName, cityName, categoryIcon } from '../data/catalog.js'
import { formatPrice, formatDate } from '../data/format.js'
import { HeartIcon, CommentIcon, ShareIcon, BookmarkIcon, MoreIcon, LocationIcon, SendIcon, VerifiedIcon, ZonxMark, GridIcon, ImageFileIcon, UserPlusIcon } from './icons.jsx'
import { apiFetch } from '../config.js'

const scopedKey = (key, userId) => `${key}:${userId || 'guest'}`

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}
function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])) } catch {}
}

export default function AdCard({ ad, onClick, onAvatar, userId = null }) {
  const likedKey = scopedKey('bazaar-liked-ads', userId)
  const savedKey = scopedKey('bazaar-saved-ads', userId)
  const allMedia = (ad.images && ad.images.length ? ad.images : (ad.image ? [ad.image] : [])).filter(Boolean)
  const isVideoExt = (p) => /\.(mp4|webm|mov|m4v)$/i.test(p)
  const videoUrl = ad.video || allMedia.find(isVideoExt) || null
  const imgs = allMedia.filter((p) => !isVideoExt(p))
  // الشرائح: الصور + الفيديو معا في نفس البطاقة
  const slides = [...imgs.map((src) => ({ type: 'image', src })), ...(videoUrl ? [{ type: 'video', src: videoUrl }] : [])]
  const isVideo = Boolean(videoUrl)
  const seller = ad.seller_name || 'بائع'
  const sellerAvatar = ad.seller_avatar
  const isAdminSeller = Boolean(ad.seller_verified)
  const icon = categoryIcon(ad.category) || '🏷️'

  const [liked, setLiked] = useState(() => loadSet(likedKey).has(ad.id))
  const [likesCount, setLikesCount] = useState(Number(ad.likes) || 0)
  const [saved, setSaved] = useState(() => loadSet(savedKey).has(ad.id))
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOptionsOpen, setProfileOptionsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [showAllComments, setShowAllComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [toastMsg, setToast] = useState('')
  const [slide, setSlide] = useState(0)
  const [broken, setBroken] = useState({})
  const mediaRef = useRef(null)
  const popRef = useRef(null)
  const cardRef = useRef(null)

  useEffect(() => {
    setLiked(loadSet(likedKey).has(ad.id))
    setSaved(loadSet(savedKey).has(ad.id))
  }, [likedKey, savedKey, ad.id])

  const onMediaError = (i) => setBroken((b) => ({ ...b, [i]: true }))
  const onImgLoad = (e) => e.currentTarget.classList.add('loaded')
  const okSlides = slides.map((s, i) => ({ s, i })).filter(({ i }) => !broken[i])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toastMsg])

  const toggleLike = () => {
    const next = !liked
    setLiked(next)
    setLikesCount(c => Math.max(0, c + (next ? 1 : -1)))
    const s = loadSet(likedKey)
    if (next) s.add(ad.id); else s.delete(ad.id)
    saveSet(likedKey, s)
    window.dispatchEvent(new Event('bazaar-liked-changed'))
    if (popRef.current) {
      popRef.current.classList.remove('pop')
      void popRef.current.offsetWidth
      popRef.current.classList.add('pop')
    }
    apiFetch(`/api/listings/${ad.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liked: next })
    }).catch(() => {
      setLiked(!next)
      setLikesCount(c => Math.max(0, c + (next ? -1 : 1)))
      const s2 = loadSet(likedKey)
      if (next) s2.delete(ad.id); else s2.add(ad.id)
      saveSet(likedKey, s2)
      setToast('تعذر الاتصال - جرب مرة اخرى')
    })
  }

  const toggleSave = () => {
    const next = !saved
    setSaved(next)
    const s = loadSet(savedKey)
    if (next) s.add(ad.id); else s.delete(ad.id)
    saveSet(savedKey, s)
    setToast(next ? 'تم حفظ الاعلان' : 'تم ازالة الحفظ')
  }

  const share = async () => {
    setMenuOpen(false)
    const url = window.location.origin + window.location.pathname
    try {
      if (navigator.share) {
        await navigator.share({ title: ad.title, text: ad.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        setToast('تم نسخ الرابط')
      }
    } catch {}
  }

  const openComments = () => {
    setShowComments(v => !v)
    if (!commentsLoaded) {
      apiFetch(`/api/listings/${ad.id}/comments`).then(r => r.json()).then(rows => {
        setComments(Array.isArray(rows) ? rows : [])
        setCommentsLoaded(true)
      }).catch(() => setCommentsLoaded(true))
    }
  }

  const addComment = async (e) => {
    e.preventDefault()
    const text = commentText.trim()
    if (!text || postingComment) return
    setPostingComment(true)
    try {
      const r = await apiFetch(`/api/listings/${ad.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, name: 'زائر' })
      })
      if (r.ok) {
        const c = await r.json()
        setComments(prev => [c, ...prev])
        setCommentText('')
      }
    } catch {} finally { setPostingComment(false) }
  }

  const hoverPlay = () => {
    const el = mediaRef.current
    if (!el) return
    el.querySelectorAll('video').forEach((v) => {
      v.muted = true
      v.play().catch(() => {})
    })
  }

  const hoverPause = () => {
    const el = mediaRef.current
    if (!el) return
    el.querySelectorAll('video').forEach((v) => {
      try { v.pause(); v.currentTime = 0 } catch {}
    })
  }

  const onMediaScroll = () => {
    const el = mediaRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))
    setSlide(idx)
    Array.from(el.children).forEach((child, i) => {
      if (child.tagName === 'VIDEO' && i !== idx) {
        try { child.pause() } catch {}
      }
    })
  }

  useEffect(() => {
    const cardEl = cardRef.current
    if (!cardEl || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) {
          cardEl.querySelectorAll('video').forEach((v) => {
            try { v.pause() } catch {}
          })
        }
      })
    }, { threshold: 0.35 })
    io.observe(cardEl)
    return () => io.disconnect()
  }, [])

  const shownComments = showAllComments ? comments.slice(0, 10) : comments.slice(0, 2)
  const longDesc = ad.description && ad.description.length > 90

  // فتح ستوري البائع، مع العودة إلى ملفه إذا لم تكن لديه ستوريات.
  const openStoryOrProfile = () => {
    if (!onAvatar) return
    const reqId = Math.random().toString(36).slice(2)
    let settled = false
    const onResponse = (ev) => {
      if (ev.detail?.reqId !== reqId || settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('seller-story-response', onResponse)
      if (!ev.detail.handled) onAvatar(ad)
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      window.removeEventListener('seller-story-response', onResponse)
      onAvatar(ad)
    }, 700)
    window.addEventListener('seller-story-response', onResponse)
    window.dispatchEvent(new CustomEvent('seller-story-request', { detail: { reqId, sellerId: ad.seller_id || null, sellerName: ad.seller_name || '' } }))
  }

  const avatarClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setProfileOptionsOpen(true)
  }

  const chooseProfileOption = (action) => {
    setProfileOptionsOpen(false)
    action()
  }

  return (
    <article ref={cardRef} className="post-card fade-in">
      {menuOpen && <div style={{position:'fixed', inset:0, zIndex:59}} onClick={() => setMenuOpen(false)} />}
      {profileOptionsOpen && (
        <div className="profile-options-overlay" onClick={() => setProfileOptionsOpen(false)}>
          <div className="profile-options" role="dialog" aria-modal="true" aria-labelledby={`profile-options-title-${ad.id}`} onClick={(e) => e.stopPropagation()}>
            <div className="profile-options-head">
              <div>
                <span className="profile-options-kicker">عرض المحتوى</span>
                <h2 id={`profile-options-title-${ad.id}`}>{seller}</h2>
              </div>
              <button type="button" className="profile-options-close" onClick={() => setProfileOptionsOpen(false)} aria-label="إغلاق">×</button>
            </div>
            <div className="profile-options-list">
              <button type="button" onClick={() => chooseProfileOption(() => onAvatar?.(ad))}>
                <span className="profile-option-icon"><UserPlusIcon size={21} /></span>
                <span><b>عرض الملف الشخصي</b><small>معلومات البائع ومتابعوه</small></span>
                <span className="profile-option-arrow">‹</span>
              </button>
              <button type="button" onClick={() => chooseProfileOption(() => onClick(ad))}>
                <span className="profile-option-icon"><ImageFileIcon size={21} /></span>
                <span><b>عرض المنشور</b><small>تفاصيل هذا الإعلان وصوره</small></span>
                <span className="profile-option-arrow">‹</span>
              </button>
              <button type="button" onClick={() => chooseProfileOption(openStoryOrProfile)}>
                <span className="profile-option-icon"><GridIcon size={21} /></span>
                <span><b>عرض الستوري</b><small>مشاهدة آخر ستوريات البائع</small></span>
                <span className="profile-option-arrow">‹</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="post-head">
        <div className="post-user" onClick={() => onClick(ad)} role="button" tabIndex={0}>
          {sellerAvatar ? (
            <img
              className="post-avatar post-avatar-img"
              src={sellerAvatar}
              alt={seller}
              onClick={avatarClick}
              title="عرض الستوري او البروفايل"
            />
          ) : (
            <span className="post-avatar" onClick={avatarClick} role="button" tabIndex={0} title="خيارات البائع">{icon}</span>
          )}
          <div className="post-user-meta">
            <span className="post-seller">
              {seller}
              {isAdminSeller && <VerifiedIcon size={14} />}
              {isAdminSeller && <span className="post-seller-brand">على <ZonxMark /></span>}
            </span>
            <span className="post-loc"><LocationIcon /> {cityName(ad.city)}</span>
          </div>
        </div>
        <button type="button" className="post-more" onClick={() => setMenuOpen(o => !o)} aria-label="خيارات">
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className="post-menu">
            <button type="button" onClick={share}><ShareIcon size={16} /> مشاركة الاعلان</button>
            <button type="button" onClick={() => { setMenuOpen(false); setToast('تم التبليغ عن الاعلان') }}>⚠️ التبليغ عن الاعلان</button>
          </div>
        )}
      </header>

      <div
        className={'post-media' + (isVideo ? '' : '')}
        onClick={() => onClick(ad)}
        onMouseEnter={hoverPlay}
        onMouseLeave={hoverPause}
        role="button"
        tabIndex={0}
      >
        {okSlides.length > 1 ? (
          <div className="post-carousel" ref={mediaRef} onScroll={onMediaScroll}>
            {okSlides.map(({ s, i }) => s.type === 'video' ? (
              <video key={i} src={s.src} muted controls={false} playsInline preload="metadata" onError={() => onMediaError(i)} />
            ) : (
              <img key={i} className="img-fade" src={s.src} alt={ad.title} loading="lazy" draggable="false" onLoad={onImgLoad} onError={() => onMediaError(i)} />
            ))}
          </div>
        ) : okSlides.length === 1 ? (
          okSlides[0].s.type === 'video' ? (
            <video src={okSlides[0].s.src} muted preload="metadata" controls={false} onError={() => onMediaError(okSlides[0].i)} />
          ) : (
            <img className="img-fade" src={okSlides[0].s.src} alt={ad.title} loading="lazy" onLoad={onImgLoad} onError={() => onMediaError(okSlides[0].i)} />
          )
        ) : (
          <div className="post-placeholder"><span>{icon}</span></div>
        )}
        {ad.featured && <span className="post-featured">مميز</span>}
        {isVideo && <span className="video-badge">فيديو</span>}
        {slides.length > 1 && (
          <>
            <span className="post-count">{Math.min(slide + 1, slides.length)} / {slides.length}</span>
            <div className="post-dots">
              {slides.map((_, i) => <span key={i} className={i === slide ? 'on' : ''} />)}
            </div>
          </>
        )}
      </div>

      <div className="post-actions">
        <div className="post-actions-group">
          <button type="button" className={'action-btn like' + (liked ? ' active' : '')} onClick={toggleLike} aria-label="اعجبني">
            <span ref={popRef} className="pop-wrap"><HeartIcon filled={liked} /></span>
            {likesCount > 0 && <span className="action-count">{likesCount}</span>}
          </button>
          <button type="button" className={'action-btn' + (showComments ? ' active' : '')} onClick={openComments} aria-label="تعليقات">
            <CommentIcon />
            {comments.length > 0 && <span className="action-count">{comments.length}</span>}
          </button>
          <button type="button" className="action-btn" onClick={share} aria-label="مشاركة">
            <ShareIcon />
          </button>
        </div>
        <button type="button" className={'action-btn save' + (saved ? ' active' : '')} onClick={toggleSave} aria-label="حفظ">
          <BookmarkIcon filled={saved} />
        </button>
      </div>

      <div className="post-caption">
        <p className="post-caption-text">
          <b className="post-caption-name">{seller}</b>
           {isAdminSeller && <VerifiedIcon size={11} />}
           {isAdminSeller && <span className="post-caption-brand">على <ZonxMark /></span>}{' '}
          <span className="post-caption-title">{ad.title}</span>
          {(longDesc || expanded) && (
            <>
              {' '}
              {expanded && <span className="post-caption-desc">{ad.description}</span>}
              <button type="button" className="post-more-link" onClick={() => setExpanded(v => !v)}>
                {expanded ? ' اقل' : ' المزيد'}
              </button>
            </>
          )}
          {!expanded && !longDesc && <span className="post-caption-desc"> {ad.description}</span>}
        </p>
        <div className="post-sub-row">
          <span className="post-date">{formatDate(ad.date || (ad.created_at || '').slice(0, 10))}</span>
          <span className="post-price">{formatPrice(ad.price)} <span className="sep">ل.س</span></span>
        </div>
      </div>

      {showComments && (
        <div className="post-comments">
          {shownComments.map(c => (
            <p key={c.id} className="post-comment">
              <b>{c.name}</b> {c.text}
            </p>
          ))}
          {comments.length > 2 && !showAllComments && (
            <button type="button" className="post-more-link" onClick={() => setShowAllComments(true)}>عرض كل التعليقات ({comments.length})</button>
          )}
          <form className="post-comment-form" onSubmit={addComment}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="اضف تعليقا..."
              maxLength={300}
            />
            <button type="submit" disabled={!commentText.trim() || postingComment} aria-label="نشر التعليق"><SendIcon /></button>
          </form>
        </div>
      )}

      {toastMsg && <div className="post-toast">{toastMsg}</div>}
    </article>
  )
}
