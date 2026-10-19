import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'

/** Record types that can carry tags, custom fields, activities and files. */
export const RECORD_TYPES = ['contact', 'company', 'deal'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain'),
    website: text('website'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('companies_workspace_name_idx').on(t.workspaceId, t.name)],
)

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    jobTitle: text('job_title'),
    notes: text('notes'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('contacts_workspace_name_idx').on(t.workspaceId, t.lastName, t.firstName),
    index('contacts_workspace_email_idx').on(t.workspaceId, t.email),
    index('contacts_company_idx').on(t.companyId),
  ],
)

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** One of a fixed palette key, e.g. "green". UI maps it to colours. */
    color: text('color').notNull().default('gray'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('tags_workspace_name_uidx').on(t.workspaceId, t.name)],
)

/** Polymorphic tag link. No FK on record_id; cleanup happens in the delete server fns. */
export const taggings = sqliteTable(
  'taggings',
  {
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    recordType: text('record_type', { enum: RECORD_TYPES }).notNull(),
    recordId: text('record_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tagId, t.recordType, t.recordId] }), index('taggings_record_idx').on(t.recordType, t.recordId)],
)

export const FIELD_KINDS = ['text', 'number', 'date', 'select'] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

export const customFields = sqliteTable(
  'custom_fields',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    recordType: text('record_type', { enum: RECORD_TYPES }).notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: FIELD_KINDS }).notNull(),
    /** JSON array of strings for `select`. */
    options: text('options', { mode: 'json' }).$type<string[]>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('custom_fields_workspace_type_name_uidx').on(t.workspaceId, t.recordType, t.name)],
)

/** One value per (field, record). Stored as text; `kind` says how to read it. */
export const fieldValues = sqliteTable(
  'field_values',
  {
    fieldId: text('field_id')
      .notNull()
      .references(() => customFields.id, { onDelete: 'cascade' }),
    recordId: text('record_id').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.fieldId, t.recordId] }), index('field_values_record_idx').on(t.recordId)],
)

export const ACTIVITY_KINDS = ['created', 'updated', 'note', 'call', 'meeting', 'email', 'system'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
/** For `updated`: field → [before, after]. Values are primitives. */
export type ActivityMeta = Record<string, [string | number | null, string | number | null]>

/** Timeline entries on a contact, company or deal. Auto-logged changes and manual notes. */
export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: RECORD_TYPES }).notNull(),
    targetId: text('target_id').notNull(),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    /** Free text for notes/calls/meetings; a short summary for auto-logged entries. */
    body: text('body'),
    /** For `updated`: { field: [before, after] } */
    meta: text('meta', { mode: 'json' }).$type<ActivityMeta>(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Notes the client can read in the portal. */
    sharedToPortal: integer('shared_to_portal', { mode: 'boolean' }).notNull().default(false),
    /** When the call/meeting happened. Defaults to createdAt. */
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('activities_target_idx').on(t.targetType, t.targetId, t.occurredAt)],
)

export const companiesRelations = relations(companies, ({ many, one }) => ({
  contacts: many(contacts),
  owner: one(user, { fields: [companies.ownerUserId], references: [user.id] }),
}))
export const contactsRelations = relations(contacts, ({ one }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  owner: one(user, { fields: [contacts.ownerUserId], references: [user.id] }),
}))
export const taggingsRelations = relations(taggings, ({ one }) => ({
  tag: one(tags, { fields: [taggings.tagId], references: [tags.id] }),
}))
export const fieldValuesRelations = relations(fieldValues, ({ one }) => ({
  field: one(customFields, { fields: [fieldValues.fieldId], references: [customFields.id] }),
}))
export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(user, { fields: [activities.userId], references: [user.id] }),
}))
