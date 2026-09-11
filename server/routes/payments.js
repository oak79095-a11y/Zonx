import { Router } from 'express'
import { getDb } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { saveFile, deleteFile, ALLOWED_TYPES, MAX_FILE_SIZE } from '../services/storage.js'
import { receiptUpload, uploadHandler } from '../middleware/upload.js'

const router = Router()

// Manual receipt upload for a pending payment
router.post('/:paymentId/receipt', authenticate, uploadHandler(receiptUpload, (req, res) => {
  const db = getDb()
  const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(req.params.paymentId, req.user.id)
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' })
  if (payment.status !== 'pending') return res.status(400).json({ error: 'الدفعة تم معالجتها بالفعل' })

  const file = req.file
  if (!file) return res.status(400).json({ error: 'يرجى رفع صورة الإيصال' })
   if (!file.mimetype.startsWith('image/') || !ALLOWED_TYPES.has(file.mimetype)) return res.status(400).json({ error: 'يرجى رفع صورة إيصال' })
  if (file.size > MAX_FILE_SIZE) return res.status(400).json({ error: 'الملف كبير جداً' })

  const rel = saveFile(file, 'receipts')
  try {
    db.prepare("UPDATE payments SET receipt_path=?, notes=? WHERE id=?").run(rel, String(req.body?.notes || '').slice(0, 500) || null, req.params.paymentId)
  } catch (error) {
    deleteFile(rel)
    throw error
  }
  res.json({ ok: true, receipt_path: rel })
}))

// List my payments
router.get('/me', authenticate, (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  res.json(rows)
})

export default router
