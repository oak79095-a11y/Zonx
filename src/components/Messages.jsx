import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from './Toast.jsx'
import { API_ORIGIN, ICE_SERVERS, apiFetch, mediaUrl } from '../config.js'
import {
  ArrowBackIcon, VerifiedIcon, SendIcon, PaperclipIcon, MicIcon,
  PhoneIcon, VideoCamIcon, FileIcon, XIcon, ImageFileIcon, PhoneOffIcon,
  HeartIcon, ShareIcon,
} from './icons.jsx'

function timeOf(at) {
  try {
    const d = new Date(String(at).replace(' ', 'T') + 'Z')
    return d.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function dayOf(at) {
  try {
    const d = new Date(String(at).replace(' ', 'T') + 'Z')
    return d.toLocaleDateString('ar-SY', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch { return '' }
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n > 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

function Avatar({ name, avatar, size = 44 }) {
  if (avatar) return <img className="msg-avatar" style={{ width: size, height: size }} src={mediaUrl(avatar)} alt={name} />
  return (
    <span className="msg-avatar empty" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || '؟').trim().charAt(0)}
    </span>
  )
}

function audioTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function VoiceMessage({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  const syncDuration = (audio) => {
    const next = Number(audio.duration)
    if (Number.isFinite(next) && next > 0) setDuration(next)
  }

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  const seek = (event) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * duration
  }

  return (
    <div className="msg-voice">
      <button type="button" className="msg-voice-play" onClick={toggle} aria-label={playing ? 'إيقاف الصوت' : 'تشغيل الصوت'}>
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="msg-voice-main">
        <button type="button" className="msg-voice-track" onClick={seek} aria-label="تقدم الصوت">
          <span className="msg-voice-fill" style={{ width: `${progress}%` }} />
          <span className="msg-voice-wave">••••••••••••••••••••</span>
        </button>
        <span className="msg-voice-time">{duration > 0 ? audioTime(current || duration) : '--:--'}</span>
      </div>
      <span className="msg-voice-icon" aria-hidden="true">)))</span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
        onDurationChange={(event) => syncDuration(event.currentTarget)}
        onCanPlay={(event) => syncDuration(event.currentTarget)}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          setCurrent(audio.currentTime)
          setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0) }}
      />
    </div>
  )
}

const MEDIA_PREVIEW = { image: '📷 صورة', video: '🎬 فيديو', audio: '🎙️ رسالة صوتية', file: '📎 ملف' }

export default function Messages({ user, initialPeer, onBack, onRequireAuth }) {
  const [convs, setConvs] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState(null)
  const [chat, setChat] = useState(null)
  const [text, setText] = useState('')
  const [conn, setConn] = useState(false)
  const [typing, setTyping] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [recSec, setRecSec] = useState(null)
  const [sending, setSending] = useState(false)
  const [call, setCall] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)
  const [reactionBusy, setReactionBusy] = useState(null)

  const wsRef = useRef(null)
  const activeRef = useRef(null)
  const bottomRef = useRef(null)
  const typingTimer = useRef(null)
  const peerRef = useRef(null)
  const fileImgRef = useRef(null)
  const fileDocRef = useRef(null)
  const recRef = useRef({ recorder: null, chunks: [], timer: null })

  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const localVideoRef = useRef(null)
  const pendingOffer = useRef(null)
  const pendingIce = useRef([])
  const callRef = useRef(null)
  const syncingRef = useRef(false)
  const convsSyncingRef = useRef(false)

  activeRef.current = active
  callRef.current = call

  const loadConvs = useCallback(() => {
    if (!user || document.visibilityState !== 'visible' || convsSyncingRef.current) return
    convsSyncingRef.current = true
    apiFetch('/api/messages/conversations', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { setConvs(Array.isArray(rows) ? rows : []); setLoaded(true) })
      .catch(() => setLoaded(true))
      .finally(() => { convsSyncingRef.current = false })
  }, [user])

  const syncActiveChat = useCallback(async () => {
    const userId = activeRef.current
    if (!userId || syncingRef.current) return
    syncingRef.current = true
    try {
      const response = await apiFetch(`/api/messages/with/${userId}`, { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      setChat((current) => {
        if (!current || current.user.id !== userId || !data?.user) return current
        const known = new Map((current.messages || []).map((message) => [message.id, message]))
        for (const message of data.messages || []) known.set(message.id, message)
        return { ...current, user: data.user, messages: [...known.values()] }
      })
    } catch {
      // The WebSocket remains the primary realtime channel.
    } finally {
      syncingRef.current = false
    }
  }, [])

  const applyUnread = useCallback((userId) => {
    setConvs((list) => list.map((c) => (c.user.id === userId ? { ...c, unread: 0 } : c)))
  }, [])

  // ---------- WebRTC ----------
  const wsSend = (obj) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
  }

  const cleanupCall = () => {
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()) } catch {}
    try { pcRef.current?.close() } catch {}
    pcRef.current = null
    localStreamRef.current = null
    pendingOffer.current = null
    pendingIce.current = []
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    setCall(null)
  }

  const createPc = (peerId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: 'call-ice', to: peerId, candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0]
        remoteAudioRef.current.play().catch(() => {})
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall((c) => c ? { ...c, status: 'active' } : c)
      } else if (['failed', 'disconnected'].includes(pc.connectionState)) {
        toast('تعذر تثبيت اتصال المكالمة', 'error')
      }
    }
    return pc
  }

  const flushIce = (pc) => {
    for (const c of pendingIce.current) {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
    pendingIce.current = []
  }

  const startCall = async (kind) => {
    if (!active || callRef.current) return
    const peer = peerRef.current || chat?.user || { id: active, name: 'مستخدم' }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
      localStreamRef.current = stream
      setCall({ kind, peer, incoming: false, status: 'calling' })
      setTimeout(() => { if (localVideoRef.current) localVideoRef.current.srcObject = stream }, 60)
      const pc = createPc(peer.id)
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      wsSend({ type: 'call', to: active, kind, sdp: pc.localDescription.sdp, from_name: user.name, from_avatar: user.avatar })
    } catch {
      toast('تعذر الوصول للميكروفون أو الكاميرا', 'error')
      cleanupCall()
    }
  }

  const acceptCall = async () => {
    const c = callRef.current
    if (!c?.peer?.id) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: c.kind === 'video' })
      localStreamRef.current = stream
      setCall({ ...c, incoming: false, status: 'active' })
      setTimeout(() => { if (localVideoRef.current) localVideoRef.current.srcObject = stream }, 50)
      const pc = createPc(c.peer.id)
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      if (pendingOffer.current) {
        await pc.setRemoteDescription({ type: 'offer', sdp: pendingOffer.current })
        pendingOffer.current = null
      }
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      wsSend({ type: 'call-answer', to: c.peer.id, sdp: pc.localDescription.sdp })
      flushIce(pc)
    } catch {
      wsSend({ type: 'call-reject', to: c.peer.id })
      cleanupCall()
    }
  }

  const endCall = () => {
    const c = callRef.current
    if (c?.peer?.id) wsSend({ type: 'call-end', to: c.peer.id })
    cleanupCall()
  }

  const rejectCall = () => {
    const c = callRef.current
    if (c?.peer?.id) wsSend({ type: 'call-reject', to: c.peer.id })
    cleanupCall()
  }

  // ---------- تسجيل الصوت ----------
  const toggleRecord = async () => {
    if (recRef.current.recorder) {
      try { recRef.current.recorder.stop() } catch {}
      return
    }
    if (!active) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recRef.current = { recorder: rec, chunks: [], timer: null }
      rec.ondataavailable = (e) => { if (e.data.size) recRef.current.chunks.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(recRef.current.timer)
        setRecSec(null)
        const blob = new Blob(recRef.current.chunks, { type: recRef.current.chunks[0]?.type || 'audio/webm' })
        recRef.current = { recorder: null, chunks: [], timer: null }
        if (blob.size > 1500) {
          const name = `صوت-${Date.now()}.webm`
          await uploadAndSend(new File([blob], name, { type: blob.type }), 'audio')
        }
      }
      rec.start()
      setRecSec(0)
      recRef.current.timer = setInterval(() => setRecSec((s) => (s || 0) + 1), 1000)
    } catch {
      toast('تعذر الوصول للميكروفون', 'error')
    }
  }

  const uploadAndSend = async (file, kindOverride = null) => {
    if (!active) return
    setSending(true)
    const tmpId = 'tmp-' + Math.random().toString(36).slice(2)
    const localUrl = URL.createObjectURL(file)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await apiFetch('/api/messages/upload', { method: 'POST', body: fd, credentials: 'include' })
      const d = await up.json()
      if (!up.ok) throw new Error(d?.error || 'فشل الرفع')
      const at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      setChat((c) => c ? {
        ...c,
        messages: [...c.messages, {
          id: tmpId, from: 'me', text: '', media: localUrl,
          media_type: d.kind || kindOverride || 'file', media_name: d.name, media_size: d.size, at,
        }],
      } : c)
      setConvs((list) => {
        const idx = list.findIndex((c) => c.user.id === activeRef.current)
        if (idx === -1) return list
        const item = { ...list[idx], last_text: '', last_media_type: d.kind, last_at: at, unread: 0 }
        const next = [...list]
        next.splice(idx, 1)
        return [item, ...next]
      })
      const ws = wsRef.current
      const payload = {
        type: 'msg', to: active, text: '', media: d.path,
        media_type: d.kind, media_name: d.name, media_size: d.size,
        from_name: user.name, from_avatar: user.avatar,
      }
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload))
      else {
        apiFetch(`/api/messages/with/${active}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        }).catch(() => toast('تعذر الارسال', 'error'))
      }
    } catch (e) {
      toast(e.message || 'تعذر ارسال الملف', 'error')
    } finally {
      setSending(false)
    }
  }

  const onPickMedia = (e, forceKind = null) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) uploadAndSend(file, forceKind)
    setAttachOpen(false)
  }

  // ---------- اتصال WS ----------
  useEffect(() => {
    if (!user) return
    let closed = false
    let retry = null
    const connect = () => {
      if (closed) return
      const ws = new WebSocket(`${API_ORIGIN.replace(/^http/, 'ws')}/ws`)
      wsRef.current = ws
      ws.onopen = () => setConn(true)
      ws.onclose = () => {
        setConn(false)
        if (!closed) retry = setTimeout(connect, 3000)
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onmessage = (ev) => {
        let data
        try { data = JSON.parse(ev.data) } catch { return }
        if (data.type === 'msg') {
          const from = data.from || {}
          if (from.id === activeRef.current) {
            setChat((c) => c && c.user.id === from.id ? {
              ...c,
              messages: [...c.messages, {
                id: data.id, from: 'them', text: data.text,
                media: mediaUrl(data.media), media_type: data.media_type,
                media_name: data.media_name, media_size: data.media_size, at: data.at,
              }],
            } : c)
            if (document.hasFocus()) ws.send(JSON.stringify({ type: 'read', conversation_id: data.conversation_id }))
          } else {
            setConvs((list) => {
              const idx = list.findIndex((c) => c.user.id === from.id)
              if (idx === -1) {
                return [{ id: data.conversation_id, user: from, last_text: data.text, last_media_type: data.media_type, last_at: data.at, unread: 1 }, ...list]
              }
                const item = { ...list[idx], last_text: data.text, last_media_type: data.media_type, last_at: data.at, unread: (list[idx].unread || 0) + 1 }
              const next = [...list]
              next.splice(idx, 1)
              return [item, ...next]
            })
          }
        } else if (data.type === 'reaction') {
          setChat((c) => c ? {
            ...c,
            messages: c.messages.map((m) => m.id === data.message_id ? { ...m, reactions: data.reactions || 0 } : m),
          } : c)
        } else if (data.type === 'message-deleted') {
          setChat((c) => c ? { ...c, messages: c.messages.filter((m) => m.id !== data.message_id) } : c)
        } else if (data.type === 'read') {
          setChat((c) => c && c.user.id === data.by ? {
            ...c,
            messages: c.messages.map((m) => (m.from === 'me' ? { ...m, read_at: data.read_at || '1' } : m)),
          } : c)
        } else if (data.type === 'typing') {
          if (data.from === activeRef.current) {
            setTyping(true)
            clearTimeout(typingTimer.current)
            typingTimer.current = setTimeout(() => setTyping(false), 2500)
          }
        } else if (data.type === 'call') {
          if (callRef.current) {
            wsSend({ type: 'call-reject', to: data.from })
            return
          }
          pendingOffer.current = data.sdp
          pendingIce.current = []
          setCall({
            kind: data.kind || 'audio',
            peer: { id: data.from, name: data.from_name || 'مكالمة', avatar: data.from_avatar || null },
            incoming: true,
            status: 'ringing',
          })
        } else if (data.type === 'call-answer') {
          if (data.sdp && pcRef.current) {
            pcRef.current.setRemoteDescription({ type: 'answer', sdp: data.sdp })
              .then(() => flushIce(pcRef.current))
              .catch(() => {})
            setCall((c) => c ? { ...c, status: 'active' } : c)
          } else if (!data.sdp) {
            toast('تم رفض المكالمة', 'info')
            cleanupCall()
          }
        } else if (data.type === 'call-ice') {
          if (data.candidate) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {})
            } else {
              pendingIce.current.push(data.candidate)
            }
          }
        } else if (data.type === 'call-end') {
          toast('انتهت المكالمة', 'info')
          cleanupCall()
        } else if (data.type === 'call-reject') {
          toast('تم رفض المكالمة', 'info')
          cleanupCall()
        }
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      clearTimeout(typingTimer.current)
      try { wsRef.current?.close() } catch {}
      try { localStreamRef.current?.getTracks().forEach((t) => t.stop()) } catch {}
      try { pcRef.current?.close() } catch {}
    }
  }, [user])

  useEffect(() => { loadConvs() }, [loadConvs])

  // Fallback synchronization for missed WebSocket events and new conversations.
  useEffect(() => {
    if (!user) return undefined
    const timer = setInterval(() => {
      loadConvs()
      syncActiveChat()
    }, 5000)
    return () => clearInterval(timer)
  }, [user, loadConvs, syncActiveChat])

  const openChat = async (userId, peer = null) => {
    if (peer) peerRef.current = peer
    setActive(userId)
    setChat(null)
    setTyping(false)
    applyUnread(userId)
    const fallbackUser = peer || peerRef.current || { id: userId, name: 'مستخدم', avatar: null }
    try {
      const d = await apiFetch(`/api/messages/with/${userId}`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null)
      if (d && d.user) {
        peerRef.current = d.user
        setChat(d)
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
      } else {
        setChat({ user: fallbackUser, messages: [] })
      }
      apiFetch(`/api/messages/with/${userId}/read`, { method: 'POST', credentials: 'include' }).catch(() => {})
    } catch {
      setChat({ user: fallbackUser, messages: [] })
      toast('تعذر الاتصال بالخادم - تحقق من تشغيل السيرفر', 'error')
    }
  }

  useEffect(() => {
    if (initialPeer?.id && user && loaded) openChat(initialPeer.id, initialPeer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPeer?.id, user, loaded])

  useEffect(() => {
    if (chat) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }, [chat?.messages.length, call])

  const send = (e) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || !active) return
    setText('')
    const at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const tmpId = 'tmp-' + Math.random().toString(36).slice(2)
    setChat((c) => c ? { ...c, messages: [...c.messages, { id: tmpId, from: 'me', text: t, media_type: 'text', at }] } : c)
    setConvs((list) => {
      const idx = list.findIndex((c) => c.user.id === activeRef.current)
      if (idx === -1) return list
      const item = { ...list[idx], last_text: t, last_media_type: 'text', last_at: at, unread: 0 }
      const next = [...list]
      next.splice(idx, 1)
      return [item, ...next]
    })
    const ws = wsRef.current
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'msg', to: active, text: t, from_name: user.name, from_avatar: user.avatar }))
    } else {
      apiFetch(`/api/messages/with/${active}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: t }),
      }).catch(() => toast('تعذر الارسال - جرب مرة اخرى', 'error'))
    }
  }

  const toggleReaction = async (message) => {
    if (reactionBusy) return
    const nextReacted = !message.reacted
    setReactionBusy(message.id)
    setChat((c) => c ? {
      ...c,
      messages: c.messages.map((m) => m.id === message.id
        ? { ...m, reacted: nextReacted, reactions: Math.max(0, (m.reactions || 0) + (nextReacted ? 1 : -1)) }
        : m),
    } : c)
    try {
      const r = await apiFetch(`/api/messages/${message.id}/reaction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ reaction: 'heart' }),
      })
      if (!r.ok) throw new Error('reaction')
      const data = await r.json()
      setChat((c) => c ? { ...c, messages: c.messages.map((m) => m.id === message.id ? { ...m, reacted: data.reacted, reactions: data.reactions } : m) } : c)
    } catch {
      setChat((c) => c ? { ...c, messages: c.messages.map((m) => m.id === message.id ? { ...m, reacted: message.reacted, reactions: message.reactions } : m) } : c)
    } finally { setReactionBusy(null) }
  }

  const shareMessage = async (message) => {
    const value = message.media ? new URL(message.media, window.location.origin).href : message.text
    try {
      if (navigator.share) await navigator.share({ text: message.text || 'وسائط من الدردشة', url: message.media ? value : undefined })
      else await navigator.clipboard.writeText(value || '')
      toast('تم تجهيز المشاركة', 'success')
    } catch {}
    setActionMessage(null)
  }

  const forwardMessage = (message) => {
    setText(message.text || (message.media ? 'وسائط معاد توجيهها' : ''))
    setActionMessage(null)
    toast('تم تجهيز الرسالة لإعادة التوجيه', 'info')
  }

  const deleteMessage = async (message) => {
    if (message.from !== 'me') return
    const r = await apiFetch(`/api/messages/${message.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)
    if (!r?.ok) { toast('تعذر حذف الرسالة', 'error'); return }
    setChat((c) => c ? { ...c, messages: c.messages.filter((m) => m.id !== message.id) } : c)
    setActionMessage(null)
  }

  const onType = () => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1 && active) {
      ws.send(JSON.stringify({ type: 'typing', to: active, on: true }))
    }
  }

  useEffect(() => {
    if (!attachOpen) return
    const close = () => setAttachOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [attachOpen])

  if (!user) {
    return (
      <section className="section msg-section">
        <div className="container">
          <div className="empty-state fade-in">
            <span className="empty-icon" aria-hidden="true">💬</span>
            <h3>المراسلات متاحة للمسجلين فقط</h3>
            <p>سجل الدخول لتتواصل مع البائعين والمشترين</p>
            <button type="button" className="btn btn-primary" onClick={onRequireAuth}>تسجيل الدخول</button>
          </div>
        </div>
      </section>
    )
  }

  const activeUser = chat?.user || convs.find((c) => c.user.id === active)?.user

  return (
    <section className="section msg-section">
      <div className="container">
        <div className="msg-page fade-in">
          {/* قائمة المحادثات */}
          <aside className={'msg-list' + (active ? ' chat-open' : '')}>
            <div className="msg-list-head">
              <h2>الرسائل</h2>
              <span className={'msg-conn' + (conn ? ' on' : '')} title={conn ? 'متصل' : 'جاري الاتصال...'}><i /></span>
            </div>
            {!loaded ? (
              <div className="msg-skel">
                {[0, 1, 2].map((i) => <div key={i} className="msg-skel-row"><span className="skel-media" /><span className="skel-line w60" /></div>)}
              </div>
            ) : convs.length === 0 ? (
               <div className="msg-empty">
                 <span className="msg-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <path d="M8 9.5h8M8 12.5h5" opacity="0.6" />
                   </svg>
                 </span>
                 <b>لا توجد محادثات بعد</b>
                 <small>ابدأ محادثة من صفحة أحد المستخدمين</small>
               </div>
            ) : (
              <div className="msg-items">
                {convs.map((c) => (
                  <button
                    key={c.user.id}
                    type="button"
                    className={'msg-item' + (active === c.user.id ? ' on' : '')}
                    onClick={() => openChat(c.user.id, c.user)}
                  >
                    <Avatar name={c.user.name} avatar={c.user.avatar} size={46} />
                    <span className="msg-item-body">
                      <span className="msg-item-top">
                        <b className="msg-item-name">{c.user.name}</b>
                        <span className="msg-item-time">{c.last_at ? timeOf(c.last_at) : ''}</span>
                      </span>
                      <span className="msg-item-bottom">
                        <span className={'msg-item-preview' + (c.unread ? ' unread' : '')}>
                          {c.last_text || MEDIA_PREVIEW[c.last_media_type] || 'ابدأ المحادثة'}
                        </span>
                        {c.unread > 0 && <span className="msg-badge">{c.unread > 9 ? '+9' : c.unread}</span>}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* نافذة الدردشة */}
          <main className={'msg-chat' + (active ? ' open' : '')}>
            {!active || !activeUser ? (
              <div className="msg-chat-empty">
                <span className="msg-empty-icon big">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <path d="M8 9.5h8M8 12.5h5" opacity="0.6" />
                  </svg>
                </span>
                <p>اختر محادثة للبدء</p>
              </div>
            ) : (
              <>
                <header className="msg-chat-head">
                  <button type="button" className="msg-back" onClick={() => { setActive(null); setChat(null) }} aria-label="رجوع">
                    <ArrowBackIcon size={18} />
                  </button>
                  <Avatar name={activeUser.name} avatar={activeUser.avatar} size={38} />
                  <div className="msg-chat-user">
                    <b>{activeUser.name}</b>
                    <span className={'msg-status' + (conn && !typing ? ' on' : '')}>
                      {typing ? 'يكتب الان...' : <i />}
                    </span>
                  </div>
                  {activeUser.email === 'oak79095@gmail.com' ? <VerifiedIcon size={15} /> : null}
                  <button type="button" className="msg-call-btn" onClick={() => startCall('audio')} title="مكالمة صوتية" aria-label="مكالمة صوتية">
                    <PhoneIcon size={16} />
                  </button>
                  <button type="button" className="msg-call-btn video" onClick={() => startCall('video')} title="مكالمة فيديو" aria-label="مكالمة فيديو">
                    <VideoCamIcon size={17} />
                  </button>
                </header>

                <div className="msg-chat-scroll">
                  {(chat?.messages || []).map((m, i, arr) => {
                    const prev = arr[i - 1]
                    const showDay = !prev || dayOf(prev.at) !== dayOf(m.at)
                    const hasMedia = m.media && m.media_type && m.media_type !== 'text'
                    return (
                      <div key={m.id}>
                        {showDay && <div className="msg-day">{dayOf(m.at)}</div>}
                        <div className={'msg-row ' + m.from}>
                          <div
                            className={'msg-bubble media' + (hasMedia ? ' is-media' : '') + (m.media_type === 'audio' ? ' is-voice' : '') + (m.media_type === 'image' ? ' is-image' : '') + (m.media_type === 'video' ? ' is-video' : '')}
                            onContextMenu={(event) => { event.preventDefault(); setActionMessage(m.id) }}
                          >
                            {m.media_type === 'image' && m.media && (
                              <a className="msg-media-img" href={mediaUrl(m.media)} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); setActionMessage(m.id) }}>
                                <img src={mediaUrl(m.media)} alt="" />
                              </a>
                            )}
                            {m.media_type === 'video' && m.media && (
                              <video className="msg-media-video" src={mediaUrl(m.media)} controls preload="metadata" onClick={(event) => { event.preventDefault(); setActionMessage(m.id) }} />
                            )}
                            {m.media_type === 'audio' && m.media && (
                              <VoiceMessage src={mediaUrl(m.media)} />
                            )}
                            {m.media_type === 'file' && m.media && (
                              <a className="msg-file" href={mediaUrl(m.media)} download={m.media_name || ''}>
                                <span className="msg-file-ic"><FileIcon size={18} /></span>
                                <span className="msg-file-info">
                                  <b>{m.media_name || 'ملف'}</b>
                                  <small>{fmtSize(m.media_size)}</small>
                                </span>
                              </a>
                            )}
                            {hasMedia && (
                              <button type="button" className="msg-media-more" onClick={() => setActionMessage(actionMessage === m.id ? null : m.id)} aria-label="خيارات الوسائط">•••</button>
                            )}
                            {m.text ? <span className="msg-text">{m.text}</span> : null}
                            <span className="msg-meta">
                              <span className="msg-time">{timeOf(m.at)}</span>
                              {m.from === 'me' ? (
                                <span className={'msg-ticks' + (m.read_at ? ' read' : '')}>{m.read_at ? '✓✓' : '✓'}</span>
                              ) : null}
                            </span>
                            {m.reactions > 0 && <span className="msg-reaction-badge"><HeartIcon size={12} filled /> {m.reactions}</span>}
                            {actionMessage === m.id && (
                              <div className="msg-action-menu" onClick={(event) => event.stopPropagation()}>
                                <button type="button" onClick={() => toggleReaction(m)}><HeartIcon size={15} filled={m.reacted} /> {m.reacted ? 'إزالة الإعجاب' : 'إعجاب'}</button>
                                <button type="button" onClick={() => shareMessage(m)}><ShareIcon size={15} /> مشاركة</button>
                                <button type="button" onClick={() => forwardMessage(m)}>↗ إعادة توجيه</button>
                                {m.from === 'me' && <button type="button" className="danger" onClick={() => deleteMessage(m)}>حذف الرسالة</button>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {typing && (
                    <div className="msg-row them"><div className="msg-bubble typing"><span /><span /><span /></div></div>
                  )}
                  <div ref={bottomRef} />
                </div>

                <form className="msg-input" onSubmit={send}>
                  <div className="msg-attach-wrap" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="msg-attach" onClick={() => setAttachOpen((o) => !o)} title="مرفقات" aria-label="مرفقات">
                      <PaperclipIcon size={19} />
                    </button>
                    {attachOpen && (
                      <div className="msg-attach-menu">
                        <button type="button" onClick={() => fileImgRef.current?.click()}>
                          <ImageFileIcon size={17} /> صورة / فيديو
                        </button>
                        <button type="button" onClick={() => fileDocRef.current?.click()}>
                          <FileIcon size={17} /> ملف
                        </button>
                      </div>
                    )}
                  </div>
                  <button type="button" className="msg-image-btn" onClick={() => fileImgRef.current?.click()} title="رفع صورة أو فيديو" aria-label="رفع صورة أو فيديو">
                    <ImageFileIcon size={17} />
                  </button>
                  <input
                    value={text}
                    onChange={(e) => { setText(e.target.value); onType() }}
                    placeholder={recSec != null ? 'جاري تسجيل الصوت...' : 'اكتب رسالة...'}
                    maxLength={1000}
                  />
                  {text.trim() ? (
                    <button type="submit" aria-label="ارسال" className="msg-send"><SendIcon size={18} /></button>
                  ) : (
                    <button type="button" onClick={toggleRecord} aria-label="تسجيل صوتي" className={'msg-send mic' + (recSec != null ? ' recording' : '')} title={recSec != null ? `ارسال (${recSec} ثانية)` : 'تسجيل صوتي'}>
                      {recSec != null ? <span className="rec-sec">{recSec}</span> : <MicIcon size={19} />}
                    </button>
                  )}
                  <input ref={fileImgRef} type="file" accept="image/*,video/*" hidden onChange={(e) => onPickMedia(e)} />
                  <input ref={fileDocRef} type="file" hidden onChange={(e) => onPickMedia(e, 'file')} />
                </form>
              </>
            )}
          </main>
        </div>
      </div>

      {/* شاشة المكالمة */}
      {call && (
        <div className={'call-overlay' + (call.kind === 'video' ? ' video' : '')}>
          <div className="call-card">
            <div className="call-peer">
              <Avatar name={call.peer.name} avatar={call.peer.avatar} size={110} />
              <b>{call.peer.name}</b>
              <span className="call-status">
                {call.status === 'calling' ? 'جاري الاتصال...'
                  : call.status === 'ringing' ? 'مكالمة واردة...'
                  : call.kind === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية'}
              </span>
            </div>
            {call.kind === 'video' && !call.incoming && (
              <>
                <video ref={remoteVideoRef} className="call-remote" autoPlay playsInline />
                <video ref={localVideoRef} className="call-local" autoPlay playsInline muted />
              </>
            )}
            {call.kind === 'audio' && !call.incoming && (
              <audio ref={remoteAudioRef} autoPlay playsInline />
            )}
            <div className="call-actions">
              {call.incoming ? (
                <>
                  <button type="button" className="call-btn accept" onClick={acceptCall} aria-label="قبول">
                    <PhoneIcon size={22} />
                  </button>
                  <button type="button" className="call-btn end" onClick={rejectCall} aria-label="رفض">
                    <PhoneOffIcon size={22} />
                  </button>
                </>
              ) : (
                <button type="button" className="call-btn end" onClick={endCall} aria-label="إنهاء">
                  <PhoneOffIcon size={22} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
