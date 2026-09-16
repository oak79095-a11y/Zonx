import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'
import { hashPassword } from '../utils/auth.js'

const { Pool } = pg

let pool = null

export function getPostgresPool() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    })
    pool.on('error', (error) => console.error('[postgres] pool error:', error.message))
  }
  return pool
}

export async function verifyPostgres() {
  const client = getPostgresPool()
  if (!client) return { enabled: false, connected: false }
  await client.query('SELECT 1')
  return { enabled: true, connected: true }
}

export async function initPostgres() {
  const client = getPostgresPool()
  if (!client) return false
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'postgres-schema.sql')
  await client.query(fs.readFileSync(schemaPath, 'utf8'))
  await seedPostgres(client)
  return true
}

async function seedPostgres(client) {
  const categories = [
    ['men', 'رجال', 'ملابس، أجهزة كهربائية، سيارات وأكثر', 1],
    ['women', 'نساء', 'موضة، جمال، منزل وأكثر', 2],
    ['kids', 'أطفال', 'ملابس أطفال، ألعاب، مستلزمات', 3],
    ['home', 'عام / منزل', 'أثاث، عقارات، خدمات وأجهزة', 4],
  ]
  const cities = [
    ['damascus', 'دمشق', 1], ['aleppo', 'حلب', 2], ['homs', 'حمص', 3],
    ['latakia', 'اللاذقية', 4], ['hama', 'حماة', 5], ['tartus', 'طرطوس', 6], ['daraa', 'درعا', 7],
  ]
  for (const row of categories) {
    await client.query('INSERT INTO categories(id,name,description,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING', row)
  }
  for (const row of cities) {
    await client.query('INSERT INTO cities(id,name,sort_order) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING', row)
  }
  const settings = [['free_listing_days', '0'], ['featured_fee', '75000'], ['business_monthly', '250000'], ['featured_duration_days', '7']]
  for (const row of settings) {
    await client.query('INSERT INTO admin_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', row)
  }
  await client.query(
    'INSERT INTO users(id,email,phone,password,name,role) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
    ['guest', null, null, hashPassword(crypto.randomBytes(24).toString('hex')), 'زائر', 'user'],
  )
  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminEmail && adminPassword && adminPassword.length >= 6) {
    await client.query(`
      INSERT INTO users(id,email,phone,password,name,role)
      VALUES($1,$2,$3,$4,$5,'admin')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name, role = 'admin'
    `, [uuid(), adminEmail, null, hashPassword(adminPassword), process.env.ADMIN_NAME?.trim() || 'admin'])
  }
}

export async function closePostgres() {
  if (pool) await pool.end()
  pool = null
}
