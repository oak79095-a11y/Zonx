import fs from 'node:fs'
const txt = fs.readFileSync('C:/Users/Hp/Desktop/bayader/server/db.js','utf8')
const m = [...txt.matchAll(/db\.exec\(`([\s\S]*?)`\)/g)][0]
const sql = m[1]
console.log([...Buffer.from(sql.slice(0,20)).values()].map(b=>b.toString(16).padStart(2,'0')).join(' '))
console.log(JSON.stringify(sql.slice(0,100)))