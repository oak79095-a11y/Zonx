export const FALLBACK_MEDIA = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f3f4f6"/><path d="M270 245l55-60 45 48 35-35 75 80H220z" fill="#d1d5db"/><circle cx="350" cy="145" r="28" fill="#c4cbd4"/><text x="320" y="350" text-anchor="middle" fill="#8b95a5" font-family="Arial" font-size="22">ZONX</text></svg>'
)

export function fallbackMedia(event) {
  const image = event.currentTarget
  if (image.src === FALLBACK_MEDIA) return
  image.onerror = null
  image.src = FALLBACK_MEDIA
}
