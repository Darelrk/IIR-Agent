import postgres from 'postgres'

let _sql: postgres.Sql | null = null

/**
 * Singleton postgres connection pool.
 *
 * Tuning notes:
 *  - `max: 5` is conservative for Supabase free tier (which has tight
 *    per-IP connection budgets). Bumping above 10 commonly triggers
 *    "EDBHANDLEREXITED" / dropped connections under bursty writes.
 *  - When DATABASE_URL points at Supabase's pooler (pgbouncer in transaction
 *    mode, default port 6543 or hostname containing "pooler"), prepared
 *    statements must be disabled because pgbouncer cannot route them across
 *    pooled backends safely.
 *
 * Do not call `.end()` — the pool is process-managed.
 */
export function getSql(): postgres.Sql {
  if (_sql) return _sql

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL tidak ditemukan')

  const isPooler = url.includes('pooler.supabase') || url.includes(':6543')

  _sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !isPooler,
  })
  return _sql
}
