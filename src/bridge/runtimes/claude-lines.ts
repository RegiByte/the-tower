/** Claude Code's log lines as the tail reads them, before they are parsed: a server's reading, on its bytes. */
import type { LogEvent } from '../../shared/model.ts'

const HOOK_NAME = '"hook_event_name":"'
const POST_TOOL_USE = `${HOOK_NAME}PostToolUse"`
const AGENT_ID = /"agent_id":"([^"]*)"/

/**
 * A hook line's own event is `PostToolUse` when the payload's first `hook_event_name` key says so and no object opens
 * before it: the key can't sit inside a string with its quotes unescaped, so it is a key of the payload itself.
 */
const isPostToolUse = (line: Buffer): boolean => {
  const name = line.indexOf(HOOK_NAME)
  return name !== -1 && line.toString('latin1', name, name + POST_TOOL_USE.length) === POST_TOOL_USE && line.lastIndexOf('{', name) === line.indexOf('{')
}

/** Of a `PostToolUse`, only its name and its subagent, its tool's input unread: the rest is parsed whole. */
export const skimClaude = (line: Buffer): LogEvent | undefined => {
  if (!isPostToolUse(line)) return undefined
  const agent = AGENT_ID.exec(line.toString('latin1', 0, line.indexOf(HOOK_NAME)))?.[1]
  return [Number(line.subarray(1, line.indexOf(',')).toString()), 'h', { hook_event_name: 'PostToolUse', ...(agent && { agent_id: agent }) }]
}
