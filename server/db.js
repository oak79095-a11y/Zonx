import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { v4 } from 'uuid'
import { hashPassword } from './utils/auth.js'
import crypto from 'node:crypto'

function makeGuestPassword() {
  return crypto.randomBytes(24).toString('hex')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'limon-bazaar.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

export function getDb() {
  return db
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      featured INTEGER NOT NULL DEFAULT 0,
      featured_until TEXT,
      expires_at TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_images (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      path TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subscription_id TEXT,
      listing_id TEXT,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      receipt_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS listing_comments (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL DEFAULT 'زائر',
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      media TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      caption TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      actor_id TEXT,
      type TEXT NOT NULL,
      entity_id TEXT,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS story_views (
      story_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (story_id, viewer_id)
    );

    CREATE TABLE IF NOT EXISTS compliance_sessions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_audit (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      conversation_id TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user1_id, user2_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reaction TEXT NOT NULL DEFAULT 'heart',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(message_id, user_id, reaction)
    );

    CREATE TABLE IF NOT EXISTS listing_likes (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(listing_id, actor_key)
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
    CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);
    CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
    CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_id);
    CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(expires_at);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
    CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at);
    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_compliance_sessions_expiry ON compliance_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_compliance_audit_created ON compliance_audit(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_u1 ON conversations(user1_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_u2 ON conversations(user2_id);
    CREATE INDEX IF NOT EXISTS idx_listing_likes_listing ON listing_likes(listing_id);
    CREATE INDEX IF NOT EXISTS idx_listing_images_listing_sort ON listing_images(listing_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_uploads_user_path ON chat_uploads(user_id, path);
  `)

  try { db.exec("ALTER TABLE listings ADD COLUMN phone TEXT") } catch {}
  try { db.exec("ALTER TABLE listings ADD COLUMN likes INTEGER NOT NULL DEFAULT 0") } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT") } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0") } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN media TEXT") } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN media_type TEXT NOT NULL DEFAULT 'text'") } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN media_name TEXT") } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN media_size INTEGER") } catch {}
  try { db.exec("ALTER TABLE listing_comments ADD COLUMN user_id TEXT") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_comments_listing ON listing_comments(listing_id)") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_comments_user ON listing_comments(user_id)") } catch {}

  seed(db)
  return db
}

function seed(db) {
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get()
  if (catCount.c === 0) {
    const categories = [
      { id: 'men', name: 'رجال', description: 'ملابس، أجهزة كهربائية، سيارات وأكثر' },
      { id: 'women', name: 'نساء', description: 'موضة، جمال، منزل وأكثر' },
      { id: 'kids', name: 'أطفال', description: 'ملابس أطفال، ألعاب، مستلزمات' },
      { id: 'home', name: 'عام / منزل', description: 'أثاث، عقارات، خدمات وأجهزة' },
    ]
    const cities = [
      { id: 'damascus', name: 'دمشق' },
      { id: 'aleppo', name: 'حلب' },
      { id: 'homs', name: 'حمص' },
      { id: 'latakia', name: 'اللاذقية' },
      { id: 'hama', name: 'حماة' },
      { id: 'tartus', name: 'طرطوس' },
      { id: 'daraa', name: 'درعا' },
    ]
    const insCat = db.prepare('INSERT INTO categories(id,name,description,sort_order) VALUES(?,?,?,?)')
    const insCity = db.prepare('INSERT INTO cities(id,name,sort_order) VALUES(?,?,?)')
    const insSet = db.prepare('INSERT OR IGNORE INTO admin_settings(key,value) VALUES(?,?)')
    db.exec('BEGIN')
    try {
      categories.forEach((c, i) => insCat.run(c.id, c.name, c.description, i + 1))
      cities.forEach((c, i) => insCity.run(c.id, c.name, i + 1))
      insSet.run('free_listing_days', '15')
      insSet.run('featured_fee', '75000')
      insSet.run('business_monthly', '250000')
      insSet.run('featured_duration_days', '7')
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  const guest = db.prepare("SELECT id FROM users WHERE id = 'guest'").get()
  if (!guest) {
    db.prepare("INSERT INTO users(id,email,phone,password,name,role) VALUES(?,?,?,?,?,?)").run('guest', null, null, hashPassword(makeGuestPassword()), 'زائر', 'user')
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  const adminPassword = process.env.ADMIN_PASSWORD
  // Revoke the bootstrap account used by older versions, regardless of env setup.
  db.prepare("UPDATE users SET role = 'user', password = ? WHERE email = 'admin' AND name = 'omar'")
    .run(hashPassword(makeGuestPassword()))
  if (adminEmail && adminPassword && adminPassword.length >= 6) {
    const configured = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)
    if (configured) {
      db.prepare("UPDATE users SET password = ?, name = ?, role = 'admin' WHERE id = ?")
        .run(hashPassword(adminPassword), process.env.ADMIN_NAME?.trim() || 'admin', configured.id)
    } else {
      db.prepare("INSERT INTO users(id,email,phone,password,name,role) VALUES(?,?,?,?,?,?)")
        .run(v4(), adminEmail, null, hashPassword(adminPassword), process.env.ADMIN_NAME?.trim() || 'admin', 'admin')
    }
  } else {
    // No administrator is created unless explicit credentials are provided.
  }
}
