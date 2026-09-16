import { getPostgresPool } from './postgres.js'

export function createDatabaseAdapter(sqlite) {
  const postgres = getPostgresPool()
  const translate = (text) => text.replace(/\?/g, () => `$${++translate.index}`)
  const prepare = (text) => {
    if (!postgres) return text.replace(/STRING_AGG\(([^,()]+),\s*'([^']*)'\)/gi, "GROUP_CONCAT($1, '$2')")
    return text
      .replace(/datetime\('now'(?:,\s*'[^']+')?\)/gi, 'CURRENT_TIMESTAMP')
  }

  return {
    driver: postgres ? 'postgres' : 'sqlite',
    sqlite,
    postgres,
    async query(text, params = []) {
      text = prepare(text)
      if (postgres) {
        translate.index = 0
        return postgres.query(translate(text), params)
      }
      const statement = sqlite.prepare(text)
      const trimmed = text.trim().toUpperCase()
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        return { rows: statement.all(...params), rowCount: undefined }
      }
      const result = statement.run(...params)
      return { rows: [], rowCount: result.changes, changes: result.changes }
    },
    async one(text, params = []) {
      if (postgres) return (await this.query(text, params)).rows[0] || null
      return sqlite.prepare(prepare(text)).get(...params) || null
    },
    async many(text, params = []) {
      return (await this.query(text, params)).rows
    },
    async run(text, params = []) {
      return this.query(text, params)
    },
    async transaction(callback) {
      if (postgres) {
        const client = await postgres.connect()
        const tx = {
          one: (text, params = []) => { translate.index = 0; return client.query(translate(prepare(text)), params).then((r) => r.rows[0] || null) },
          many: (text, params = []) => { translate.index = 0; return client.query(translate(prepare(text)), params).then((r) => r.rows) },
          run: (text, params = []) => { translate.index = 0; return client.query(translate(prepare(text)), params) },
        }
        try {
          await client.query('BEGIN')
          const result = await callback(tx)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      }
      sqlite.exec('BEGIN')
      try {
        const result = await callback(this)
        sqlite.exec('COMMIT')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
}
