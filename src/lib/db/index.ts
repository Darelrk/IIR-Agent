// All DB access goes through src/lib/db/client.ts (shared postgres pool).
// Schema is exported from src/lib/db/schema.ts for migrations and reference.
export * from './schema'
