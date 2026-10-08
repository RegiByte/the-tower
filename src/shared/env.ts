/**
 * A parent Claude Code session marks its descendants' environment. A Claude spawned with those
 * markers believes it is a child session: it stops saving its transcript, and it inherits the
 * parent's messaging socket and token. A parent managed session also marks them with its own id
 * (`TOWER_SESSION_ID`), which makes every descendant one of that session's leftovers.
 */
const PARENT_SESSION_VARS = new Set([
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_EXECPATH',
  'TOWER_SESSION_ID', 'TOWER_HOOKS_SOCKET',
])
const PARENT_SESSION_PREFIXES = ['CLAUDE_CODE_SESSION', 'CLAUDE_CODE_CHILD', 'CLAUDE_CODE_MESSAGING']

const isParentSessionVar = (key: string): boolean =>
  PARENT_SESSION_VARS.has(key) || PARENT_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))

export const withoutParentSession = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !isParentSessionVar(entry[0])))
