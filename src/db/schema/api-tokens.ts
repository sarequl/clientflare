import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'

/**
 * Personal API tokens for the MCP endpoint. Each token acts as its owner inside
 * one workspace. Only a SHA-256 of the token is stored.
 */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** First characters of the token, so the list is recognisable. */
    tokenPrefix: text('token_prefix').notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('api_tokens_user_idx').on(t.userId, t.workspaceId)],
)
