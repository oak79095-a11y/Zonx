import multer from 'multer'
import { MAX_FILES, MAX_FILE_SIZE } from '../services/storage.js'

const storage = multer.memoryStorage()

// لا قيود على نوع الملف — كل الانواع مقبولة
const limits = { fileSize: MAX_FILE_SIZE }

export const listingUpload = multer({ storage, limits }).array('images', MAX_FILES)
export const singleUpload = multer({ storage, limits }).single('file')
export const storyUpload = multer({ storage, limits }).single('story')
export const receiptUpload = multer({ storage, limits }).single('receipt')

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
