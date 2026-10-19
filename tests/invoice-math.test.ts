import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTotals } from '../src/lib/invoice-math.ts'

test('line amounts use thousandth quantities', () => {
  const t = computeTotals([{ quantityMilli: 1500, unitMinor: 10000 }], 0)
  assert.deepEqual(t, { lineAmounts: [15000], subtotalMinor: 15000, taxMinor: 0, totalMinor: 15000 })
})

test('tax is applied to the subtotal in basis points', () => {
  const t = computeTotals([{ quantityMilli: 1000, unitMinor: 10000 }, { quantityMilli: 2000, unitMinor: 2550 }], 1000)
  assert.equal(t.subtotalMinor, 15100)
  assert.equal(t.taxMinor, 1510)
  assert.equal(t.totalMinor, 16610)
})

test('fractional cents round once per line', () => {
  const t = computeTotals([{ quantityMilli: 333, unitMinor: 100 }], 0)
  assert.equal(t.lineAmounts[0], 33)
})

test('empty invoice totals zero', () => {
  assert.equal(computeTotals([], 2000).totalMinor, 0)
})
