const attempts = new Map()
export function rateLimit({ windowMs = 15*60*1000, max = 5 } = {}) {
  return (req, res, next) => {
    const key = req.ip + ":" + req.path + ":" + (req.body?.email || req.body?.phone || "request")
    const now = Date.now()
    let rec = attempts.get(key)
    if (!rec || now - rec.start > windowMs) rec = { count: 0, start: now }
    rec.count++
    attempts.set(key, rec)
    if (rec.count > max) return res.status(429).json({ error: "محاولات كثيرة - حاول بعد 15 دقيقة" })
    if (attempts.size > 1000) {
      for (const [k,v] of attempts) if (now - v.start > windowMs) attempts.delete(k)
    }
    next()
  }
}
