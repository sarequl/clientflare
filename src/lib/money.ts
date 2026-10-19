/** Minor units per major unit. Everything not listed is 2. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'])
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

export function minorDigits(currency: string): number {
  const c = currency.toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

/** "12.34" + "USD" → 1234. Throws on bad input. */
export function parseMoney(input: string, currency: string): number {
  const digits = minorDigits(currency)
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Invalid amount: ${input}`)
  const [whole, frac = ''] = cleaned.split('.')
  if (frac.length > digits) throw new Error(`Too many decimals for ${currency}`)
  const minor = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, '0') || 0) * Math.sign(Number(whole) || 1)
  if (!Number.isSafeInteger(minor)) throw new Error('Amount out of range')
  return minor
}

export function formatMoney(minor: number, currency: string, locale = 'en-US'): string {
  const digits = minorDigits(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits)
}

/** Split `minor` by a basis-point share, rounding half-up. */
export function shareBp(minor: number, bp: number): number {
  return Math.round((minor * bp) / 10_000)
}
