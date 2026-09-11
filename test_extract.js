import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
const txt = fs.readFileSync('C:/Users/Hp/Desktop/bayader/server/db.js','utf8')
const matches = [...txt.matchAll(/db\.exec\(`([\s\S]*?)`\)/g)]
console.log('found', matches.length)
for (let i=0;i<matches.length;i++) {
  const sql = matches[i][1]
  console.log('--- block',i,'len',sql.length,'start',JSON.stringify(sql.slice(0,80)))
  const db=new DatabaseSync(':memory:')
  try { db.exec(sql); console.log('block',i,'ok') } catch(e){ console.log('block',i,'fail',e.message) }
}