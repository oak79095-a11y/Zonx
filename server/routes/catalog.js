import { Router } from 'express'
import { getDb } from '../db.js'

const router = Router()

router.get('/categories', (_req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT id,name,icon,description,sort_order FROM categories ORDER BY sort_order').all()
  res.json(rows)
})

router.get('/cities', (_req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT id,name,sort_order FROM cities ORDER BY sort_order').all()
  res.json(rows)
})

export default router