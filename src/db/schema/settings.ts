import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth'

/** Per-workspace settings. Workspaces are Better Auth organizations. */
export const workspaceSettings = sqliteTable('workspace_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  // Invoicing. Shown on invoices and used for numbering.
  businessName: text('business_name'),
  businessAddress: text('business_address'),
  businessEmail: text('business_email'),
  taxId: text('tax_id'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV-'),
  nextInvoiceNumber: integer('next_invoice_number').notNull().default(1),
  defaultTaxRateBp: integer('default_tax_rate_bp').notNull().default(0),
  defaultPaymentTermsDays: integer('default_payment_terms_days').notNull().default(14),
  invoiceFooter: text('invoice_footer'),
  /** Invoice design id, see INVOICE_TEMPLATES. Unknown ids render as classic. */
  invoiceTemplate: text('invoice_template').notNull().default('classic'),
  /** Accent colour for the invoice template, '#rrggbb'. Null uses the template default. */
  invoiceAccent: text('invoice_accent'),
  /** Last origin the app was opened from. Cron emails link here when APP_URL is unset. */
  appOrigin: text('app_origin'),
  /** Set when the first-run wizard finishes (or is skipped). */
  setupCompletedAt: integer('setup_completed_at', { mode: 'timestamp_ms' }),
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
