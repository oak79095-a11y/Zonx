import { useEffect, useState } from 'react'

let listeners = []
let seq = 0
let toastsEnabled = true

export function setToastsEnabled(v) {
  toastsEnabled = Boolean(v)
}

export function toast(message, kind = 'info') {
  if (!toastsEnabled) return
  const t = { id: ++seq, message, kind }
  listeners.forEach((l) => l(t))
}

export default function Toasts() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const on = (t) => {
      setItems((p) => [...p.slice(-2), t])
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 2600)
    }
    listeners.push(on)
    return () => { listeners = listeners.filter((l) => l !== on) }
  }, [])
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <span className="toast-icon">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
    </div>
  )
}
