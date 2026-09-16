import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlitePath = process.env.DB_PATH || path.join(root, 'server', 'data', 'limon-bazaar.db')
const schemaPath = path.join(root, 'server', 'db', 'postgres-schema.sql')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}
if (!fs.existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found: ${sqlitePath}`)
}

const tables = [
  ['users', ['id', 'email', 'phone', 'password', 'name', 'role', 'created_at', 'avatar', 'verified']],
  ['categories', ['id', 'name', 'icon', 'description', 'sort_order']],
  ['cities', ['id', 'name', 'sort_order']],
  ['listings', ['id', 'user_id', 'title', 'description', 'price', 'category_id', 'city_id', 'status', 'featured', 'featured_until', 'expires_at', 'views', 'created_at', 'updated_at', 'phone', 'likes']],
  ['listing_images', ['id', 'listing_id', 'path', 'sort_order', 'created_at']],
  ['subscriptions', ['id', 'user_id', 'plan', 'status', 'starts_at', 'ends_at', 'created_at']],
  ['payments', ['id', 'user_id', 'subscription_id', 'listing_id', 'amount', 'method', 'receipt_path', 'status', 'notes', 'created_at']],
  ['admin_settings', ['key', 'value']],
  ['listing_comments', ['id', 'listing_id', 'user_id', 'name', 'text', 'created_at']],
  ['stories', ['id', 'user_id', 'media', 'media_type', 'caption', 'views', 'created_at']],
  ['follows', ['id', 'follower_id', 'following_id', 'created_at']],
  ['friend_requests', ['id', 'sender_id', 'recipient_id', 'status', 'created_at', 'updated_at']],
  ['notifications', ['id', 'recipient_id', 'actor_id', 'type', 'entity_id', 'message', 'read_at', 'created_at']],
  ['story_views', ['story_id', 'viewer_id', 'created_at']],
  ['compliance_sessions', ['id', 'admin_id', 'conversation_id', 'reason', 'expires_at', 'created_at']],
  ['compliance_audit', ['id', 'admin_id', 'action', 'conversation_id', 'reason', 'created_at']],
  ['conversations', ['id', 'user1_id', 'user2_id', 'last_message_at', 'created_at']],
  ['messages', ['id', 'conversation_id', 'sender_id', 'text', 'read_at', 'created_at', 'media', 'media_type', 'media_name', 'media_size']],
  ['chat_uploads', ['id', 'user_id', 'path', 'media_type', 'created_at']],
  ['message_reactions', ['id', 'message_id', 'user_id', 'reaction', 'created_at']],
  ['listing_likes', ['id', 'listing_id', 'actor_key', 'created_at']],
  ['posts', ['id', 'user_id', 'content', 'media', 'media_type', 'visibility', 'share_count', 'created_at', 'updated_at', 'media_public_id', 'media_provider']],
  ['post_likes', ['id', 'post_id', 'user_id', 'created_at']],
  ['post_comments', ['id', 'post_id', 'user_id', 'text', 'created_at']],
]

const booleanColumns = new Set(['verified', 'featured'])
const timestampColumns = new Set([
  'created_at', 'updated_at', 'featured_until', 'expires_at', 'starts_at', 'ends_at',
  'read_at', 'last_message_at', 'expires_at',
])

function valueFor(column, value) {
  if (value === undefined) return null
  if (booleanColumns.has(column)) {
    return value === true || value === 1 || value === '1' || value === 'true'
  }
  if (timestampColumns.has(column) && typeof value === 'string') {
    // SQLite datetime('now') is UTC but has no zone suffix.
    if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)) {
      return `${value.replace(' ', 'T')}Z`
    }
  }
  return value
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true })
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})
const client = await pool.connect()

try {
  await client.query('BEGIN')
  await client.query(fs.readFileSync(schemaPath, 'utf8'))

  const counts = []
  for (const [table, columns] of tables) {
    const available = new Set(
      sqlite.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name),
    )
    const sourceColumns = columns.filter((column) => available.has(column))
    if (sourceColumns.length === 0) continue
    const rows = sqlite.prepare(`SELECT ${sourceColumns.join(', ')} FROM ${table}`).all()
    if (rows.length === 0) continue

    const placeholders = sourceColumns.map((_, index) => `$${index + 1}`).join(', ')
    const query = `INSERT INTO ${table} (${sourceColumns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`
    for (const row of rows) {
      await client.query(query, sourceColumns.map((column) => valueFor(column, row[column])))
    }
    counts.push(`${table}=${rows.length}`)
  }

  await client.query('COMMIT')
  console.log(`Migrated ${counts.join(', ') || 'no rows'}`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  client.release()
  await pool.end()
  sqlite.close()
}
