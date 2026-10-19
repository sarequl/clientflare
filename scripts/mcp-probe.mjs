import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const token = process.argv[2]
const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), { requestInit: { headers: { authorization: `Bearer ${token}` } } })
const client = new Client({ name: 'probe', version: '0' })
await client.connect(transport)
const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))
const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); const text = r.content[0]?.text ?? ''; if (r.isError) console.log(`${name} ERROR:`, text.slice(0, 300)); return r.isError ? null : JSON.parse(text) }
const me = await call('whoami', {}); console.log('whoami:', me.user.email, me.workspace.name, me.role)
const co = await call('create_company', { name: 'Acme Co', website: 'https://acme.example' }); console.log('company:', co?.id)
const c = await call('create_contact', { firstName: 'Sam', lastName: 'Lee', email: 'sam@acme.example', companyId: co.id }); console.log('contact:', c?.id)
await call('log_activity', { targetType: 'contact', targetId: c.id, kind: 'call', body: 'Called Sam about the redesign' })
const stages = await call('list_stages', {}); console.log('stages:', stages.map((s) => s.name).join('/'))
const d = await call('create_deal', { title: 'Acme redesign', valueMinor: 250000, contactId: c.id, companyId: co.id }); console.log('deal:', d?.id, d?.currency, d?.valueMinor)
const moved = await call('move_deal', { id: d.id, stageId: stages[2].id }); console.log('moved:', moved?.stageId === stages[2].id, moved?.status)
const t = await call('create_task', { title: 'Send proposal', dueOn: '2026-10-24', dealId: d.id }); console.log('task:', t?.id, t?.assigneeUserId === me.user.id)
const inv = await call('create_invoice', { contactId: c.id, companyId: co.id, dealId: d.id, lines: [{ description: 'Design', quantityMilli: 10000, unitMinor: 15000 }] }); console.log('invoice:', inv?.invoice?.id, inv?.invoice?.status)
const got = await call('get_contact', { id: c.id }); console.log('timeline kinds:', got.timeline.map((a) => a.kind).join(','))
const s = await call('search', { q: 'acme' }); console.log('search hits:', JSON.stringify(s).length > 10)
const tasks = await call('list_tasks', { view: 'upcoming' }); console.log('upcoming tasks:', tasks.rows.length)
const bad = await client.callTool({ name: 'get_contact', arguments: { id: 'nope' } }); console.log('missing contact isError:', bad.isError ?? false, bad.content[0]?.text?.slice(0, 60))
await client.close()
