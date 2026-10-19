/** Pure invoice arithmetic, shared by server and UI. Quantities are thousandths, money is minor units. */
export function computeTotals(lines: { quantityMilli: number; unitMinor: number }[], taxRateBp: number) {
  const lineAmounts = lines.map((l) => Math.round((l.quantityMilli * l.unitMinor) / 1000))
  const subtotalMinor = lineAmounts.reduce((a, b) => a + b, 0)
  const taxMinor = Math.round((subtotalMinor * taxRateBp) / 10_000)
  return { lineAmounts, subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor }
}
