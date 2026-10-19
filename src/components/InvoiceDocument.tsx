import { useEffect } from 'react'
import { resolveAccent, resolveTemplateId } from '#/lib/invoice-templates'
import { getInvoiceTemplate } from './invoice-templates'
import type { BusinessBlock, InvoiceDocData } from './invoice-templates/types'

export type { BusinessBlock, InvoiceDocData } from './invoice-templates/types'

/**
 * The invoice as a printable sheet, in the workspace's chosen template.
 * Always light, whatever the app theme: this is the thing that becomes a PDF
 * via the browser's print dialog. `template`/`accent` override the business
 * block's (the settings preview uses this).
 */
export function InvoiceDocument({ invoice, business, template, accent }: { invoice: InvoiceDocData; business: BusinessBlock; template?: string; accent?: string | null }) {
  const id = resolveTemplateId(template ?? business.template)
  const Template = getInvoiceTemplate(id).component
  return <Template invoice={invoice} business={business} accent={resolveAccent(id, accent !== undefined ? accent : business.accent)} />
}

/** Opens the print dialog once the page has painted, when `?print=1` asked for it. */
export function useAutoPrint(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [enabled])
}
