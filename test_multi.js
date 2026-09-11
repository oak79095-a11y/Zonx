import { DatabaseSync } from 'node:sqlite'
const db=new DatabaseSync(':memory:')
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY
    )

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY
    )
  `)
  console.log('multi without semicolon ok')
} catch(e){ console.log('fail without semicolon',e.message) }
try {
  const db2=new DatabaseSync(':memory:')
  db2.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY
    );
  `)
  console.log('multi with semicolon ok')
} catch(e){ console.log('fail with semicolon',e.message) }