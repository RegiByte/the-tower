// The tower's plugin for opencode v2 (tested >=2.2.5 <2.3.0), loaded into every opencode session the tower starts
// through the session's OPENCODE_CONFIG_CONTENT. It posts opencode's bus events to the tower host as they are, each an
// `h` line under its own type, so the log keeps what opencode said and the bridge's opencode normalizer reads it.
//
// Besides the events, it posts what the bus doesn't say: on start its release, whether it was reloaded and the models
// it can run, with their efforts and context limits (`plugin.started`); the tool a call runs, which only its
// `execute.before` hook names (`tool.execute.before`); and an MCP server's status (`mcp.status`). A subagent's session
// names its parent only on creation, so every line a child session raises carries the `parentID` opencode gave it.
//
// It also puts the tower command on every shell's PATH, and the tower's brief (its config option `brief`) on every
// request the model gets.
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../bin', import.meta.url))

/** Streaming deltas carry every token of text, and the boot's `*.updated` events say only that a list changed. */
const SKIPPED = /\.delta$|^session\.step\.streamed$|^(integration|provider|model|agent|command|skill|plugin|reference|mcp\.tools)\.updated$/

/** Posted once per server process: a later setup is the plugin reloaded mid-session. */
const STARTED = Symbol.for('tower.opencode.started')

async function post(name, data) {
  const response = await fetch(`http://host/hooks/${process.env.TOWER_SESSION_ID}`, {
    method: 'POST',
    unix: process.env.TOWER_HOOKS_SOCKET,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, hook_event_name: name }),
  })
  if (!response.ok) throw new Error(`the tower host answered ${response.status} to ${name}`)
}

/** A model as the tower offers it: `provider/model`, its variants (efforts), and its context window in tokens. */
const modelOf = (model) => ({ id: `${model.providerID}/${model.modelID ?? model.id}`, efforts: model.variants.map((v) => v.id), context: model.limit.context })

/**
 * A tool's output can hold anything it read (file contents, secrets in a `.env`) and is most of a log's bytes: opencode
 * keeps it in its own database.
 */
const withoutOutput = (event) => {
  if (event.type !== 'session.tool.success') return event
  const { content, ...data } = event.data
  return { ...event, data }
}

export default {
  id: 'tower',
  async setup(ctx) {
    const parents = new Map()
    const parentOf = async (sessionID) => {
      if (sessionID === undefined) return undefined
      if (!parents.has(sessionID)) parents.set(sessionID, (await ctx.session.get({ sessionID })).parentID)
      return parents.get(sessionID)
    }
    const withParent = async (sessionID, line) => {
      const parentID = await parentOf(sessionID)
      return parentID === undefined ? line : { ...line, parentID }
    }

    const reloaded = globalThis[STARTED] === true
    globalThis[STARTED] = true
    const { data: models } = await ctx.model.list()
    await post('plugin.started', { app: ctx.app, reloaded, models: models.map(modelOf) })

    await ctx.shell.hook('create.before', (input) => {
      input.env.PATH = `${BIN}:${input.env.PATH ?? process.env.PATH}`
    })
    if (ctx.options.brief) {
      await ctx.session.hook('context', (input) => {
        input.system.push({ type: 'text', text: ctx.options.brief })
      })
    }
    await ctx.tool.hook('execute.before', async ({ sessionID, id, tool, input }) => {
      await post('tool.execute.before', await withParent(sessionID, { sessionID, id, tool, input }))
    })

    const abort = new AbortController()
    ;(async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
        if (SKIPPED.test(event.type)) continue
        if (event.type === 'session.created' && event.data.parentID !== undefined) parents.set(event.data.sessionID, event.data.parentID)
        await post(event.type, await withParent(event.data?.sessionID, withoutOutput(event)))
        if (event.type === 'mcp.status.changed') {
          const server = (await ctx.mcp.list()).data.find((s) => s.name === event.data.server)
          await post('mcp.status', { server: event.data.server, status: server?.status })
        }
      }
    })().catch((err) => post('plugin.failed', { message: String(err?.stack ?? err) }))
    return () => abort.abort()
  },
}
