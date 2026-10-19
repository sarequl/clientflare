import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { runTaskReminders } from '#/features/tasks/server'

export default {
  fetch: (request) => handler.fetch(request),

  /** Hourly. Each workspace gets its digest at 08:00 local time. */
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(
      runTaskReminders(env.APP_URL).then((r) => console.log(`task reminders: sent ${r.sent}`)),
    )
  },
} satisfies ExportedHandler<Env>
