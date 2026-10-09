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

const without = (env: NodeJS.ProcessEnv, drops: (key: string) => boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drops(entry[0])))

export const withoutParentSession = (env: NodeJS.ProcessEnv): Record<string, string> => without(env, isParentSessionVar)

/**
 * The terminal a process was started from names itself in its environment, and programs tune themselves to it:
 * Claude reads `TERM_PROGRAM=vscode` or Cursor's askpass path as an editor's xterm.js and changes how it scrolls,
 * `TMUX` as tmux. A PTY the tower draws is in the viewer's xterm, whatever terminal ran `tower up`. VS Code and Cursor
 * point `GIT_ASKPASS` at a script that reaches the running editor through their `VSCODE_GIT_*` variables, so it goes
 * with them.
 */
const TERMINAL_VARS = new Set([
  'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TERM_SESSION_ID', 'TERMINAL_EMULATOR', 'LC_TERMINAL', 'LC_TERMINAL_VERSION', 'COLORFGBG',
  'GIT_ASKPASS', 'WT_SESSION', 'WT_PROFILE_ID', 'VTE_VERSION', 'WINDOWID', 'TMUX', 'TMUX_PANE', 'STY',
])
const TERMINAL_PREFIXES = ['VSCODE_', 'CURSOR_', 'ITERM_', 'WEZTERM_', 'GHOSTTY_', 'KITTY_', 'ALACRITTY_', 'KONSOLE_', 'WARP_', 'ZELLIJ']

const isTerminalVar = (key: string): boolean => TERMINAL_VARS.has(key) || TERMINAL_PREFIXES.some((prefix) => key.startsWith(prefix))

/** An environment for a PTY the tower draws, without the terminal its daemon was started from. */
export const withoutTerminal = (env: NodeJS.ProcessEnv): Record<string, string> => without(env, isTerminalVar)
