import { apiUrl } from '../config.js'

export function uploadWithProgress(path, body, { onProgress, credentials = 'include' } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    xhr.withCredentials = credentials === 'include'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || 'تعذر رفع الملف'))
    }
    xhr.onerror = () => reject(new Error('تعذر الاتصال أثناء الرفع'))
    xhr.onabort = () => reject(new Error('تم إلغاء الرفع'))
    xhr.send(body)
  })
}
