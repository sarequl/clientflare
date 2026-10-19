import { relations } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'
import { companies, contacts } from './crm'
import { deals } from './deals'
import { incomes } from './finance'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Display number, e.g. INV-0007. Assigned when the invoice leaves draft. */
    number: text('number'),
    status: text('status', { enum: INVOICE_STATUSES }).notNull().default('draft'),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    dealId: text('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    /** Snapshot of who it is billed to, so edits to the contact don't rewrite sent invoices. */
    billTo: text('bill_to').notNull().default(''),
    currency: text('currency').notNull(),
    issuedOn: text('issued_on').notNull(),
    dueOn: text('due_on'),
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull().default(0),
    notes: text('notes'),
    footer: text('footer'),
    /** Unguessable token for the public view link. */
    publicToken: text('public_token').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    paidOn: text('paid_on'),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
    incomeId: text('income_id').references(() => incomes.id, { onDelete: 'set null' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('invoices_workspace_status_idx').on(t.workspaceId, t.status, t.dueOn),
    uniqueIndex('invoices_public_token_uidx').on(t.publicToken),
    index('invoices_contact_idx').on(t.contactId),
    index('invoices_company_idx').on(t.companyId),
  ],
)

export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    /** Quantity in thousandths: 1500 = 1.5 */
    quantityMilli: integer('quantity_milli').notNull().default(1000),
    unitMinor: integer('unit_minor').notNull().default(0),
    amountMinor: integer('amount_minor').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('invoice_lines_invoice_idx').on(t.invoiceId, t.sortOrder)],
)

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  lines: many(invoiceLines),
  contact: one(contacts, { fields: [invoices.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  deal: one(deals, { fields: [invoices.dealId], references: [deals.id] }),
  income: one(incomes, { fields: [invoices.incomeId], references: [incomes.id] }),
}))
export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
}))
