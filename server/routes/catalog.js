import { Router } from 'express'
import { getDb } from '../db.js'
import { cacheGet, cacheSet } from '../services/cache.js'

const router = Router()

router.get('/categories', (_req, res) => {
  const cached = cacheGet('catalog:categories')
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
    return res.json(cached)
  }
  const db = getDb()
  const rows = db.prepare('SELECT id,name,icon,description,sort_order FROM categories ORDER BY sort_order').all()
  cacheSet('catalog:categories', rows, 10 * 60 * 1000)
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  res.json(rows)
})

router.get('/cities', (_req, res) => {
  const cached = cacheGet('catalog:cities')
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
    return res.json(cached)
  }
  const db = getDb()
  const rows = db.prepare('SELECT id,name,sort_order FROM cities ORDER BY sort_order').all()
  cacheSet('catalog:cities', rows, 10 * 60 * 1000)
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  res.json(rows)
})

export default router
