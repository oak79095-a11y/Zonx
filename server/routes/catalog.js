import { Router } from 'express'
import { cacheGet, cacheSet } from '../services/cache.js'

const router = Router()

router.get('/categories', async (req, res, next) => {
 try {
  const cached = cacheGet('catalog:categories')
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
    return res.json(cached)
  }
  const rows = await req.app.locals.database.many('SELECT id,name,icon,description,sort_order FROM categories ORDER BY sort_order')
  cacheSet('catalog:categories', rows, 10 * 60 * 1000)
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  res.json(rows)
 } catch (error) { next(error) }
})

router.get('/cities', async (req, res, next) => {
 try {
  const cached = cacheGet('catalog:cities')
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
    return res.json(cached)
  }
  const rows = await req.app.locals.database.many('SELECT id,name,sort_order FROM cities ORDER BY sort_order')
  cacheSet('catalog:cities', rows, 10 * 60 * 1000)
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  res.json(rows)
 } catch (error) { next(error) }
})

export default router
