import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { requireWorkspace, TOKEN_PREFIX } from '#/lib/session'
import { randomToken, sha256Hex } from '#/lib/tokens'

/** The caller's tokens for the active workspace. Never returns the secret. */
export const listApiTokens = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  return getDb().query.apiTokens.findMany({
    where: and(eq(schema.apiTokens.userId, ctx.user.id), eq(schema.apiTokens.workspaceId, ctx.workspaceId)),
    columns: { id: true, name: true, tokenPrefix: true, lastUsedAt: true, createdAt: true },
    orderBy: [desc(schema.apiTokens.createdAt)],
  })
})

/** Returns the plaintext token exactly once. */
export const createApiToken = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(60) }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const token = `${TOKEN_PREFIX}${randomToken(24)}`
    const id = newId()
    await getDb().insert(schema.apiTokens).values({
      id,
      userId: ctx.user.id,
      workspaceId: ctx.workspaceId,
      name: data.name,
      tokenHash: await sha256Hex(token),
      tokenPrefix: token.slice(0, 10),
      createdAt: new Date(),
    })
    return { id, token }
  })

export const revokeApiToken = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb()
      .delete(schema.apiTokens)
      .where(and(eq(schema.apiTokens.id, data.id), eq(schema.apiTokens.userId, ctx.user.id)))
    return { ok: true }
  })
