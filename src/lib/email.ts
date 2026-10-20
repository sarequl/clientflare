import { env } from 'cloudflare:workers'
import { Resend } from 'resend'

type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string; cc?: string }

/**
 * Resend for v1. Swap this one function for Cloudflare Email Sending later.
 * With no RESEND_API_KEY set (local dev), mail is logged instead of sent.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${mail.to}${mail.cc ? ` cc=${mail.cc}` : ''} subject=${mail.subject}\n${mail.text}`)
    return
  }
  // RESEND_BASE_URL is only for pointing local dev at a stub; unset in production.
  const resend = new Resend(env.RESEND_API_KEY, env.RESEND_BASE_URL ? { baseUrl: env.RESEND_BASE_URL } : undefined)
  const { to, subject, html, text, replyTo, cc } = mail
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text, ...(replyTo ? { replyTo } : {}), ...(cc ? { cc } : {}) })
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

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * An invoice (or reminder) to a client. `message` is the sender's own text, so it is escaped;
 * line breaks are kept. `rows` are the summary lines under the message (number, total, due).
 */
export function invoiceMail(args: {
  to: string
  cc?: string
  replyTo?: string
  subject: string
  heading: string
  message: string
  rows: [label: string, value: string][]
  cta: string
  url: string
  from: string
}): Mail {
  const { to, cc, replyTo, subject, heading, message, rows, cta, url, from } = args
  const text = [heading, '', message, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `${cta}: ${url}`, '', from].join('\n')
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;color:#333;line-height:1.5">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
<h2 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h2>
${paragraphs}
<table style="border-collapse:collapse;margin:16px 0;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>
<p style="margin:20px 0"><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(cta)}</a></p>
<p style="color:#888;font-size:12px">Or paste this link: ${url}</p>
<p style="color:#888;font-size:12px;margin-top:24px">${escapeHtml(from)}</p>
</div>`
  return { to, cc, replyTo, subject, text, html }
}
