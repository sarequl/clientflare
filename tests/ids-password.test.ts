import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newId } from '../src/lib/ids.ts'
import { hashPassword, verifyPassword } from '../src/lib/password.ts'
import { parseCookie, sha256Hex, randomToken } from '../src/lib/tokens.ts'

test('ids are uuid-shaped and time-ordered', () => {
  const a = newId()
  const b = newId()
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.ok(a.slice(0, 12) <= b.slice(0, 12))
})

test('passwords verify only against the right secret', async () => {
  const h = await hashPassword('correct horse battery')
  assert.match(h, /^pbkdf2\$100000\$/)
  assert.equal(await verifyPassword({ hash: h, password: 'correct horse battery' }), true)
  assert.equal(await verifyPassword({ hash: h, password: 'wrong' }), false)
  assert.equal(await verifyPassword({ hash: 'garbage', password: 'x' }), false)
})

test('tokens and cookies', async () => {
  assert.equal(randomToken().length, 64)
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(parseCookie('a=1; cf_portal=tok%3D%3D; b=2', 'cf_portal'), 'tok==')
  assert.equal(parseCookie(null, 'x'), null)
})
