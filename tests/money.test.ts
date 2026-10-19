import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMoney, formatMoney, shareBp, minorDigits } from '../src/lib/money.ts'

test('parseMoney handles decimals, thousands separators and zero-decimal currencies', () => {
  assert.equal(parseMoney('12.34', 'USD'), 1234)
  assert.equal(parseMoney('1,000', 'USD'), 100000)
  assert.equal(parseMoney('1.5', 'USD'), 150)
  assert.equal(parseMoney('5', 'JPY'), 5)
  assert.equal(parseMoney('1.250', 'KWD'), 1250)
  assert.equal(minorDigits('BHD'), 3)
})

test('parseMoney rejects junk and excess decimals', () => {
  assert.throws(() => parseMoney('1.234', 'USD'))
  assert.throws(() => parseMoney('abc', 'USD'))
  assert.throws(() => parseMoney('', 'USD'))
})

test('formatMoney renders by currency', () => {
  assert.equal(formatMoney(1234, 'USD'), '$12.34')
  assert.equal(formatMoney(500, 'JPY'), '¥500')
})

test('shareBp rounds half up and sums sanely', () => {
  assert.equal(shareBp(100000, 2000), 20000)
  assert.equal(shareBp(1001, 250), 25)
  assert.equal(shareBp(1, 5000), 1)
})
