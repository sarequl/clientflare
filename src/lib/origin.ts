import { AsyncLocalStorage } from 'node:async_hooks'
import { env } from 'cloudflare:workers'

/** Origin of the request being handled, set by the fetch handler in src/server.ts. */
export const originStore = new AsyncLocalStorage<string>()

/**
 * Public URL of this deployment, no trailing slash.
 * APP_URL wins when set; otherwise the origin of the current request.
 * Cron handlers have no request, so they read the origin stored per workspace instead.
 */
export function appOrigin(): string {
  const configured = env.APP_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  const fromRequest = originStore.getStore()
  if (fromRequest) return fromRequest
  throw new Error('APP_URL is not set and there is no request to infer it from')
}
