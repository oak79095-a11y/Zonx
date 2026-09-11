import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { v4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export const CHAT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.android.package-archive',
])

export const MAX_FILES = 8
export const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB for video
export const MAX_VIDEO_DURATION_SEC = 30

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.android.package-archive': '.apk',
}

export function makeUploadDir(sub) {
  const dir = path.join(UPLOAD_DIR, sub)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function saveFile(file, sub = 'listings') {
  const dir = makeUploadDir(sub)
  const ext = EXTENSIONS[file.mimetype] || (file.mimetype.startsWith('video') ? '.mp4' : '.bin')
  const filename = `${v4()}${ext}`
  const dest = path.join(dir, filename)
  fs.writeFileSync(dest, file.buffer)
  return `/uploads/${sub}/${filename}`
}

export function deleteFile(relPath) {
  const abs = resolveUploadPath(relPath)
  if (abs && fs.existsSync(abs)) fs.unlinkSync(abs)
}

export function isStoredUploadPath(relPath, sub = null) {
  if (typeof relPath !== 'string' || !relPath.startsWith('/uploads/')) return false
  const abs = resolveUploadPath(relPath)
  if (!abs) return false
  if (sub && !relPath.startsWith(`/uploads/${sub}/`)) return false
  return true
}

function resolveUploadPath(relPath) {
  if (typeof relPath !== 'string' || !relPath.startsWith('/uploads/')) return null
  const relative = relPath.slice('/uploads/'.length)
  const root = path.resolve(UPLOAD_DIR)
  const abs = path.resolve(root, relative)
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null
  return abs
}

export function uploadMiddleware(req, res, next) {
  next()
}
