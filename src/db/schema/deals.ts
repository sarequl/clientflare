import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'
import { companies, contacts } from './crm'

export const pipelines = sqliteTable(
  'pipelines',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('pipelines_workspace_idx').on(t.workspaceId)],
)

export const STAGE_KINDS = ['open', 'won', 'lost'] as const
export type StageKind = (typeof STAGE_KINDS)[number]

export const stages = sqliteTable(
  'stages',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: STAGE_KINDS }).notNull().default('open'),
    /** 0..100, used for weighted pipeline value. */
    probability: integer('probability').notNull().default(0),
    color: text('color').notNull().default('gray'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('stages_pipeline_idx').on(t.pipelineId, t.sortOrder)],
)

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    stageId: text('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    valueMinor: integer('value_minor').notNull().default(0),
    currency: text('currency').notNull(),
    expectedCloseOn: text('expected_close_on'),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status', { enum: DEAL_STATUSES }).notNull().default('open'),
    lostReason: text('lost_reason'),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    /** Position within its stage column. */
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('deals_workspace_status_idx').on(t.workspaceId, t.status),
    index('deals_stage_idx').on(t.stageId, t.sortOrder),
    index('deals_contact_idx').on(t.contactId),
    index('deals_company_idx').on(t.companyId),
  ],
)

export const pipelinesRelations = relations(pipelines, ({ many }) => ({ stages: many(stages), deals: many(deals) }))
export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [stages.pipelineId], references: [pipelines.id] }),
  deals: many(deals),
}))
export const dealsRelations = relations(deals, ({ one }) => ({
  pipeline: one(pipelines, { fields: [deals.pipelineId], references: [pipelines.id] }),
  stage: one(stages, { fields: [deals.stageId], references: [stages.id] }),
  contact: one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [deals.companyId], references: [companies.id] }),
  owner: one(user, { fields: [deals.ownerUserId], references: [user.id] }),
}))
