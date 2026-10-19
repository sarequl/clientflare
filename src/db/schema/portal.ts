import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { organization } from './auth'
import { contacts } from './crm'

/** A contact who may sign in to the client portal. Invite-only. */
export const portalAccess = sqliteTable(
  'portal_access',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('portal_access_contact_uidx').on(t.contactId), index('portal_access_workspace_idx').on(t.workspaceId)],
)

/** One-time magic links. Stores a hash of the token, never the token. */
export const portalLinks = sqliteTable(
  'portal_links',
  {
    tokenHash: text('token_hash').primaryKey(),
    accessId: text('access_id')
      .notNull()
      .references(() => portalAccess.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('portal_links_access_idx').on(t.accessId)],
)

export const portalSessions = sqliteTable(
  'portal_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    accessId: text('access_id')
      .notNull()
      .references(() => portalAccess.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('portal_sessions_access_idx').on(t.accessId)],
)

export const portalAccessRelations = relations(portalAccess, ({ one }) => ({
  contact: one(contacts, { fields: [portalAccess.contactId], references: [contacts.id] }),
}))
