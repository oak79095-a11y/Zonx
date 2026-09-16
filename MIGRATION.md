# SQLite to PostgreSQL

The PostgreSQL schema is in `server/db/postgres-schema.sql`. When `DATABASE_URL` is
set, the server initializes PostgreSQL and routes use the async database adapter.
Without it, local development continues to use SQLite as a fallback.

## Run

Use Node 22+ (the migration uses `node:sqlite`) and install dependencies:

```sh
npm install
DB_PATH=/path/to/limon-bazaar.db DATABASE_URL=postgres://user:password@host/db npm run db:migrate
```

On Windows PowerShell:

```powershell
$env:DB_PATH = 'C:\path\to\limon-bazaar.db'
$env:DATABASE_URL = 'postgres://user:password@host/db'
npm run db:migrate
```

If `DB_PATH` is omitted, the script uses `server/data/limon-bazaar.db`, matching
the development default in `server/db.js`. The migration creates the schema and
copies tables in dependency order inside one PostgreSQL transaction. It uses
`ON CONFLICT DO NOTHING`, so rerunning it does not delete or overwrite rows.

After migration, set the same `DATABASE_URL` on the running server. The startup
health response reports `drivers.database: "postgres"`. Keep the SQLite file as a
backup until PostgreSQL row counts and the main flows have been verified.
