/**
 * Seed a demo user with a workspace full of realistic data, so you can see the
 * CRM the way it looks after six months of use.
 *
 *   pnpm seed:demo                          # nabil@gmail.com / demo1234, local D1
 *   pnpm seed:demo -- --email you@x.com --password secret
 *   pnpm seed:demo -- --remote              # against the deployed D1 (asks for confirmation)
 *
 * What it does:
 *  - creates the user + password if the email is unknown (existing users keep their password
 *    unless --password is given)
 *  - picks the user's first owned workspace, or creates "Demo Studio"
 *  - WIPES that workspace's business data (contacts, companies, deals, tasks, invoices,
 *    incomes, expenses, tags, custom fields, activities) and the user's set-aside rules
 *  - inserts ~20 companies, ~45 contacts, ~30 deals across every stage, ~40 tasks,
 *    ~25 invoices in every status, 6 months of income/expenses, set-aside buckets, tags,
 *    custom fields and a timeline on every record
 *
 * Pure Node: builds one SQL file and hands it to `wrangler d1 execute`, so nothing here
 * imports the app. Password hashing matches src/lib/password.ts (PBKDF2, WebCrypto).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const EMAIL = flag('email') ?? 'nabil@gmail.com'
const PASSWORD = flag('password')
const REMOTE = argv.includes('--remote')
const NAME = flag('name') ?? 'Nabil'
const WORKSPACE_NAME = flag('workspace') ?? 'Demo Studio'
const CUR = 'USD'
const TZ = 'Asia/Dhaka'

// ── helpers ────────────────────────────────────────────────────────────────
let seed = 42
const rand = () => {
  // deterministic so re-runs look the same
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
const chance = (p: number) => rand() < p

const DAY = 86_400_000
const now = Date.now()
const daysAgo = (d: number) => now - d * DAY
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const today = iso(now)

function newId(at = Date.now()): string {
  const t = BigInt(at)
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[0] = Number((t >> 40n) & 0xffn)
  b[1] = Number((t >> 32n) & 0xffn)
  b[2] = Number((t >> 24n) & 0xffn)
  b[3] = Number((t >> 16n) & 0xffn)
  b[4] = Number((t >> 8n) & 0xffn)
  b[5] = Number(t & 0xffn)
  b[6] = (b[6]! & 0x0f) | 0x70
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  return `pbkdf2$100000$${b64(salt)}$${b64(bits)}`
}

type Val = string | number | boolean | null | undefined
const q = (v: Val): string => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? '1' : '0'
  return `'${v.replace(/'/g, "''")}'`
}
const sql: string[] = []
const insert = (table: string, rows: Record<string, Val>[]) => {
  if (!rows.length) return
  const cols = Object.keys(rows[0]!)
  // D1 caps bound params; plain literals avoid that, but keep statements modest.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    sql.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${chunk.map((r) => `(${cols.map((c) => q(r[c])).join(',')})`).join(',')};`)
  }
}

function d1(args: string[], opts: { json?: boolean } = {}) {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', REMOTE ? '--remote' : '--local', ...(opts.json ? ['--json'] : []), ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stdout)
    console.error(res.stderr)
    process.exit(res.status ?? 1)
  }
  return res.stdout
}
function query<T = Record<string, unknown>>(command: string): T[] {
  const out = d1(['--command', command], { json: true })
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  return (parsed[0]?.results ?? []) as T[]
}

// ── 1. user + workspace ────────────────────────────────────────────────────
async function main() {
  if (REMOTE) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const a = await rl.question(`This WIPES and reseeds ${EMAIL}'s workspace on the REMOTE database. Type "yes" to continue: `)
    rl.close()
    if (a.trim() !== 'yes') process.exit(1)
  }

  const existing = query<{ id: string; name: string }>(`SELECT id, name FROM user WHERE email = ${q(EMAIL)}`)[0]
  let userId = existing?.id
  if (!userId) {
    userId = newId()
    const pw = await hashPassword(PASSWORD ?? 'demo1234')
    insert('user', [{ id: userId, name: NAME, email: EMAIL, email_verified: true, created_at: daysAgo(200), updated_at: daysAgo(200) }])
    insert('account', [{ id: newId(), account_id: userId, provider_id: 'credential', user_id: userId, password: pw, created_at: daysAgo(200), updated_at: daysAgo(200) }])
    console.log(`Creating user ${EMAIL} (password: ${PASSWORD ?? 'demo1234'})`)
  } else if (PASSWORD) {
    const pw = await hashPassword(PASSWORD)
    sql.push(`UPDATE account SET password = ${q(pw)}, updated_at = ${now} WHERE user_id = ${q(userId)} AND provider_id = 'credential';`)
    sql.push(`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) SELECT ${q(newId())}, ${q(userId)}, 'credential', ${q(userId)}, ${q(pw)}, ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM account WHERE user_id = ${q(userId)} AND provider_id = 'credential');`)
    console.log(`Resetting password for ${EMAIL}`)
  } else {
    console.log(`Using existing user ${EMAIL} (${existing!.name})`)
  }

  const owned = existing
    ? query<{ id: string; name: string }>(
        `SELECT o.id, o.name FROM organization o JOIN member m ON m.organization_id = o.id WHERE m.user_id = ${q(userId)} AND m.role LIKE '%owner%' ORDER BY o.created_at LIMIT 1`,
      )[0]
    : undefined
  let wsId = owned?.id
  if (!wsId) {
    wsId = newId()
    const slug = `${WORKSPACE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`
    insert('organization', [{ id: wsId, name: WORKSPACE_NAME, slug, created_at: daysAgo(200) }])
    insert('member', [{ id: newId(), organization_id: wsId, user_id: userId, role: 'owner', created_at: daysAgo(200) }])
    console.log(`Creating workspace "${WORKSPACE_NAME}"`)
  } else {
    console.log(`Reseeding workspace "${owned!.name}" (${wsId})`)
  }
  const W = wsId
  const U = userId

  // ── 2. wipe ──────────────────────────────────────────────────────────────
  for (const t of ['activities', 'taggings', 'field_values', 'tags', 'custom_fields', 'tasks', 'task_digests', 'invoice_lines', 'invoices', 'incomes', 'expenses', 'deals', 'stages', 'pipelines', 'contacts', 'companies', 'portal_access', 'files'])
    sql.push(
      t === 'taggings'
        ? `DELETE FROM taggings WHERE tag_id IN (SELECT id FROM tags WHERE workspace_id = ${q(W)});`
        : t === 'field_values'
          ? `DELETE FROM field_values WHERE field_id IN (SELECT id FROM custom_fields WHERE workspace_id = ${q(W)});`
          : t === 'invoice_lines'
            ? `DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE workspace_id = ${q(W)});`
            : `DELETE FROM ${t} WHERE workspace_id = ${q(W)};`,
    )
  sql.push(`DELETE FROM payouts WHERE user_id = ${q(U)};`, `DELETE FROM allocations WHERE user_id = ${q(U)};`, `DELETE FROM set_aside_rules WHERE user_id = ${q(U)};`)
  sql.push(`UPDATE session SET active_organization_id = ${q(W)} WHERE user_id = ${q(U)};`)

  // ── 3. settings ──────────────────────────────────────────────────────────
  sql.push(`DELETE FROM workspace_settings WHERE organization_id = ${q(W)};`)
  insert('workspace_settings', [
    {
      organization_id: W,
      base_currency: CUR,
      timezone: TZ,
      business_name: `${NAME} Design Studio`,
      business_address: 'House 12, Road 7, Banani\nDhaka 1213, Bangladesh',
      business_email: EMAIL,
      tax_id: 'BIN 004512345-0101',
      invoice_prefix: 'INV-',
      next_invoice_number: 1,
      default_tax_rate_bp: 0,
      default_payment_terms_days: 14,
      invoice_footer: 'Thank you for your business. Payment by bank transfer or Wise.',
      invoice_template: 'modern',
      invoice_accent: '#2563eb',
      app_origin: null,
      setup_completed_at: daysAgo(199),
      updated_at: now,
    },
  ])
  sql.push(`DELETE FROM user_settings WHERE user_id = ${q(U)};`)
  insert('user_settings', [{ user_id: U, base_currency: CUR, updated_at: now }])

  // ── 4. pipeline ──────────────────────────────────────────────────────────
  const pipelineId = newId(daysAgo(199))
  insert('pipelines', [{ id: pipelineId, workspace_id: W, name: 'Sales', is_default: true, created_at: daysAgo(199) }])
  const STAGES = [
    { name: 'Lead', kind: 'open', probability: 10, color: 'gray' },
    { name: 'Qualified', kind: 'open', probability: 30, color: 'blue' },
    { name: 'Proposal', kind: 'open', probability: 60, color: 'purple' },
    { name: 'Negotiation', kind: 'open', probability: 80, color: 'orange' },
    { name: 'Won', kind: 'won', probability: 100, color: 'green' },
    { name: 'Lost', kind: 'lost', probability: 0, color: 'red' },
  ].map((s, i) => ({ id: newId(daysAgo(199)), workspace_id: W, pipeline_id: pipelineId, sort_order: i, ...s }))
  insert('stages', STAGES)
  const stageByName = (n: string) => STAGES.find((s) => s.name === n)!

  // ── 5. tags + custom fields ──────────────────────────────────────────────
  const TAGS = [
    ['VIP', 'yellow'],
    ['Retainer', 'green'],
    ['Referral', 'blue'],
    ['Agency', 'purple'],
    ['Startup', 'orange'],
    ['Slow payer', 'red'],
    ['Upwork', 'gray'],
    ['Local', 'blue'],
  ].map(([name, color]) => ({ id: newId(daysAgo(198)), workspace_id: W, name: name!, color: color!, created_at: daysAgo(198) }))
  insert('tags', TAGS)
  const tag = (n: string) => TAGS.find((t) => t.name === n)!.id

  const FIELDS = [
    { record_type: 'contact', name: 'Preferred channel', kind: 'select', options: JSON.stringify(['Email', 'WhatsApp', 'Slack', 'Phone']) },
    { record_type: 'contact', name: 'Birthday', kind: 'date', options: null },
    { record_type: 'company', name: 'Industry', kind: 'select', options: JSON.stringify(['SaaS', 'E-commerce', 'Agency', 'Healthcare', 'Fintech', 'Education', 'Non-profit']) },
    { record_type: 'company', name: 'Team size', kind: 'number', options: null },
    { record_type: 'deal', name: 'Source', kind: 'select', options: JSON.stringify(['Referral', 'Upwork', 'LinkedIn', 'Website', 'Repeat client']) },
    { record_type: 'deal', name: 'Hours estimate', kind: 'number', options: null },
  ].map((f, i) => ({ id: newId(daysAgo(198)), workspace_id: W, sort_order: i, created_at: daysAgo(198), ...f }))
  insert('custom_fields', FIELDS)
  const field = (type: string, name: string) => FIELDS.find((f) => f.record_type === type && f.name === name)!
  const fieldValues: Record<string, Val>[] = []
  const taggings: Record<string, Val>[] = []
  const activities: Record<string, Val>[] = []
  const logCreated = (type: string, id: string, at: number, body: string) =>
    activities.push({ id: newId(at), workspace_id: W, target_type: type, target_id: id, kind: 'created', body, meta: null, user_id: U, shared_to_portal: false, occurred_at: at, created_at: at })
  const logUpdate = (type: string, id: string, at: number, body: string, meta: Record<string, [Val, Val]>) =>
    activities.push({ id: newId(at), workspace_id: W, target_type: type, target_id: id, kind: 'updated', body, meta: JSON.stringify(meta), user_id: U, shared_to_portal: false, occurred_at: at, created_at: at })
  const logNote = (type: string, id: string, at: number, kind: 'note' | 'call' | 'meeting' | 'email', body: string, shared = false) =>
    activities.push({ id: newId(at), workspace_id: W, target_type: type, target_id: id, kind, body, meta: null, user_id: U, shared_to_portal: shared, occurred_at: at, created_at: at })

  // ── 6. companies ─────────────────────────────────────────────────────────
  const COMPANIES = [
    ['Brightline Labs', 'brightlinelabs.io', 'SaaS', 24, 'Austin, TX'],
    ['Northwind Apparel', 'northwindapparel.com', 'E-commerce', 60, 'Portland, OR'],
    ['Halo Health', 'halohealth.co', 'Healthcare', 140, 'Toronto, Canada'],
    ['Pixel & Pine', 'pixelandpine.studio', 'Agency', 9, 'Berlin, Germany'],
    ['Kite Finance', 'kitefinance.com', 'Fintech', 85, 'London, UK'],
    ['Lumen Education', 'lumen.edu', 'Education', 35, 'Melbourne, Australia'],
    ['Greenroot Foundation', 'greenroot.org', 'Non-profit', 12, 'Nairobi, Kenya'],
    ['Orbit Commerce', 'orbitcommerce.com', 'E-commerce', 48, 'Singapore'],
    ['Mosaic Agency', 'mosaic.agency', 'Agency', 22, 'Amsterdam, Netherlands'],
    ['Tidewater Analytics', 'tidewater.ai', 'SaaS', 17, 'Boston, MA'],
    ['Sunbeam Clinics', 'sunbeamclinics.com', 'Healthcare', 210, 'Dubai, UAE'],
    ['Ferrum Tools', 'ferrumtools.de', 'E-commerce', 31, 'Munich, Germany'],
    ['Cobalt Pay', 'cobaltpay.io', 'Fintech', 52, 'Dublin, Ireland'],
    ['Riverside Books', 'riversidebooks.com', 'E-commerce', 6, 'Dhaka, Bangladesh'],
    ['Atlas Mobility', 'atlasmobility.co', 'SaaS', 73, 'Stockholm, Sweden'],
    ['Juniper Studio', 'juniper.studio', 'Agency', 4, 'Lisbon, Portugal'],
    ['Nimbus Cloudworks', 'nimbuscloudworks.com', 'SaaS', 120, 'Seattle, WA'],
    ['Saffron Kitchen', 'saffronkitchen.com.bd', 'E-commerce', 15, 'Chittagong, Bangladesh'],
    ['Vertex Learning', 'vertexlearning.io', 'Education', 28, 'Bangalore, India'],
    ['Harbor & Co', 'harborandco.com', 'Agency', 11, 'New York, NY'],
  ].map(([name, domain, industry, size, city], i) => {
    const at = daysAgo(between(20, 190))
    return { id: newId(at), workspace_id: W, name: name as string, domain: domain as string, website: `https://${domain}`, phone: chance(0.6) ? `+1 ${between(200, 999)} ${between(200, 999)} ${between(1000, 9999)}` : null, address: city as string, notes: i % 4 === 0 ? 'Met at a conference. Prefers async communication.' : null, owner_user_id: U, created_at: at, updated_at: at, _industry: industry as string, _size: size as number }
  })
  insert('companies', COMPANIES.map(({ _industry, _size, ...c }) => c))
  for (const c of COMPANIES) {
    logCreated('company', c.id, c.created_at, `Added ${c.name}`)
    fieldValues.push({ field_id: field('company', 'Industry').id, record_id: c.id, value: c._industry })
    fieldValues.push({ field_id: field('company', 'Team size').id, record_id: c.id, value: String(c._size) })
    if (c._industry === 'Agency') taggings.push({ tag_id: tag('Agency'), record_type: 'company', record_id: c.id })
    if (c._size < 20 && c._industry === 'SaaS') taggings.push({ tag_id: tag('Startup'), record_type: 'company', record_id: c.id })
    if (chance(0.25)) taggings.push({ tag_id: tag('VIP'), record_type: 'company', record_id: c.id })
    if (chance(0.4)) logNote('company', c.id, c.created_at + between(1, 10) * DAY, 'note', pick(['Intro call went well, they want a proposal by end of month.', 'Budget approved for Q3. Waiting on procurement.', 'They use Notion + Slack internally.', 'Decision maker is the COO, not the person who reached out.']))
  }
  // ── 7. contacts ──────────────────────────────────────────────────────────
  const FIRST = ['Amina', 'Liam', 'Sofia', 'Noah', 'Zara', 'Ethan', 'Mei', 'Lucas', 'Priya', 'Omar', 'Hana', 'Felix', 'Leila', 'Mateo', 'Ingrid', 'Rafi', 'Chloe', 'Tariq', 'Elena', 'Jonas', 'Nadia', 'Arjun', 'Freya', 'Kenji', 'Maya', 'Samir', 'Ava', 'Diego', 'Ayesha', 'Theo', 'Farhan', 'Isla', 'Yusuf', 'Clara', 'Rohan', 'Nora', 'Imran', 'Lena', 'Kwame', 'Sara', 'Hugo', 'Tanvir', 'Mila', 'Idris', 'Greta']
  const LAST = ['Rahman', 'Okafor', 'Schmidt', 'Haddad', 'Nguyen', 'Silva', 'Petrov', 'Khan', 'Dubois', 'Tanaka', 'Hossain', 'Lindqvist', 'Moreau', 'Chowdhury', 'Berg', 'Mensah', 'Rossi', 'Ahmed', 'Novak', 'Iyer', 'Fischer', 'Kowalski', 'Sato', 'Begum', 'Larsen', 'Costa', 'Murphy', 'Yilmaz', 'Park', 'Ali']
  const TITLES = ['Founder', 'CEO', 'Head of Marketing', 'Product Manager', 'Operations Lead', 'CTO', 'Design Lead', 'Growth Manager', 'Office Manager', 'Creative Director', 'COO', 'Brand Manager']
  const CHANNELS = ['Email', 'WhatsApp', 'Slack', 'Phone']
  const CONTACTS: { id: string; first: string; last: string; email: string; company: (typeof COMPANIES)[number] | null; created_at: number }[] = []
  const usedNames = new Set<string>()
  for (let i = 0; i < 46; i++) {
    let first = pick(FIRST)
    let last = pick(LAST)
    while (usedNames.has(first + last)) {
      first = pick(FIRST)
      last = pick(LAST)
    }
    usedNames.add(first + last)
    // ~70% belong to a company; the rest are solo clients, which is the freelancer reality.
    const co = i < 32 ? COMPANIES[i % COMPANIES.length]! : chance(0.3) ? pick(COMPANIES) : null
    const at = co ? co.created_at + between(0, 15) * DAY : daysAgo(between(5, 185))
    const email = co ? `${first.toLowerCase()}.${last.toLowerCase()}@${co.domain}` : `${first.toLowerCase()}${last.toLowerCase()}${between(1, 99)}@gmail.com`
    const id = newId(at)
    CONTACTS.push({ id, first, last, email, company: co, created_at: at })
    insert('contacts', [
      {
        id,
        workspace_id: W,
        company_id: co?.id ?? null,
        first_name: first,
        last_name: last,
        email,
        phone: chance(0.7) ? `+${pick(['1', '44', '49', '880', '971', '65'])} ${between(100, 999)} ${between(100, 999)} ${between(100, 9999)}` : null,
        job_title: co ? pick(TITLES) : pick(['Freelance photographer', 'Author', 'Consultant', 'Restaurant owner', 'Coach', null]),
        notes: chance(0.3) ? pick(['Replies fast on WhatsApp.', 'Likes weekly Friday updates.', 'Introduced by Pixel & Pine.', 'Timezone: UTC+8, avoid late calls.']) : null,
        owner_user_id: U,
        created_at: at,
        updated_at: at,
      },
    ])
    logCreated('contact', id, at, `Added ${first} ${last}`)
    fieldValues.push({ field_id: field('contact', 'Preferred channel').id, record_id: id, value: pick(CHANNELS) })
    if (chance(0.4)) fieldValues.push({ field_id: field('contact', 'Birthday').id, record_id: id, value: `${between(1978, 1998)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}` })
    if (chance(0.2)) taggings.push({ tag_id: tag('Referral'), record_type: 'contact', record_id: id })
    if (chance(0.15)) taggings.push({ tag_id: tag('Upwork'), record_type: 'contact', record_id: id })
    if (!co && chance(0.5)) taggings.push({ tag_id: tag('Local'), record_type: 'contact', record_id: id })
    if (chance(0.15)) taggings.push({ tag_id: tag('VIP'), record_type: 'contact', record_id: id })
    const n = between(0, 4)
    for (let k = 0; k < n; k++) {
      const when = at + between(1, Math.max(2, Math.floor((now - at) / DAY))) * DAY
      if (when > now) continue
      const kind = pick(['note', 'call', 'meeting', 'email'] as const)
      const body = {
        note: pick(['Wants the homepage redesign first, then the app.', 'Asked for a fixed quote instead of hourly.', 'Sent over brand guidelines.', 'Follow up after their board meeting.', 'Mentioned a second project for Q4.']),
        call: pick(['Discovery call, 30 min. Scope: landing page + 3 inner pages.', 'Quick call about the invoice. Paying Friday.', 'Walked through the Figma prototype.']),
        meeting: pick(['Kickoff meeting at their office.', 'Review session, feedback mostly on typography.', 'Monthly retainer check-in.']),
        email: pick(['Sent proposal v2.', 'Sent the contract for signature.', 'Reminder about overdue invoice.', 'Shared the staging link.']),
      }[kind]
      logNote('contact', id, when, kind, body, kind === 'note' && chance(0.3))
    }
    if (chance(0.3)) logUpdate('contact', id, at + between(1, 30) * DAY, 'Updated job title', { jobTitle: [pick(TITLES), pick(TITLES)] })
  }
  // ── 8. deals ─────────────────────────────────────────────────────────────
  const DEAL_TITLES = ['Website redesign', 'Brand identity', 'Mobile app UI', 'Shopify theme', 'Landing page sprint', 'Design system', 'Pitch deck design', 'Monthly design retainer', 'Email templates', 'Dashboard UX audit', 'Packaging design', 'Marketing site', 'Onboarding flow redesign', 'Annual report layout', 'Logo refresh', 'Webflow build']
  const dealRows: Record<string, Val>[] = []
  const DEALS: { id: string; title: string; value: number; status: string; closed_at: number | null; contact: (typeof CONTACTS)[number]; company: (typeof COMPANIES)[number] | null; created_at: number }[] = []
  const plan: [string, number][] = [
    ['Lead', 5],
    ['Qualified', 4],
    ['Proposal', 4],
    ['Negotiation', 3],
    ['Won', 11],
    ['Lost', 4],
  ]
  for (const [stageName, count] of plan) {
    const stage = stageByName(stageName)
    for (let i = 0; i < count; i++) {
      const contact = pick(CONTACTS)
      const co = contact.company
      const created = Math.max(contact.created_at, daysAgo(between(3, 170)))
      const value = pick([80000, 120000, 150000, 250000, 320000, 450000, 600000, 850000, 1200000, 1800000, 2500000])
      const status = stage.kind
      const closed_at = status === 'open' ? null : created + between(5, 45) * DAY
      const id = newId(created)
      const title = `${pick(DEAL_TITLES)} for ${co?.name ?? `${contact.first} ${contact.last}`}`
      DEALS.push({ id, title, value, status, closed_at: closed_at && closed_at < now ? closed_at : status === 'open' ? null : daysAgo(between(1, 10)), contact, company: co, created_at: created })
      const d = DEALS[DEALS.length - 1]!
      dealRows.push({
        id,
        workspace_id: W,
        pipeline_id: pipelineId,
        stage_id: stage.id,
        title,
        value_minor: value,
        currency: CUR,
        expected_close_on: status === 'open' ? iso(now + between(-10, 60) * DAY) : iso(d.closed_at!),
        contact_id: contact.id,
        company_id: co?.id ?? null,
        owner_user_id: U,
        status,
        lost_reason: status === 'lost' ? pick(['Went with an agency', 'Budget cut', 'No response', 'Timeline too tight']) : null,
        closed_at: d.closed_at,
        sort_order: i,
        notes: chance(0.4) ? pick(['Two rounds of revisions included.', 'Needs to launch before their trade show.', '50% upfront, 50% on delivery.']) : null,
        created_at: created,
        updated_at: d.closed_at ?? created + between(0, 20) * DAY,
      })
      logCreated('deal', id, created, `Created deal "${title}"`)
      fieldValues.push({ field_id: field('deal', 'Source').id, record_id: id, value: pick(['Referral', 'Upwork', 'LinkedIn', 'Website', 'Repeat client']) })
      fieldValues.push({ field_id: field('deal', 'Hours estimate').id, record_id: id, value: String(Math.round(value / 8000)) })
      // walk the stages it passed through
      const path = STAGES.filter((s) => s.kind === 'open' && s.sort_order < stage.sort_order).map((s) => s.name)
      if (stage.kind !== 'open') path.push(...STAGES.filter((s) => s.kind === 'open').map((s) => s.name).slice(path.length, between(1, 4)))
      let prev = 'Lead'
      let t = created
      for (const s of [...path.slice(1), stage.name]) {
        if (s === prev) continue
        t += between(2, 12) * DAY
        if (t >= (d.closed_at ?? now)) t = (d.closed_at ?? now) - DAY
        logUpdate('deal', id, t, `Moved to ${s}`, { stage: [prev, s] })
        prev = s
      }
      if (status !== 'open') logUpdate('deal', id, d.closed_at!, `Marked ${status}`, { status: ['open', status] })
      if (chance(0.5)) logNote('deal', id, created + between(1, 10) * DAY, pick(['note', 'call', 'email'] as const), pick(['Sent scope doc.', 'They asked for a discount, holding firm.', 'Waiting on their legal.', 'Call booked for Thursday.']))
      if (chance(0.2)) taggings.push({ tag_id: tag('Retainer'), record_type: 'deal', record_id: id })
    }
  }
  insert('deals', dealRows)

  // ── 9. invoices + incomes ────────────────────────────────────────────────
  const LINES = [
    ['Discovery & research', 4000, 15000],
    ['Wireframes', 8000, 12000],
    ['Visual design, homepage', 1000, 180000],
    ['Visual design, inner pages', 3000, 90000],
    ['Design system components', 1000, 250000],
    ['Webflow development', 20000, 9500],
    ['Revisions (2 rounds)', 1000, 60000],
    ['Monthly retainer, 20h', 20000, 8500],
    ['Logo & brand marks', 1000, 220000],
    ['Pitch deck, 18 slides', 18000, 9000],
  ] as const
  const invoiceRows: Record<string, Val>[] = []
  const lineRows: Record<string, Val>[] = []
  const incomeRows: Record<string, Val>[] = []
  let invoiceNo = 0
  const won = DEALS.filter((d) => d.status === 'won')
  type Inv = { status: 'draft' | 'sent' | 'paid' | 'void'; deal?: (typeof DEALS)[number]; overdue?: boolean }
  const invPlan: Inv[] = [
    ...won.map((deal) => ({ status: 'paid' as const, deal })),
    ...won.slice(0, 3).map((deal) => ({ status: 'paid' as const, deal })), // second invoices on retainers
    { status: 'sent' },
    { status: 'sent' },
    { status: 'sent', overdue: true },
    { status: 'sent', overdue: true },
    { status: 'sent' },
    { status: 'draft' },
    { status: 'draft' },
    { status: 'draft' },
    { status: 'void' },
    { status: 'void' },
  ]
  for (const p of invPlan) {
    const contact = p.deal?.contact ?? pick(CONTACTS)
    const co = contact.company
    const issuedAt = p.deal ? p.deal.closed_at! + between(0, 5) * DAY : p.status === 'draft' ? daysAgo(between(0, 5)) : p.overdue ? daysAgo(between(25, 70)) : daysAgo(between(1, 12))
    const dueAt = issuedAt + 14 * DAY
    const id = newId(issuedAt)
    const nLines = between(1, 4)
    let subtotal = 0
    const lines = Array.from({ length: nLines }, (_, i) => {
      const [desc, qty, unit] = pick(LINES)
      const amount = Math.round((qty * unit) / 1000)
      subtotal += amount
      return { id: newId(issuedAt), invoice_id: id, description: desc, quantity_milli: qty as number, unit_minor: unit as number, amount_minor: amount, sort_order: i }
    })
    if (p.deal) {
      // make the invoice total match the deal value by adjusting the last line
      const diff = p.deal.value - subtotal
      const last = lines[lines.length - 1]!
      last.unit_minor = Math.max(1000, Math.round(((last.amount_minor + diff) * 1000) / last.quantity_milli))
      last.amount_minor = Math.round((last.quantity_milli * last.unit_minor) / 1000)
      subtotal = lines.reduce((a, l) => a + l.amount_minor, 0)
    }
    const taxBp = chance(0.3) ? 1500 : 0
    const tax = Math.round((subtotal * taxBp) / 10000)
    const number = p.status === 'draft' ? null : `INV-${String(++invoiceNo).padStart(4, '0')}`
    const paidAt = p.status === 'paid' ? issuedAt + between(2, 20) * DAY : null
    const billTo = co ? `${co.name}\nAttn: ${contact.first} ${contact.last}\n${co.address}` : `${contact.first} ${contact.last}\n${contact.email}`
    let incomeId: string | null = null
    if (p.status === 'paid') {
      incomeId = newId(paidAt!)
      incomeRows.push({ id: incomeId, workspace_id: W, user_id: U, amount_minor: subtotal + tax, currency: CUR, received_on: iso(paidAt!), client_name: co?.name ?? `${contact.first} ${contact.last}`, source: pick(['Bank transfer', 'Wise', 'Payoneer', 'Stripe']), note: `Invoice ${number}`, invoice_id: id, created_at: paidAt!, updated_at: paidAt! })
    }
    invoiceRows.push({
      id,
      workspace_id: W,
      number,
      status: p.status,
      contact_id: contact.id,
      company_id: co?.id ?? null,
      deal_id: p.deal?.id ?? null,
      bill_to: billTo,
      currency: CUR,
      issued_on: iso(issuedAt),
      due_on: iso(dueAt),
      tax_rate_bp: taxBp,
      subtotal_minor: subtotal,
      tax_minor: tax,
      total_minor: subtotal + tax,
      notes: chance(0.4) ? 'Milestone 1 of 2.' : null,
      footer: 'Thank you for your business. Payment by bank transfer or Wise.',
      public_token: newId(issuedAt).replace(/-/g, '') + newId(issuedAt).replace(/-/g, ''),
      sent_at: p.status === 'draft' ? null : issuedAt,
      paid_on: paidAt ? iso(paidAt) : null,
      paid_at: paidAt,
      income_id: incomeId,
      created_by_user_id: U,
      created_at: issuedAt,
      updated_at: paidAt ?? issuedAt,
    })
    lineRows.push(...lines)
  }
  sql.push(`UPDATE workspace_settings SET next_invoice_number = ${invoiceNo + 1} WHERE organization_id = ${q(W)};`)
  // incomes first because invoices.income_id references them
  insert('incomes', incomeRows)
  insert('invoices', invoiceRows)
  insert('invoice_lines', lineRows)

  // extra incomes without invoices (Upwork etc.) and expenses, spread over 6 months
  const extraIncomes: Record<string, Val>[] = []
  for (let m = 0; m < 6; m++) {
    for (let k = 0; k < between(1, 3); k++) {
      const at = daysAgo(m * 30 + between(1, 28))
      extraIncomes.push({ id: newId(at), workspace_id: W, user_id: U, amount_minor: pick([45000, 90000, 120000, 200000, 350000]), currency: CUR, received_on: iso(at), client_name: pick(['Upwork client', 'Fiverr order', pick(COMPANIES).name]), source: pick(['Upwork', 'Fiverr', 'Bank transfer']), note: null, invoice_id: null, created_at: at, updated_at: at })
    }
  }
  insert('incomes', extraIncomes)
  const allIncomes = [...incomeRows, ...extraIncomes]

  const EXPENSES = [
    ['Software', 'Figma', 1500],
    ['Software', 'Adobe Creative Cloud', 5999],
    ['Software', 'Webflow', 2900],
    ['Software', 'Notion', 1000],
    ['Hosting', 'Cloudflare', 500],
    ['Hosting', 'Vercel', 2000],
    ['Equipment', 'Apple', 24900],
    ['Contractor', 'Illustrator (freelance)', 60000],
    ['Office', 'Coworking space', 18000],
    ['Marketing', 'LinkedIn ads', 12000],
    ['Travel', 'Client visit, train', 8500],
    ['Education', 'Course: motion design', 19900],
    ['Fees', 'Wise transfer fee', 1200],
    ['Fees', 'Upwork service fee', 9000],
  ] as const
  const expenseRows: Record<string, Val>[] = []
  for (let m = 0; m < 6; m++) {
    for (const [cat, vendor, amt] of EXPENSES) {
      if (['Equipment', 'Contractor', 'Travel', 'Education', 'Marketing'].includes(cat) && !chance(0.3)) continue
      const at = daysAgo(m * 30 + between(1, 28))
      expenseRows.push({ id: newId(at), workspace_id: W, user_id: U, amount_minor: amt, currency: CUR, spent_on: iso(at), category: cat, vendor, note: null, created_at: at, updated_at: at })
    }
  }
  insert('expenses', expenseRows)

  // ── 10. set-asides, allocations, payouts ─────────────────────────────────
  const RULES = [
    ['Tax', 2000],
    ['Savings', 1000],
    ['Giving', 250],
  ].map(([name, bp], i) => ({ id: newId(daysAgo(199)), user_id: U, name: name as string, percent_bp: bp as number, active: true, sort_order: i, created_at: daysAgo(199), updated_at: daysAgo(199) }))
  insert('set_aside_rules', RULES)
  const allocRows: Record<string, Val>[] = []
  const bucket: Record<string, number> = {}
  for (const inc of allIncomes) {
    for (const r of RULES) {
      const amt = Math.round(((inc.amount_minor as number) * r.percent_bp) / 10000)
      bucket[r.id] = (bucket[r.id] ?? 0) + amt
      allocRows.push({ id: newId(inc.created_at as number), user_id: U, income_id: inc.id, rule_id: r.id, percent_bp: r.percent_bp, amount_minor: amt, currency: CUR, created_at: inc.created_at })
    }
  }
  insert('allocations', allocRows)
  const payoutRows: Record<string, Val>[] = []
  for (const r of RULES) {
    // pay out roughly 40% of what accrued, in 1–3 chunks
    const total = Math.round((bucket[r.id] ?? 0) * 0.4)
    const chunks = between(1, 3)
    for (let i = 0; i < chunks; i++) {
      const at = daysAgo(between(5, 150))
      payoutRows.push({ id: newId(at), user_id: U, rule_id: r.id, amount_minor: Math.round(total / chunks), currency: CUR, paid_on: iso(at), note: r.name === 'Tax' ? 'Advance tax payment' : r.name === 'Giving' ? 'Donation' : null, created_at: at })
    }
  }
  insert('payouts', payoutRows)

  // ── 11. tasks ────────────────────────────────────────────────────────────
  const TASKS = ['Send proposal', 'Follow up on invoice', 'Schedule kickoff call', 'Share Figma prototype', 'Collect brand assets', 'Review contract', 'Send final files', 'Ask for testimonial', 'Book check-in call', 'Prepare quote', 'Update case study', 'Chase feedback on v2', 'Set up staging site', 'Send onboarding doc']
  const taskRows: Record<string, Val>[] = []
  const open = DEALS.filter((d) => d.status === 'open')
  for (let i = 0; i < 42; i++) {
    const done = i >= 24
    const deal = chance(0.6) ? pick(open) : null
    const contact = deal?.contact ?? (chance(0.7) ? pick(CONTACTS) : null)
    const co = chance(0.3) && contact?.company ? contact.company : null
    const created = daysAgo(between(1, 60))
    const due = done ? iso(created + between(1, 10) * DAY) : i < 5 ? iso(now - between(1, 6) * DAY) : i < 12 ? today : chance(0.8) ? iso(now + between(1, 21) * DAY) : null
    const completed = done ? created + between(1, 12) * DAY : null
    taskRows.push({
      id: newId(created),
      workspace_id: W,
      title: `${pick(TASKS)}${contact ? ` – ${contact.first}` : ''}`,
      description: chance(0.3) ? 'See the last call notes on the timeline.' : null,
      due_on: due,
      assignee_user_id: U,
      contact_id: contact?.id ?? null,
      company_id: co?.id ?? null,
      deal_id: deal?.id ?? null,
      status: done ? 'done' : 'open',
      completed_at: completed,
      created_by_user_id: U,
      created_at: created,
      updated_at: completed ?? created,
    })
  }
  insert('tasks', taskRows)

  // ── 12. polymorphic extras ───────────────────────────────────────────────
  insert('field_values', fieldValues)
  insert('taggings', taggings)
  insert('activities', activities)

  // ── run ──────────────────────────────────────────────────────────────────
  const dir = mkdtempSync(join(tmpdir(), 'cf-seed-'))
  const file = join(dir, 'seed.sql')
  writeFileSync(file, sql.join('\n'))
  console.log(`Executing ${sql.length} statements (${REMOTE ? 'remote' : 'local'} D1)…`)
  d1(['--file', file])
  console.log(
    [
      '',
      `Done. Sign in as ${EMAIL}${existing && !PASSWORD ? '' : ` / ${PASSWORD ?? 'demo1234'}`}`,
      `  companies ${COMPANIES.length}  contacts ${CONTACTS.length}  deals ${DEALS.length}  tasks ${taskRows.length}`,
      `  invoices ${invoiceRows.length}  incomes ${allIncomes.length}  expenses ${expenseRows.length}  activities ${activities.length}`,
    ].join('\n'),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
