export const API_ORIGIN = (import.meta.env.VITE_API_URL || 'https://zonx-1.onrender.com').replace(/\/$/, '')

export function apiUrl(path) {
  return `${API_ORIGIN}${path}`
}
