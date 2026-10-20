# Security

Clientflare stores client data, invoices and personal finance records, so security reports matter.

**Report privately** through GitHub: [Security → Report a vulnerability](https://github.com/sarequl/clientflare/security/advisories/new). Please don't open a public issue for anything exploitable.

You'll get a reply within a few days. Fixes ship as a patch release with a note in the changelog; credit goes to the reporter unless they'd rather stay anonymous.

## Scope

- The app itself (`src/`), the MCP endpoint, the client portal and the public invoice pages.
- Out of scope: the Cloudflare platform, third-party services (Resend), and findings that require an already-compromised Cloudflare account.

## Self-hosting notes

Each deployment is one Cloudflare account owned by whoever deployed it. Keep `BETTER_AUTH_SECRET` secret, rotate API tokens you no longer use (Settings → API & MCP), and keep your deployment on a recent release.
