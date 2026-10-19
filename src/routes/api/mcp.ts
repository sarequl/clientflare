import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '#/features/mcp/server'
import { requireSession } from '#/lib/session'

/**
 * Streamable HTTP MCP endpoint, stateless: one server + transport per request.
 * Auth is a personal token in `Authorization: Bearer cf_…` (Settings → API & MCP).
 */
async function handle(request: Request): Promise<Response> {
  if (!(request.headers.get('authorization') ?? '').toLowerCase().startsWith('bearer ')) {
    return Response.json({ error: 'Missing bearer token. Create one under Settings → API & MCP.' }, { status: 401, headers: { 'www-authenticate': 'Bearer' } })
  }
  try {
    await requireSession()
  } catch {
    return Response.json({ error: 'Invalid or revoked token.' }, { status: 401, headers: { 'www-authenticate': 'Bearer' } })
  }
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp')({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request), DELETE: ({ request }) => handle(request) } },
})
