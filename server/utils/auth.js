import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'

function getDevelopmentSecret() {
  const dataDirectory = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
  const secretPath = path.join(dataDirectory, '.jwt-secret')
  try {
    const saved = fs.readFileSync(secretPath, 'utf8').trim()
    if (saved.length >= 32) return saved
  } catch {}

  const generated = crypto.randomBytes(32).toString('hex')
  fs.mkdirSync(path.dirname(secretPath), { recursive: true })
  try {
    fs.writeFileSync(secretPath, `${generated}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return generated
  } catch {
    try {
      const saved = fs.readFileSync(secretPath, 'utf8').trim()
      if (saved.length >= 32) return saved
    } catch {}
    return generated
  }
}

// Persist the development key so restarting the server does not invalidate sessions.
export const JWT_SECRET = process.env.JWT_SECRET || getDevelopmentSecret()

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  const expected = Buffer.from(hash)
  const actual = Buffer.from(derived)
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export function makeId() {
  return crypto.randomBytes(12).toString('hex')
}

