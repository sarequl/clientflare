/**
 * Invoice template ids and their default accent colours. Pure, so the server
 * validator and the UI share one list. The React components live in
 * src/components/invoice-templates.
 */
export const INVOICE_TEMPLATE_IDS = ['classic', 'modern', 'minimal', 'ledger'] as const
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number]

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = 'classic'

export const TEMPLATE_DEFAULT_ACCENT: Record<InvoiceTemplateId, string> = {
  classic: '#0a0a0a',
  modern: '#2563eb',
  minimal: '#171717',
  ledger: '#7f1d1d',
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function isInvoiceTemplateId(v: unknown): v is InvoiceTemplateId {
  return typeof v === 'string' && (INVOICE_TEMPLATE_IDS as readonly string[]).includes(v)
}

/** Unknown or missing ids fall back to classic. */
export function resolveTemplateId(v: string | null | undefined): InvoiceTemplateId {
  return isInvoiceTemplateId(v) ? v : DEFAULT_INVOICE_TEMPLATE
}

/** The accent to paint with: the saved one when valid, else the template's default. */
export function resolveAccent(template: InvoiceTemplateId, accent: string | null | undefined): string {
  return accent && HEX_COLOR.test(accent) ? accent.toLowerCase() : TEMPLATE_DEFAULT_ACCENT[template]
}

/** White or near-black, whichever reads better on `hex`. WCAG relative luminance. */
export function textOnAccent(hex: string): '#ffffff' | '#0a0a0a' {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
  // Contrast vs white: 1.05 / (l + 0.05). Vs black: (l + 0.05) / 0.05. Pick the larger.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#0a0a0a'
}
