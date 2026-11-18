/**
 * The local services opencode's scenarios reach, so a failed turn, a retry and a compaction happen on cue rather than
 * when a real provider happens to refuse: an OpenAI-compatible provider (`fixture` in a scenario's `opencode.json`) and
 * an MCP server that asks for an OAuth login. Both listen on a port the system picks, in the runner's own process, so
 * they stop with it.
 *
 * The provider's models: `fail` refuses every request (400); `retry` is overloaded (503, retry after 2 s) for the first
 * two takes of a request within a minute, then answers; `big` answers with a usage near its 32k context, so the next
 * turn compacts first, and answers the compaction with a summary in opencode's template; `badsummary` does the same but
 * answers the compaction off the template, which fails it.
 */
import { createHash } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Services } from './runtime-check.scenario.ts'

/** What opencode's compaction request asks for: a summary under its template's first heading. */
const TEMPLATE = '## Objective'
const SUMMARY_DONE = 'SUMMARYDONE'
const RETRY_WINDOW_MS = 60_000

const chunk = (delta: Record<string, unknown>, finish: string | null, usage?: Record<string, number>) =>
  `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage && { usage }) })}\n\n`

const usage = (prompt: number) => ({ prompt_tokens: prompt, completion_tokens: 5, total_tokens: prompt + 5 })

const refused = (res: http.ServerResponse, status: number, message: string, type: string, headers: Record<string, string> = {}) =>
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify({ error: { message, type } }))

function streamed(res: http.ServerResponse, text: string, promptTokens: number) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.write(chunk({ role: 'assistant', content: text }, null))
  res.write(chunk({}, 'stop', usage(promptTokens)))
  res.end('data: [DONE]\n\n')
}

function provider(): http.Server {
  const takes = new Map<string, { first: number; n: number }>()
  return http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const { model } = body ? (JSON.parse(body) as { model?: string }) : {}
      if (model === 'fail') return refused(res, 400, 'The fixture model refuses every request.', 'invalid_request_error')
      if (model === 'retry') {
        const key = createHash('sha256').update(body).digest('hex')
        const now = Date.now()
        const take = takes.get(key)
        const current = take && now - take.first < RETRY_WINDOW_MS ? take : { first: now, n: 0 }
        takes.set(key, { ...current, n: current.n + 1 })
        if (current.n < 2) return refused(res, 503, 'The fixture model is overloaded.', 'server_error', { 'retry-after': '2' })
      }
      const compacting = (model === 'big' || model === 'badsummary') && body.includes(TEMPLATE) && !body.includes(SUMMARY_DONE)
      if (compacting && model === 'big') return streamed(res, `${TEMPLATE}\n- Greet the user. ${SUMMARY_DONE}\n\n## Next Move\n1. (none)\n`, 900)
      if (compacting) return streamed(res, 'A summary that keeps to no template.', 900)
      const full = (model === 'big' || model === 'badsummary') && !body.includes(SUMMARY_DONE)
      return streamed(res, 'Fine, after a wait.', full ? 30_000 : 900)
    })
  })
}

/** An MCP endpoint that answers 401 with a pointer to its resource metadata, naming itself as the auth server. */
function oauthMcp(): http.Server {
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const json = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (req.url?.startsWith('/.well-known/oauth-protected-resource')) return json(200, { resource: `${base}/mcp`, authorization_servers: [base] })
    if (req.url?.startsWith('/.well-known/oauth-authorization-server'))
      return json(200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] })
    if (req.url?.startsWith('/register')) return json(201, { client_id: 'runtime-check', redirect_uris: [] })
    res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` }).end()
  })
  return server
}

const listening = (server: http.Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))

const closed = (server: http.Server) => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))

/** Both services listening: `{provider}` and `{mcp}` are their ports. */
export async function fakes(): Promise<Services> {
  const servers = { provider: provider(), mcp: oauthMcp() }
  const vars = Object.fromEntries(await Promise.all(Object.entries(servers).map(async ([name, server]) => [name, String(await listening(server))])))
  return {
    vars,
    close: async () => {
      for (const server of Object.values(servers)) server.closeAllConnections()
      await Promise.all(Object.values(servers).map(closed))
    },
  }
}
