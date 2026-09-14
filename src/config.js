const configuredApi = import.meta.env.VITE_API_URL
const isGithubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')
export const API_ORIGIN = (configuredApi ?? (isGithubPages ? 'https://zonx-1.onrender.com' : '')).replace(/\/$/, '')

export function apiUrl(path) {
  return `${API_ORIGIN}${path}`
}

export function mediaUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) return value
  return value.startsWith('/') ? `${API_ORIGIN}${value}` : value
}
