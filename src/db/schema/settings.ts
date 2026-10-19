import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'

/** Per-workspace settings. Workspaces are Better Auth organizations. */
export const workspaceSettings = sqliteTable('workspace_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Per-user settings. Personal finance (set-asides, payouts) uses this currency. */
export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('USD'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
