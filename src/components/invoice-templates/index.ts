import type { ComponentType } from 'react'
import type { InvoiceTemplateId } from '#/lib/invoice-templates'
import { ClassicTemplate } from './Classic'
import { LedgerTemplate } from './Ledger'
import { MinimalTemplate } from './Minimal'
import { ModernTemplate } from './Modern'
import type { InvoiceTemplateProps } from './types'

export type { BusinessBlock, InvoiceDocData, InvoiceTemplateProps } from './types'

export type InvoiceTemplate = {
  id: InvoiceTemplateId
  name: string
  description: string
  component: ComponentType<InvoiceTemplateProps>
}

/** Order here is the order of the picker in settings. */
export const INVOICE_TEMPLATES: readonly InvoiceTemplate[] = [
  { id: 'classic', name: 'Classic', description: 'Clean and familiar. Works for anything.', component: ClassicTemplate },
  { id: 'modern', name: 'Modern', description: 'Bold colour band up top, roomy layout.', component: ModernTemplate },
  { id: 'minimal', name: 'Minimal', description: 'Hairlines and white space, colour only on the total.', component: MinimalTemplate },
  { id: 'ledger', name: 'Ledger', description: 'Compact table with serif headings, for long itemised bills.', component: LedgerTemplate },
]

export function getInvoiceTemplate(id: InvoiceTemplateId): InvoiceTemplate {
  return INVOICE_TEMPLATES.find((t) => t.id === id) ?? INVOICE_TEMPLATES[0]!
}
