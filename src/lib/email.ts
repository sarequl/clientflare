import { env } from 'cloudflare:workers'
import { Resend } from 'resend'

type Mail = { to: string; subject: string; html: string; text: string }

/**
 * Resend for v1. Swap this one function for Cloudflare Email Sending later.
 * With no RESEND_API_KEY set (local dev), mail is logged instead of sent.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`)
    return
  }
  const resend = new Resend(env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...mail })
  if (error) throw new Error(`Resend: ${error.message}`)
}

export function linkMail(args: { to: string; subject: string; heading: string; body: string; cta: string; url: string }): Mail {
  const { to, subject, heading, body, cta, url } = args
  return {
    to,
    subject,
    text: `${heading}\n\n${body}\n\n${cta}: ${url}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">${heading}</h2>
<p style="color:#444">${body}</p>
<p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${cta}</a></p>
<p style="color:#888;font-size:12px">Or paste this link: ${url}</p>
</div>`,
  }
}
