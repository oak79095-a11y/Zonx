import { DatabaseSync } from 'node:sqlite'
const db=new DatabaseSync(':memory:')
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY
    )
  `)
console.log('ok')