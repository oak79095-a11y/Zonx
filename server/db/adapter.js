import { getPostgresPool } from './postgres.js'

// A small boundary for the migration. Existing synchronous SQLite routes remain
// untouched until each route is migrated to async parameterized queries.
export function createDatabaseAdapter(sqlite) {
  const postgres = getPostgresPool()

  return {
    driver: postgres ? 'postgres' : 'sqlite',
    sqlite,
    postgres,
    async query(text, params = []) {
      if (!postgres) throw new Error('PostgreSQL is not configured')
      return postgres.query(text, params)
    },
  }
}
