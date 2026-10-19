import type { InvoiceDocData } from './types'

/** Stand-in invoice for the template thumbnails in settings. */
export const SAMPLE_INVOICE: InvoiceDocData = {
  number: 'INV-0042',
  status: 'sent',
  billTo: 'Northwind Studio\n18 Harbour Lane\nBristol BS1 4QA',
  currency: 'USD',
  issuedOn: '2026-10-01',
  dueOn: '2026-10-15',
  paidOn: null,
  taxRateBp: 1000,
  subtotalMinor: 482000,
  taxMinor: 48200,
  totalMinor: 530200,
  notes: 'Thanks for the work this month.',
  footer: 'Bank transfer to Acme Bank, account 0012 3456 7890.',
  lines: [
    { id: 'a', description: 'Brand identity refresh', quantityMilli: 1000, unitMinor: 240000, amountMinor: 240000 },
    { id: 'b', description: 'Landing page design and build', quantityMilli: 1000, unitMinor: 180000, amountMinor: 180000 },
    { id: 'c', description: 'Copy edits', quantityMilli: 4000, unitMinor: 15500, amountMinor: 62000 },
  ],
}
