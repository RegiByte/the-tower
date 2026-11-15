// The tower's plugin for opencode v2 (tested >=2.2.5 <2.3.0), loaded into every opencode session the tower starts
// through the session's OPENCODE_CONFIG_CONTENT. It posts opencode's bus events to the tower host as they are, each an
// `h` line under its own type, so the log keeps what opencode said and the bridge's opencode normalizer reads it.
//
// Besides the events, it posts what the bus doesn't say: on start its release, whether it was reloaded and the models
// it can run, with their efforts and context limits (`plugin.started`); the tool a call runs, which only its
// `execute.before` hook names (`tool.execute.before`); and an MCP server's status (`mcp.status`). A subagent's session
// names its parent only on creation, so every line a child session raises carries the `parentID` opencode gave it; the
// subagent call's first report of its child session carries the child's `spawned` agent, title and model; a step's end
// carries the `model` its start named; and a session's usage carries the `total` cost of it and its subagents.
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

/** The session an event is about: a form names it inside the form. */
const sessionOf = (event) => event.data?.sessionID ?? event.data?.form?.sessionID

/** A step's end names no model: it carries the one its start named, so its tokens are counted against it. */
const withStepModel = (steps, event) =>
  event.type === 'session.step.ended' && steps.has(event.data.assistantMessageID) ? { ...event, model: steps.get(event.data.assistantMessageID) } : event

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

    /** A subagent's session as its creation describes it, until the call that runs it first reports it. */
    const children = new Map()
    const withSpawned = (event) => {
      const child = event.type === 'session.tool.progress' ? children.get(event.data.metadata?.sessionID) : undefined
      if (child === undefined) return event
      children.delete(event.data.metadata.sessionID)
      return { ...event, spawned: child }
    }
    /** Each session's cost so far: a session's usage carries its own and its subagents' summed. */
    const costs = new Map()
    const rootOf = (sessionID) => (parents.get(sessionID) === undefined ? sessionID : rootOf(parents.get(sessionID)))
    const withTotal = (event) => {
      if (event.type !== 'session.usage.updated') return event
      costs.set(event.data.sessionID, event.data.cost)
      const root = rootOf(event.data.sessionID)
      const total = [...costs].reduce((sum, [id, cost]) => (rootOf(id) === root ? sum + cost : sum), 0)
      return { ...event, total }
    }

    const steps = new Map()
    const abort = new AbortController()
    ;(async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
        if (SKIPPED.test(event.type)) continue
        if (event.type === 'session.created' && event.data.parentID !== undefined) {
          parents.set(event.data.sessionID, event.data.parentID)
          children.set(event.data.sessionID, { agent: event.data.agent, title: event.data.title, model: event.data.model })
        }
        if (event.type === 'session.step.started') steps.set(event.data.assistantMessageID, event.data.model)
        await parentOf(sessionOf(event))
        const line = withTotal(withSpawned(withStepModel(steps, withoutOutput(event))))
        await post(event.type, await withParent(sessionOf(event), line))
        if (event.type === 'session.step.ended' || event.type === 'session.step.failed') steps.delete(event.data.assistantMessageID)
        if (event.type === 'mcp.status.changed') {
          const server = (await ctx.mcp.list()).data.find((s) => s.name === event.data.server)
          await post('mcp.status', { server: event.data.server, status: server?.status })
        }
      }
    })().catch((err) => post('plugin.failed', { message: String(err?.stack ?? err) }))
    return () => abort.abort()
  },
}
