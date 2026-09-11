import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
const txt = fs.readFileSync('C:/Users/Hp/Desktop/bayader/server/db.js','utf8')
const sql = [...txt.matchAll(/db\.exec\(`([\s\S]*?)`\)/g)][0][1]
const stmts = sql.split(';').map(s=>s.trim()).filter(Boolean)
console.log('stmts', stmts.length)
for (let i=0;i<stmts.length;i++) {
  const s = stmts[i]+';'
  const db=new DatabaseSync(':memory:')
  try { db.exec(s); console.log('stmt',i,'ok',s.slice(0,40).replace(/\n/g,' ')) } catch(e){ console.log('stmt',i,'FAIL',e.message, s.slice(0,120)) }
}