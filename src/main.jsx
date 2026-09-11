import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API_ORIGIN } from './config.js'

const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  if (typeof input === 'string' && /^\/(api|uploads)\//.test(input)) {
    return nativeFetch(`${API_ORIGIN}${input}`, init)
  }
  return nativeFetch(input, init)
}

const savedTheme = localStorage.getItem('bazaar-theme')
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
