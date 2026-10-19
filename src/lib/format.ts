import { z } from 'zod'
import { minorDigits } from '#/lib/money'

export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'INR', 'BDT', 'PKR', 'LKR',
  'AED', 'SAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'TRY', 'ILS', 'ZAR', 'NGN', 'KES', 'EGP', 'BRL', 'MXN',
  'ARS', 'COP', 'PHP', 'IDR', 'MYR', 'THB', 'VND', 'KRW',
] as const

/** Today in the browser's (or server's) local time, YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, 1)))
}

/** "2026-10-03" → "Oct 3" (or "Oct 3, 2025" when not this year). */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  const sameYear = y === new Date().getFullYear()
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatPercentBp(bp: number): string {
  const n = bp / 100
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}%`
}

/** "20" / "12.5" → basis points. Returns null when not a valid 0.01–100 value. */
export function parsePercentToBp(input: string): number | null {
  const s = input.trim().replace(/%$/, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const bp = Math.round(Number(s) * 100)
  if (bp < 1 || bp > 10_000) return null
  return bp
}

/** Best-effort human message from a thrown server-fn error or a Better Auth error object. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error) {
    // Zod validation errors arrive as a JSON array in the message.
    try {
      const parsed = JSON.parse(err.message)
      if (Array.isArray(parsed) && parsed[0]?.message) return String(parsed[0].message)
    } catch {
      /* not JSON */
    }
    return err.message || fallback
  }
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message || fallback
  }
  return fallback
}

/** Only allow same-origin absolute paths as post-login redirects. */
export function safeRedirect(target: string | undefined): string | undefined {
  if (!target) return undefined
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return undefined
  return target
}

export const monthSearchSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
})

export const redirectSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
})

/** 123450 USD → "1234.50" for prefilling an amount input. */
export function minorToInput(minor: number, currency: string): string {
  const d = minorDigits(currency)
  return (minor / 10 ** d).toFixed(d)
}
