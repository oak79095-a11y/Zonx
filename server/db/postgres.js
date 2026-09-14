import pg from 'pg'

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

export async function closePostgres() {
  if (pool) await pool.end()
  pool = null
}
