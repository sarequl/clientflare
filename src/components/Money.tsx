import { formatMoney } from '#/lib/money'

export function Money({ minor, currency, sign, className = '' }: { minor: number; currency: string; sign?: '+' | '-'; className?: string }) {
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      {sign === '-' ? '−' : sign === '+' ? '+' : ''}
      {formatMoney(minor, currency)}
    </span>
  )
}
