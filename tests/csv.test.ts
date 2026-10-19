import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, toCsv } from '../src/lib/csv.ts'

test('parseCsv handles quotes, embedded commas, newlines and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y","line1\nline2"\r\n"she said ""hi""",,\n')
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'line1\nline2'],
    ['she said "hi"', '', ''],
  ])
})

test('parseCsv strips a BOM and skips blank lines', () => {
  assert.deepEqual(parseCsv('﻿a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']])
})

test('toCsv round-trips through parseCsv', () => {
  const rows = [['Jane', 'x, y', 'say "hi"\nnow']]
  assert.deepEqual(parseCsv(toCsv(['a', 'b', 'c'], rows)), [['a', 'b', 'c'], ...rows])
})
