import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'
import { companies, contacts } from './crm'
import { deals } from './deals'

export const TASK_STATUSES = ['open', 'done'] as const

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueOn: text('due_on'), // YYYY-MM-DD in workspace timezone
    assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'set null' }),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    dealId: text('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('open'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('tasks_workspace_status_due_idx').on(t.workspaceId, t.status, t.dueOn),
    index('tasks_assignee_idx').on(t.assigneeUserId, t.status),
    index('tasks_contact_idx').on(t.contactId),
    index('tasks_deal_idx').on(t.dealId),
  ],
)

/** One reminder digest per user per workspace per day. */
export const taskDigests = sqliteTable(
  'task_digests',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sentOn: text('sent_on').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.sentOn] })],
)

export const FILE_RECORD_TYPES = ['contact', 'company', 'deal', 'invoice'] as const
export type FileRecordType = (typeof FILE_RECORD_TYPES)[number]

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    recordType: text('record_type', { enum: FILE_RECORD_TYPES }).notNull(),
    recordId: text('record_id').notNull(),
    /** R2 object key: <workspaceId>/<fileId>/<name> */
    key: text('key').notNull(),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    contentType: text('content_type').notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Phase 2 portal: visible to the client when true. */
    sharedToPortal: integer('shared_to_portal', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('files_record_idx').on(t.recordType, t.recordId), index('files_workspace_idx').on(t.workspaceId)],
)

export const tasksRelations = relations(tasks, ({ one }) => ({
  assignee: one(user, { fields: [tasks.assigneeUserId], references: [user.id] }),
  contact: one(contacts, { fields: [tasks.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [tasks.companyId], references: [companies.id] }),
  deal: one(deals, { fields: [tasks.dealId], references: [deals.id] }),
}))
export const filesRelations = relations(files, ({ one }) => ({
  uploadedBy: one(user, { fields: [files.uploadedByUserId], references: [user.id] }),
}))
