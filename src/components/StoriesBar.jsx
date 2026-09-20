import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { toast } from './Toast.jsx'
import { VerifiedIcon, ZonxMark } from './icons.jsx'
import { apiFetch, mediaUrl } from '../config.js'

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

export default function StoriesBar({ user }) {
  const [stories, setStories] = useState([])
  const [viewerIndex, setViewerIndex] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [menuUserId, setMenuUserId] = useState(null)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const timerRef = useRef(null)
  const syncRef = useRef(false)

  const load = useCallback(() => {
    if (document.visibilityState !== 'visible' || syncRef.current) return
    syncRef.current = true
    apiFetch('/api/stories', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setStories(Array.isArray(rows) ? rows.map((story) => ({ ...story, media: mediaUrl(story.media), user_avatar: mediaUrl(story.user_avatar) })) : []))
      .catch(() => {})
      .finally(() => { syncRef.current = false })
  }, [])

  useEffect(() => {
    if (!user) return undefined
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load, user])

  // تجميع ستوريات كل مستخدم في بوكس واحد (الأحدث أولاً)
  const groups = useMemo(() => {
    const map = new Map()
    for (const s of stories) {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, {
           user_id: s.user_id,
           user_name: s.user_name,
           user_email: s.user_email,
           user_avatar: mediaUrl(s.user_avatar),
           mine: s.mine,
           thumb: s.media_type === 'video' ? null : mediaUrl(s.media),
          items: [],
        })
      } else if (s.media_type !== 'video') {
        const g = map.get(s.user_id)
        if (!g.thumb) g.thumb = s.media
      }
      map.get(s.user_id).items.push(s)
    }
    return Array.from(map.values())
  }, [stories])

  // قائمة مرتبة: ستوريات كل مستخدم متتالية
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const openGroup = (gi) => {
    const g = groups[gi]
    if (!g) return
    const idx = ordered.findIndex((s) => s.id === g.items[0].id)
    if (idx >= 0) setViewerIndex(idx)
  }

  // فتح ستوريات بائع عند الضغط على صورته في الاعلانات
  useEffect(() => {
    const onReq = (ev) => {
      const { reqId, sellerId } = ev.detail || {}
      const gi = groups.findIndex((g) => sellerId && g.user_id === sellerId)
      if (gi >= 0) {
        openGroup(gi)
        window.dispatchEvent(new CustomEvent('seller-story-response', { detail: { reqId, handled: true } }))
      } else {
        window.dispatchEvent(new CustomEvent('seller-story-response', { detail: { reqId, handled: false } }))
      }
    }
    window.addEventListener('seller-story-request', onReq)
    return () => window.removeEventListener('seller-story-request', onReq)
  }, [groups, ordered])

  // تبديل تلقائي للستوري التالي (صور 5 ثوان / فيديو عند نهايته)
  const goNext = useCallback(() => {
    setViewerIndex((i) => (i === null ? null : (i + 1 < ordered.length ? i + 1 : null)))
  }, [ordered.length])

  const goPrev = useCallback(() => {
    setViewerIndex((i) => (i === null || i === 0 ? i : i - 1))
  }, [])

  useEffect(() => {
    if (viewerIndex === null) return
    const s = ordered[viewerIndex]
    if (!s) return
    apiFetch(`/api/stories/${s.id}/view`, { method: 'POST', credentials: 'include' }).catch(() => {})
    if (s.media_type === 'video') return // الفيديو يتقدم عند الانتهاء
    timerRef.current = setTimeout(goNext, 5000)
    return () => clearTimeout(timerRef.current)
  }, [viewerIndex, ordered, goNext])

  useEffect(() => {
    if (viewerIndex === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setViewerIndex(null)
      if (e.key === 'ArrowLeft') goNext()
      if (e.key === 'ArrowRight') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerIndex, goNext, goPrev])

  const addStory = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setError('')
    setUploading(true)
    let skipped = 0
    try {
      for (const f of files) {
        const isVideo = f.type.startsWith('video/')
        if (!f.type.startsWith('image/') && !isVideo) { skipped++; continue }
        const fd = new FormData()
        fd.append('story', f)
        const r = await apiFetch('/api/stories', { method: 'POST', body: fd, credentials: 'include' })
        if (!r.ok) skipped++
      }
      if (skipped) setError(`تم تجاهل ${skipped} ملف (صور وفيديو فقط)`)
      if (files.length > skipped) toast('تم نشر الستوري ✓', 'success')
      load()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally { setUploading(false) }
  }

  const deleteStory = async (id) => {
    try {
      await apiFetch(`/api/stories/${id}`, { method: 'DELETE', credentials: 'include' })
      setMenuUserId(null)
      setViewerIndex(null)
      toast('تم حذف الستوري', 'info')
      load()
    } catch {}
  }

  if (!user) return null

  const viewerStory = viewerIndex !== null ? ordered[viewerIndex] : null
  const myName = user.name || 'انت'

  return (
    <section className="stories-section">
      <div className="container">
        <div className="stories-bar">
          <label className="story-tile story-add" title="اضف ستوري">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={addStory} disabled={uploading} />
            <span className="story-add-avatar">
              {user.avatar ? <img src={user.avatar} alt={myName} /> : '＋'}
              <b className="story-add-plus">＋</b>
            </span>
            <span className="story-add-text">{uploading ? 'جاري الرفع...' : 'اضف ستوري'}</span>
          </label>
          {groups.map((g, gi) => (
            <div key={g.user_id} className="story-item-wrap">
              <button type="button" className={'story-tile story-item' + (g.thumb ? ' has-thumb' : '')} onClick={() => openGroup(gi)}>
                {g.thumb ? <span className="story-thumb"><img src={g.thumb} alt="" /><span className="story-thumb-shade" /></span> : null}
                <span className={'story-avatar' + (g.mine ? ' mine' : '')}>
                  {g.user_avatar ? <img src={g.user_avatar} alt={g.user_name} /> : <b>{(g.user_name || '؟').slice(0, 1)}</b>}
                </span>
                <span className="story-name">
                   {g.mine ? 'ستوريك' : g.user_name}
                   {g.user_email === 'oak79095@gmail.com' ? <VerifiedIcon size={10} /> : null}
                </span>
                {g.items.length > 1 && <span className="story-count">{g.items.length}</span>}
              </button>
              {g.mine && (
                <button type="button" className="story-del" title="حذف الستوريات" onClick={() => setMenuUserId(g.user_id)}>✕</button>
              )}
              {menuUserId === g.user_id && (
                <div className="story-menu">
                  <button type="button" onClick={() => g.items.forEach((s) => deleteStory(s.id))}>حذف كل ستورياتي</button>
                  <button type="button" onClick={() => setMenuUserId(null)}>الغاء</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {error && <p className="form-error" style={{marginTop:'6px'}}>{error}</p>}
      </div>

      {viewerStory && (
        <div className="story-viewer" onClick={() => setViewerIndex(null)}>
          <div className="story-viewer-box" onClick={(e) => e.stopPropagation()}>
            <div className="story-progress">
              {ordered.map((_, i) => (
                <span key={i} className={'story-bar' + (i < viewerIndex ? ' done' : i === viewerIndex ? ' active' : '')} />
              ))}
            </div>
            <div className="story-viewer-head">
              <span className="story-viewer-avatar">
                {viewerStory.user_avatar ? <img src={viewerStory.user_avatar} alt="" /> : <b>{(viewerStory.user_name || '؟').slice(0, 1)}</b>}
              </span>
              <span className="story-viewer-name">
                 {viewerStory.mine ? 'ستوريك' : viewerStory.user_name}
                 {viewerStory.user_email === 'oak79095@gmail.com' ? <VerifiedIcon size={14} /> : null}
                 {viewerStory.user_email === 'oak79095@gmail.com' ? <span className="story-viewer-brand">على <ZonxMark /></span> : null}
              </span>
              <span className="story-viewer-time">{formatStoryTime(viewerStory.created_at)}</span>
              {viewerStory.mine && (
                <button type="button" className="story-del" title="حذف هذا الستوري" onClick={() => deleteStory(viewerStory.id)}>✕</button>
              )}
              <button type="button" className="story-close" onClick={() => setViewerIndex(null)} aria-label="اغلاق">✕</button>
            </div>
            <div className="story-viewer-media">
              {viewerStory.media_type === 'video' ? (
                <video
                  ref={videoRef}
                  src={viewerStory.media}
                  autoPlay
                  playsInline
                  controls={viewerStory.mine}
                  onEnded={goNext}
                />
              ) : (
                <img src={viewerStory.media} alt="ستوري" />
              )}
              {viewerStory.caption && <p className="story-caption">{viewerStory.caption}</p>}
            </div>
            <button type="button" className="story-nav prev" aria-label="السابق" onClick={goPrev}>‹</button>
            <button type="button" className="story-nav next" aria-label="التالي" onClick={goNext}>›</button>
          </div>
        </div>
      )}
    </section>
  )
}

function formatStoryTime(iso) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (diffSec < 60) return 'منذ لحظات'
  const mins = Math.floor(diffSec / 60)
  if (mins < 60) return `منذ ${mins} س`
  const h = Math.floor(mins / 60)
  if (h < 24) return `منذ ${h} س`
  const days = Math.floor(h / 24)
  return `منذ ${days} ي`
}
