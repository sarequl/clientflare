export type InvoiceDocData = {
  number: string | null
  status: 'draft' | 'sent' | 'paid' | 'void'
  billTo: string
  currency: string
  issuedOn: string
  dueOn: string | null
  paidOn: string | null
  /** Set when a sent invoice was edited. Templates print "Revised <date>". */
  revisedAt?: Date | string | null
  taxRateBp: number
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  notes: string | null
  footer: string | null
  lines: { id?: string; description: string; quantityMilli: number; unitMinor: number; amountMinor: number }[]
}

/** Business details printed on the invoice, plus the workspace's chosen design. */
export type BusinessBlock = {
  name: string
  address: string | null
  email: string | null
  taxId: string | null
  /** Template id from INVOICE_TEMPLATES. Unknown or missing renders classic. */
  template?: string
  /** '#rrggbb', or null for the template's default. */
  accent?: string | null
}

export type InvoiceTemplateProps = {
  invoice: InvoiceDocData
  business: BusinessBlock
  /** Resolved accent, always a valid '#rrggbb'. Templates set it as `--inv-accent`. */
  accent: string
}
