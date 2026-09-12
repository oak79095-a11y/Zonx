// Dependency-injection bridge to the WebSocket layer.
// ws.js registers its sender here at startup, letting services push events
// without importing ws.js (which would create an import cycle).
let sender = null

export function registerPushSender(fn) {
  sender = fn
}

export function pushToUser(userId, payload) {
  if (!sender || !userId) return
  try { sender(userId, typeof payload === 'string' ? payload : JSON.stringify(payload)) } catch {}
}
