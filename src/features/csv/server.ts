import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { parseCsv, toCsv } from '#/lib/csv'
import { requireWorkspace } from '#/lib/session'
import { activityInsert } from '#/features/activities/server'
import { tagsForRecords } from '#/features/tags/server'
import { makeFieldCleaner, valuesForRecords } from '#/features/custom-fields/server'

export const CONTACT_COLUMNS = ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'company', 'notes', 'tags'] as const
export const COMPANY_COLUMNS = ['name', 'domain', 'website', 'phone', 'address', 'notes', 'tags'] as const

/** CSV text of all contacts, standard columns then custom fields prefixed "cf:". */
export const exportContacts = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const db = getDb()
  const [rows, fields] = await Promise.all([
    db.query.contacts.findMany({ where: eq(schema.contacts.workspaceId, ctx.workspaceId), with: { company: { columns: { name: true } } }, orderBy: [asc(schema.contacts.firstName)] }),
    db.query.customFields.findMany({ where: and(eq(schema.customFields.workspaceId, ctx.workspaceId), eq(schema.customFields.recordType, 'contact')), orderBy: [schema.customFields.sortOrder] }),
  ])
  const ids = rows.map((r) => r.id)
  const [tags, values] = await Promise.all([tagsForRecords('contact', ids), valuesForRecords(ids)])
  const headers = [...CONTACT_COLUMNS, ...fields.map((f) => `cf:${f.name}`)]
  const out = rows.map((r) => [
    r.firstName,
    r.lastName,
    r.email,
    r.phone,
    r.jobTitle,
    r.company?.name,
    r.notes,
    (tags.get(r.id) ?? []).map((t) => t.name).join('; '),
    ...fields.map((f) => values.get(r.id)?.[f.id] ?? ''),
  ])
  return { filename: `contacts-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(headers, out) }
})

export const exportCompanies = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const db = getDb()
  const [rows, fields] = await Promise.all([
    db.query.companies.findMany({ where: eq(schema.companies.workspaceId, ctx.workspaceId), orderBy: [asc(schema.companies.name)] }),
    db.query.customFields.findMany({ where: and(eq(schema.customFields.workspaceId, ctx.workspaceId), eq(schema.customFields.recordType, 'company')), orderBy: [schema.customFields.sortOrder] }),
  ])
  const ids = rows.map((r) => r.id)
  const [tags, values] = await Promise.all([tagsForRecords('company', ids), valuesForRecords(ids)])
  const headers = [...COMPANY_COLUMNS, ...fields.map((f) => `cf:${f.name}`)]
  const out = rows.map((r) => [r.name, r.domain, r.website, r.phone, r.address, r.notes, (tags.get(r.id) ?? []).map((t) => t.name).join('; '), ...fields.map((f) => values.get(r.id)?.[f.id] ?? '')])
  return { filename: `companies-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(headers, out) }
})

/** Parse uploaded CSV text so the UI can show headers and a preview before mapping. */
export const previewCsv = createServerFn({ method: 'POST' })
  .validator(z.object({ text: z.string().max(5_000_000) }))
  .handler(async ({ data }) => {
    await requireWorkspace()
    const rows = parseCsv(data.text)
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row')
    return { headers: rows[0]!, preview: rows.slice(1, 6), rowCount: rows.length - 1 }
  })

/**
 * mapping: csvHeader → target. Targets are a standard column name, `cf:<fieldId>`, or '' to skip.
 * Companies named in the `company` column are created when missing. Tags are "; " separated and created when missing.
 */
const importInput = z.object({ text: z.string().max(5_000_000), mapping: z.record(z.string(), z.string()) })

async function ensureTags(workspaceId: string, names: Set<string>) {
  const db = getDb()
  const existing = await db.query.tags.findMany({ where: eq(schema.tags.workspaceId, workspaceId) })
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]))
  const missing = [...names].filter((n) => !byName.has(n.toLowerCase()))
  if (missing.length) {
    const rows = missing.map((name) => ({ id: newId(), workspaceId, name, color: 'gray', createdAt: new Date() }))
    await db.insert(schema.tags).values(rows)
    for (const r of rows) byName.set(r.name.toLowerCase(), r.id)
  }
  return byName
}

const splitTags = (s: string | undefined) =>
  (s ?? '')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean)

export const importContacts = createServerFn({ method: 'POST' })
  .validator(importInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const rows = parseCsv(data.text)
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row')
    const headers = rows[0]!
    const col = (name: string) => headers.findIndex((h) => data.mapping[h] === name)
    const cfCols = headers.map((h, i) => ({ i, fieldId: data.mapping[h]?.startsWith('cf:') ? data.mapping[h]!.slice(3) : null })).filter((c) => c.fieldId)
    const clean = await makeFieldCleaner(ctx.workspaceId, 'contact', cfCols.map((c) => c.fieldId!))
    const iFirst = col('firstName')
    if (iFirst < 0) throw new Error('Map a column to First name')
    const iLast = col('lastName'), iEmail = col('email'), iPhone = col('phone'), iTitle = col('jobTitle'), iCompany = col('company'), iNotes = col('notes'), iTags = col('tags')

    const tagNames = new Set<string>()
    const companyNames = new Set<string>()
    for (const r of rows.slice(1)) {
      if (iTags >= 0) splitTags(r[iTags]).forEach((t) => tagNames.add(t))
      if (iCompany >= 0 && r[iCompany]?.trim()) companyNames.add(r[iCompany]!.trim())
    }
    const tagIds = await ensureTags(ctx.workspaceId, tagNames)
    const existingCompanies = await db.query.companies.findMany({ where: eq(schema.companies.workspaceId, ctx.workspaceId), columns: { id: true, name: true } })
    const companyByName = new Map(existingCompanies.map((c) => [c.name.toLowerCase(), c.id]))
    const now = new Date()
    // Ids are assigned now; rows are written after every contact row has validated.
    const newCompanies = [...companyNames].filter((n) => !companyByName.has(n.toLowerCase())).map((name) => ({ id: newId(), workspaceId: ctx.workspaceId, name, createdAt: now, updatedAt: now, ownerUserId: ctx.user.id }))
    for (const c of newCompanies) companyByName.set(c.name.toLowerCase(), c.id)

    let imported = 0
    const errors: string[] = []
    const contactRows: (typeof schema.contacts.$inferInsert)[] = []
    const taggingRows: (typeof schema.taggings.$inferInsert)[] = []
    const valueRows: (typeof schema.fieldValues.$inferInsert)[] = []
    for (let n = 1; n < rows.length; n++) {
      const r = rows[n]!
      const firstName = r[iFirst]?.trim()
      if (!firstName) {
        errors.push(`Row ${n}: missing first name`)
        continue
      }
      const email = iEmail >= 0 ? r[iEmail]?.trim() || null : null
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row ${n}: bad email "${email}"`)
        continue
      }
      const id = newId()
      let fv: Record<string, string> = {}
      try {
        fv = clean(Object.fromEntries(cfCols.map((c) => [c.fieldId!, r[c.i] ?? ''])))
      } catch (e) {
        errors.push(`Row ${n}: ${(e as Error).message}`)
        continue
      }
      contactRows.push({
        id,
        workspaceId: ctx.workspaceId,
        firstName,
        lastName: iLast >= 0 ? r[iLast]?.trim() || null : null,
        email,
        phone: iPhone >= 0 ? r[iPhone]?.trim() || null : null,
        jobTitle: iTitle >= 0 ? r[iTitle]?.trim() || null : null,
        notes: iNotes >= 0 ? r[iNotes]?.trim() || null : null,
        companyId: iCompany >= 0 && r[iCompany]?.trim() ? (companyByName.get(r[iCompany]!.trim().toLowerCase()) ?? null) : null,
        ownerUserId: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      })
      for (const t of iTags >= 0 ? splitTags(r[iTags]) : []) {
        const tagId = tagIds.get(t.toLowerCase())
        if (tagId) taggingRows.push({ tagId, recordType: 'contact', recordId: id })
      }
      for (const [fieldId, value] of Object.entries(fv)) valueRows.push({ fieldId, recordId: id, value })
      imported++
    }
    // D1 batch limits: chunk inserts.
    const chunk = <T,>(arr: T[], n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
    if (newCompanies.length && contactRows.length) await db.insert(schema.companies).values(newCompanies)
    for (const c of chunk(contactRows)) await db.insert(schema.contacts).values(c)
    for (const c of chunk(taggingRows)) await db.insert(schema.taggings).values(c).onConflictDoNothing()
    for (const c of chunk(valueRows)) await db.insert(schema.fieldValues).values(c)
    for (const c of chunk(contactRows, 50)) {
      await db.batch(c.map((row) => activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'contact', targetId: row.id, kind: 'created', body: 'Imported from CSV' })) as [never, ...never[]])
    }
    return { imported, skipped: errors.length, companiesCreated: contactRows.length ? newCompanies.length : 0, errors: errors.slice(0, 50) }
  })

export const importCompanies = createServerFn({ method: 'POST' })
  .validator(importInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const rows = parseCsv(data.text)
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row')
    const headers = rows[0]!
    const col = (name: string) => headers.findIndex((h) => data.mapping[h] === name)
    const cfCols = headers.map((h, i) => ({ i, fieldId: data.mapping[h]?.startsWith('cf:') ? data.mapping[h]!.slice(3) : null })).filter((c) => c.fieldId)
    const clean = await makeFieldCleaner(ctx.workspaceId, 'company', cfCols.map((c) => c.fieldId!))
    const iName = col('name')
    if (iName < 0) throw new Error('Map a column to Name')
    const iDomain = col('domain'), iWeb = col('website'), iPhone = col('phone'), iAddr = col('address'), iNotes = col('notes'), iTags = col('tags')
    const tagNames = new Set<string>()
    for (const r of rows.slice(1)) if (iTags >= 0) splitTags(r[iTags]).forEach((t) => tagNames.add(t))
    const tagIds = await ensureTags(ctx.workspaceId, tagNames)
    const now = new Date()
    let imported = 0
    const errors: string[] = []
    const companyRows: (typeof schema.companies.$inferInsert)[] = []
    const taggingRows: (typeof schema.taggings.$inferInsert)[] = []
    const valueRows: (typeof schema.fieldValues.$inferInsert)[] = []
    for (let n = 1; n < rows.length; n++) {
      const r = rows[n]!
      const name = r[iName]?.trim()
      if (!name) {
        errors.push(`Row ${n}: missing name`)
        continue
      }
      const id = newId()
      let fv: Record<string, string> = {}
      try {
        fv = clean(Object.fromEntries(cfCols.map((c) => [c.fieldId!, r[c.i] ?? ''])))
      } catch (e) {
        errors.push(`Row ${n}: ${(e as Error).message}`)
        continue
      }
      companyRows.push({
        id,
        workspaceId: ctx.workspaceId,
        name,
        domain: iDomain >= 0 ? r[iDomain]?.trim() || null : null,
        website: iWeb >= 0 ? r[iWeb]?.trim() || null : null,
        phone: iPhone >= 0 ? r[iPhone]?.trim() || null : null,
        address: iAddr >= 0 ? r[iAddr]?.trim() || null : null,
        notes: iNotes >= 0 ? r[iNotes]?.trim() || null : null,
        ownerUserId: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      })
      for (const t of iTags >= 0 ? splitTags(r[iTags]) : []) {
        const tagId = tagIds.get(t.toLowerCase())
        if (tagId) taggingRows.push({ tagId, recordType: 'company', recordId: id })
      }
      for (const [fieldId, value] of Object.entries(fv)) valueRows.push({ fieldId, recordId: id, value })
      imported++
    }
    const chunk = <T,>(arr: T[], n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
    for (const c of chunk(companyRows)) await db.insert(schema.companies).values(c)
    for (const c of chunk(taggingRows)) await db.insert(schema.taggings).values(c).onConflictDoNothing()
    for (const c of chunk(valueRows)) await db.insert(schema.fieldValues).values(c)
    for (const c of chunk(companyRows, 50)) {
      await db.batch(c.map((row) => activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'company', targetId: row.id, kind: 'created', body: 'Imported from CSV' })) as [never, ...never[]])
    }
    return { imported, skipped: errors.length, errors: errors.slice(0, 50) }
  })
