/**
 * The Claude Code releases the tower is tested on, and the surfaces of Claude's it reads. When Claude changes one of
 * them the board goes quietly wrong rather than failing, so a session outside the range is flagged (`card.claude`,
 * `board.claudeUntested`) and the installed Claude is checked against it. Moving the range: runbook
 * `new-claude-release`.
 */

/**
 * The lowest and the highest release the tower ran on with every surface below checked, both included. The fixtures
 * reach back to 2.1.287, but the mods API's `$.session.version` was first checked on 2.1.292.
 */
export const CLAUDE_TESTED = { lowest: '2.1.292', highest: '2.1.296' }

/** What the tower reads of Claude's, each where it is read: what to check again before the range moves. */
export const CLAUDE_SURFACES: { surface: string; read: string }[] = [
  { surface: 'mod events (session, prompt, turn, tool) and their payloads', read: 'src/mod/hooks/register.js, src/bridge/facts.ts, src/bridge/status.ts' },
  { surface: 'the mods API: $.env, $.http.fetch over a unix socket, $.session.version', read: 'src/mod/hooks/register.js' },
  { surface: 'classic hook events and their payload fields (session_id, source, notification_type, background_tasks, session_crons)', read: 'src/mod/hooks/hooks.json, src/bridge/conversation.ts, src/bridge/status.ts' },
  { surface: "the trust and sign-in screens' text", read: 'src/bridge/blocked.ts' },
  { surface: 'bracketed pastes kept short enough to stay out of the pasted-content wrapping', read: 'src/machine.ts' },
  { surface: 'the peer registry ~/.claude/sessions/<pid>.json', read: 'src/machine.ts, src/bridge/resources.ts' },
  { surface: 'a transcript saved with the first prompt, so a conversation can be resumed', read: 'src/bridge/conversation.ts' },
  { surface: "the tui: fullscreen setting: the alternate screen and SGR mouse reports, so a viewer's wheel scrolls Claude's transcript", read: 'src/shared/launch.ts' },
]

/** A release's `major.minor.patch`; anything after it (`-dev…`) is the build, not the release. */
const releaseOf = (version: string): number[] => version.split(/[-\s]/)[0].split('.').map(Number)

const compare = (a: number[], b: number[]) => a.map((n, i) => n - b[i]).find((d) => d !== 0) ?? 0

/** Where a version stands against the tested range: `unknown` when it doesn't read as a release. */
export const claudeRange = (version: string): 'below' | 'tested' | 'above' | 'unknown' => {
  const release = releaseOf(version)
  if (release.length !== 3 || release.some(Number.isNaN)) return 'unknown'
  if (compare(release, releaseOf(CLAUDE_TESTED.lowest)) < 0) return 'below'
  if (compare(release, releaseOf(CLAUDE_TESTED.highest)) > 0) return 'above'
  return 'tested'
}

/** Why a session's Claude is flagged, and what ends it. */
export const CLAUDE_UNTESTED = `the tower is tested on Claude Code ${CLAUDE_TESTED.lowest} to ${CLAUDE_TESTED.highest}: another release may change what the tower reads, and the board can go quietly wrong (a worker stuck working, waits that never come)`
