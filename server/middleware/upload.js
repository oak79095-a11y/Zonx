import multer from 'multer'
import { MAX_FILES, MAX_FILE_SIZE, ALLOWED_TYPES } from '../services/storage.js'

const storage = multer.memoryStorage()

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم - يسمح فقط بالصور والفيديو حتى 30ث'))
  }
  cb(null, true)
}

export const listingUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).array('images', MAX_FILES)
export const singleUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).single('file')
export const storyUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).single('story')
export const receiptUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).single('receipt')

export function uploadHandler(middleware, route) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload error' })
      }
      Promise.resolve(route(req, res, next)).catch(next)
    })
  }
}
