import { useEffect, useRef } from 'react'
import { API_ORIGIN } from '../config.js'

// اتصال WebSocket عام واحد لكل مستخدم مسجل.
// يستقبل دفعات الخادم ويبثها كأحداث نافذة:
//   'ws-notification' -> { unread }   (شارة الإشعارات، بديل الاستطلاع)
//   'ws-message'      -> رسالة واردة  (شارة الرسائل)
// يعيد الاتصال تلقائياً بتراجع تدريجي، ويبقى الاستطلاع البطيء كاحتياط.
export function useGlobalWs(userId) {
  const wsRef = useRef(null)

  useEffect(() => {
    if (!userId) return undefined
    let closed = false
    let retry = 0
    let timer = null

    const connect = () => {
      if (closed) return
      const ws = new WebSocket(`${API_ORIGIN.replace(/^http/, 'ws')}/ws`)
      wsRef.current = ws
      ws.onopen = () => { retry = 0 }
      ws.onmessage = (ev) => {
        let data
        try { data = JSON.parse(ev.data) } catch { return }
        if (data.type === 'notification') {
          window.dispatchEvent(new CustomEvent('ws-notification', { detail: { unread: data.unread } }))
        } else if (data.type === 'msg') {
          window.dispatchEvent(new CustomEvent('ws-message', { detail: data }))
        }
      }
      ws.onclose = () => {
        wsRef.current = null
        if (closed) return
        retry = Math.min(retry + 1, 5)
        timer = setTimeout(connect, 1000 * retry)
      }
      ws.onerror = () => { try { ws.close() } catch {} }
    }

    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      try { wsRef.current?.close() } catch {}
      wsRef.current = null
    }
  }, [userId])

  return wsRef
}
