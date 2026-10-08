/**
 * Posts Claude Code events to the host, which appends each to the session's log as an `h` event named by
 * `hook_event_name`. An event under Claude's name carries Claude's input for it, and Claude's result under
 * `result` where the hook awaits one (`tool.check` leaves out the tool input that its `tool.call` carries,
 * and `session.compact` counts the messages it summarizes, which hold the whole conversation).
 * What this mod derives is posted under `tower.*` (`tower.claude`: the release of Claude the session runs, as it starts). Each hook awaits its post, so events reach the log in the
 * order Claude raised them.
 */

/**
 * Tool calls whose event was abandoned (the user denied the permission, or interrupted the turn), until the
 * `turn.complete` of their loop. An abandoned event cancels the mods API calls made within it, so the call
 * can't be posted when it settles.
 */
let abandoned = []

async function forward($, name, data) {
  const socketPath = await $.env.get('TOWER_HOOKS_SOCKET')
  const sessionId = await $.env.get('TOWER_SESSION_ID')
  const response = await $.http.fetch(`http://host/hooks/${sessionId}`, {
    method: 'POST',
    socketPath,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, hook_event_name: name }),
  })
  if (!response.ok) throw new Error(`host answered ${response.status} to ${name}`)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await forward($, 'session.start', e)
    const result = await next(e)
    await forward($, 'tower.claude', await $.session.version())
    return result
  })
  on('session.end', async ($, e, next) => {
    await forward($, 'session.end', e)
    return next(e)
  })
  on('session.compact', async ($, e, next) => {
    await forward($, 'session.compact', { trigger: e.trigger, instructions: e.instructions, messageCount: e.messages.length })
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await forward($, 'session.measure', e)
    return next(e)
  })
  on('session.attach', async ($, e, next) => {
    await forward($, 'session.attach', e)
    return next(e)
  })
  on('session.detach', async ($, e, next) => {
    await forward($, 'session.detach', e)
    return next(e)
  })
  on('session.receive', async ($, e, next) => {
    await forward($, 'session.receive', e)
    return next(e)
  })
  on('session.send', async ($, e, next) => {
    await forward($, 'session.send', e)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    await forward($, 'prompt.submit', e)
    return next(e)
  })
  on('command.run', async ($, e, next) => {
    await forward($, 'command.run', e)
    return next(e)
  })
  on('agent.spawn', async ($, e, next) => {
    await forward($, 'agent.spawn', e)
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    await forward($, 'turn.start', e)
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!next.signal.aborted) await forward($, 'turn.step', { ...e, result: { stopReason: result.stopReason, usage: result.usage, answer: result.answer } })
    return result
  })
  on('turn.complete', async ($, e, next) => {
    for (const call of abandoned.filter((call) => call.agentId === e.agentId)) {
      await forward($, 'tower.tool.abandoned', { ...call, turnId: e.turnId })
    }
    abandoned = abandoned.filter((call) => call.agentId !== e.agentId)
    await forward($, 'turn.complete', e)
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    await forward($, 'tool.call', e)
    const result = await next(e)
    if (next.signal.aborted) abandoned.push({ tool: e.tool, tool_use_id: e.tool_use_id, agentId: e.agentId })
    else await forward($, 'tower.tool.result', { tool: e.tool, tool_use_id: e.tool_use_id, agentId: e.agentId, deny: result.deny, isError: result.isError })
    return result
  })
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    await forward($, 'tool.check', { tool: e.tool, tool_use_id: e.tool_use_id, result })
    return result
  })
}
