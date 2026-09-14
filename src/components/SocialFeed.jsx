import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, mediaUrl } from '../config.js'
import { toast } from './Toast.jsx'

function Author({ author }) {
  return (
    <div className="social-author">
      {author.avatar
        ? <img src={mediaUrl(author.avatar)} alt={author.name} />
        : <span>{(author.name || 'م').slice(0, 1)}</span>}
      <div>
        <b>{author.name}</b>
        <small>{author.verified ? 'حساب موثق' : 'منشور اجتماعي'}</small>
      </div>
    </div>
  )
}

export default function SocialFeed({ user }) {
  const [posts, setPosts] = useState([])
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [comments, setComments] = useState({})
  const [openComments, setOpenComments] = useState(null)
  const syncingRef = useRef(false)

  const load = useCallback(() => {
    if (document.visibilityState !== 'visible' || syncingRef.current) return
    syncingRef.current = true
    apiFetch('/api/posts/feed?limit=30', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => setPosts(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => { syncingRef.current = false })
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 1000)
    return () => clearInterval(timer)
  }, [load])

  const publish = async (event) => {
    event.preventDefault()
    if ((!content.trim() && !file) || publishing) return
    setPublishing(true)
    try {
      const body = new FormData()
      body.append('content', content.trim())
      if (file) body.append('file', file)
      const response = await apiFetch('/api/posts', {
        method: 'POST',
        credentials: 'include',
        body,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذر نشر المنشور')
      setPosts((current) => [data, ...current])
      setContent('')
      setFile(null)
      toast('تم نشر المنشور', 'success')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setPublishing(false)
    }
  }

  const toggleLike = async (post) => {
    if (!user) return toast('سجل الدخول للتفاعل مع المنشورات', 'info')
    const next = !post.liked
    setPosts((current) => current.map((item) => item.id === post.id
      ? { ...item, liked: next, likes: Math.max(0, item.likes + (next ? 1 : -1)) }
      : item))
    try {
      const response = await apiFetch(`/api/posts/${post.id}/like`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: next }),
      })
      if (!response.ok) throw new Error('like')
    } catch {
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, liked: post.liked, likes: post.likes }
        : item))
    }
  }

  const loadComments = async (postId) => {
    setOpenComments((value) => value === postId ? null : postId)
    if (comments[postId]) return
    const response = await apiFetch(`/api/posts/${postId}/comments`)
    if (response.ok) {
      const rows = await response.json()
      setComments((current) => ({ ...current, [postId]: rows }))
    }
  }

  const share = async (post) => {
    const url = `${window.location.origin}${window.location.pathname}#post-${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: post.author.name, text: post.content, url })
      else await navigator.clipboard.writeText(url)
      await apiFetch(`/api/posts/${post.id}/share`, { method: 'POST', credentials: 'include' })
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, shares: item.shares + 1 } : item))
    } catch {}
  }

  return (
    <section className="social-feed-section">
      <div className="social-feed-head">
        <div>
          <span className="social-kicker">المجتمع</span>
          <h2>ماذا يحدث حولك؟</h2>
        </div>
        <span className="social-live-dot">مباشر</span>
      </div>

      {user && (
        <form className="social-composer" onSubmit={publish}>
          <div className="social-composer-row">
            <div className="social-mini-avatar">{(user.name || 'م').slice(0, 1)}</div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} placeholder="شارك شيئاً مع المجتمع..." />
          </div>
          <div className="social-composer-actions">
            <label className="social-file-button">
              {file ? file.name : 'إضافة صورة أو فيديو'}
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <button type="submit" disabled={publishing || (!content.trim() && !file)}>{publishing ? 'جارٍ النشر...' : 'نشر'}</button>
          </div>
        </form>
      )}

      <div className="social-post-list">
        {posts.map((post) => (
          <article className="social-post" id={`post-${post.id}`} key={post.id}>
            <Author author={post.author} />
            {post.content && <p className="social-post-content">{post.content}</p>}
            {post.media && (post.media_type === 'video'
              ? <video className="social-post-media" src={mediaUrl(post.media)} controls playsInline preload="metadata" />
              : <img className="social-post-media" src={mediaUrl(post.media)} alt="منشور" loading="lazy" />)}
            <div className="social-post-actions">
              <button type="button" className={post.liked ? 'active' : ''} onClick={() => toggleLike(post)}>♥ {post.likes}</button>
              <button type="button" onClick={() => loadComments(post.id)}>تعليقات {post.comments}</button>
              <button type="button" onClick={() => share(post)}>مشاركة {post.shares}</button>
            </div>
            {openComments === post.id && <div className="social-comments">{(comments[post.id] || []).map((comment) => <p key={comment.id}><b>{comment.name}</b> {comment.text}</p>)}</div>}
          </article>
        ))}
      </div>
    </section>
  )
}
