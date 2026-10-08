/**
 * Claude's screens that hold a session before it starts: nothing happens until the user answers on the screen, and no
 * hook is raised while they show. `trust`: the workspace trust dialog, raised in every folder Claude hasn't been told to
 * trust (every new worktree). `login`: first-run setup and sign-in, raised when Claude has no account on this machine.
 */
export type BlockedKind = 'trust' | 'login'

/**
 * Matched against output with its escapes and whitespace removed: Claude draws the spaces between words as cursor
 * moves. A wording is matched within one write: Claude draws a screen in a write or two, so each screen has wordings
 * from different parts of it. Claude's copy changes between versions: keep every wording here.
 */
const SCREENS: [BlockedKind, RegExp][] = [
  ['trust', /Accessingworkspace:|Yes,Itrustthisfolder|Doyoutrustthefiles/],
  ['login', /Selectloginmethod|Choosethetextstyle|Pleaserun\/login/],
]

const ESCAPES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[^[\]()]/g

const compact = (output: string) => output.replace(ESCAPES, '').replace(/\s+/g, '')

/** The screen an output write draws, if it is one that blocks the session. */
export const blockedBy = (output: string): BlockedKind | undefined => {
  const text = compact(output)
  return SCREENS.find(([, screen]) => screen.test(text))?.[0]
}
