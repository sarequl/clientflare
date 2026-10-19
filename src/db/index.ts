import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import * as schema from './schema'

export type Database = ReturnType<typeof createDb>

export function createDb(d1: D1Database = env.DB) {
  return drizzle(d1, { schema })
}

let cached: Database | undefined
/** Request-independent handle. D1 bindings are safe to reuse across requests. */
export function getDb(): Database {
  cached ??= createDb()
  return cached
}

export { schema }
