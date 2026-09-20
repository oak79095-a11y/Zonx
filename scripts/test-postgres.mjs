import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
})

const requiredTables = ['users', 'messages', 'payments']
const testUserId = `postgres-test-${randomUUID()}`
const testEmail = `${testUserId}@example.invalid`

try {
  const client = await pool.connect()
  try {
    const connection = await client.query('SELECT current_database() AS database, current_user AS user, NOW() AS server_time')
    console.log('Connection: OK')
    console.log(`Database: ${connection.rows[0].database}`)
    console.log(`User: ${connection.rows[0].user}`)
    console.log(`Server time: ${connection.rows[0].server_time.toISOString()}`)

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [requiredTables])
    const found = new Set(tables.rows.map((row) => row.table_name))
    const missing = requiredTables.filter((table) => !found.has(table))
    if (missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`)
    console.log(`Tables: OK (${requiredTables.join(', ')})`)

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users(id, email, password, name, role)
       VALUES($1, $2, $3, $4, $5)`,
      [testUserId, testEmail, 'postgres-test-only', 'PostgreSQL Test User', 'user'],
    )
    const result = await client.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [testUserId],
    )
    if (result.rows.length !== 1 || result.rows[0].email !== testEmail) {
      throw new Error('Insert/read verification failed')
    }
    console.log('Insert: OK')
    console.log('Read: OK')
    await client.query('ROLLBACK')
    console.log('Cleanup: OK (transaction rolled back)')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  console.log('PostgreSQL test: PASSED')
} catch (error) {
  console.error(`PostgreSQL test: FAILED\n${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
