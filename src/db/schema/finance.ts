import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'

// Money is stored as integers in minor units (cents, paisa). Never floats.

/** Business income, scoped to a workspace. `invoiceId` is wired up in Phase 2. */
export const incomes = sqliteTable(
  'incomes',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Who recorded it. Their set-aside rules produce the allocations. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    receivedOn: text('received_on').notNull(), // ISO date, YYYY-MM-DD
    clientName: text('client_name'),
    source: text('source'), // e.g. "Upwork", "Bank transfer"
    note: text('note'),
    invoiceId: text('invoice_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('incomes_workspace_received_idx').on(t.workspaceId, t.receivedOn),
    index('incomes_user_idx').on(t.userId),
  ],
)

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    spentOn: text('spent_on').notNull(),
    category: text('category'),
    vendor: text('vendor'),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('expenses_workspace_spent_idx').on(t.workspaceId, t.spentOn)],
)

/**
 * Personal set-aside rule: "put X% of every income I record into bucket Y".
 * Owned by a user, not a workspace, so giving/tax buckets stay private.
 */
export const setAsideRules = sqliteTable(
  'set_aside_rules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Basis points: 2000 = 20.00 %. */
    percentBp: integer('percent_bp').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('set_aside_rules_user_idx').on(t.userId)],
)

/** One row per (income, rule) at the time the income was recorded. Snapshot of the percent. */
export const allocations = sqliteTable(
  'allocations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    incomeId: text('income_id')
      .notNull()
      .references(() => incomes.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id')
      .notNull()
      .references(() => setAsideRules.id, { onDelete: 'cascade' }),
    percentBp: integer('percent_bp').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('allocations_rule_idx').on(t.ruleId),
    index('allocations_income_idx').on(t.incomeId),
  ],
)

/** Money actually paid out of a set-aside bucket (tax paid, donation made). */
export const payouts = sqliteTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id')
      .notNull()
      .references(() => setAsideRules.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    paidOn: text('paid_on').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('payouts_rule_idx').on(t.ruleId)],
)

export const incomesRelations = relations(incomes, ({ many }) => ({
  allocations: many(allocations),
}))
export const setAsideRulesRelations = relations(setAsideRules, ({ many }) => ({
  allocations: many(allocations),
  payouts: many(payouts),
}))
export const allocationsRelations = relations(allocations, ({ one }) => ({
  income: one(incomes, { fields: [allocations.incomeId], references: [incomes.id] }),
  rule: one(setAsideRules, { fields: [allocations.ruleId], references: [setAsideRules.id] }),
}))
export const payoutsRelations = relations(payouts, ({ one }) => ({
  rule: one(setAsideRules, { fields: [payouts.ruleId], references: [setAsideRules.id] }),
}))
