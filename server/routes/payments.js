import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { makeId } from '../utils/auth.js'
import { saveFile, deleteFile } from '../services/storage.js'
import { receiptUpload, uploadHandler } from '../middleware/upload.js'

const router = Router()

// Manual receipt upload for a pending payment
router.post('/:paymentId/receipt', authenticate, uploadHandler(receiptUpload, async (req, res) => {
  const db = req.app.locals.database
  const payment = await db.one('SELECT * FROM payments WHERE id = ? AND user_id = ?', [req.params.paymentId, req.user.id])
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' })
  if (payment.status !== 'pending') return res.status(400).json({ error: 'الدفعة تم معالجتها بالفعل' })

  const file = req.file
  if (!file) return res.status(400).json({ error: 'يرجى رفع صورة الإيصال' })
  if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'يرجى رفع صورة إيصال' })

  const rel = saveFile(file, 'receipts')
  try {
    await db.run('UPDATE payments SET receipt_path=?, notes=? WHERE id=?', [rel, String(req.body?.notes || '').slice(0, 500) || null, req.params.paymentId])
  } catch (error) {
    deleteFile(rel)
    throw error
  }
  res.json({ ok: true, receipt_path: rel })
}))

// List my payments
router.get('/me', authenticate, async (req, res) => {
  const db = req.app.locals.database
  const rows = await db.many('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC', [req.user.id])
  res.json(rows)
})

export default router
