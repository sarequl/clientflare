// Secrets live in .dev.vars / Worker secrets, so `wrangler types` only sees them
// when .dev.vars exists. Declare them here so the types never silently vanish.
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    RESEND_API_KEY: string
    /** Optional dashboard variable; unset means "use the request's origin". */
    APP_URL?: string
    /** Dev only: send Resend API calls to a stub instead of api.resend.com. */
    RESEND_BASE_URL?: string
  }
}
