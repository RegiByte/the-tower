import type { Attention } from '../bridge/life.ts'
import type { ExtensionProblem, ExtensionView, ProblemCode } from './extensions.ts'
import { plural } from './format.ts'

/** The extensions the tower found, in words: each one's state, its problems, and what fixes each. */

export const EXTENSION_STATE_NAME: Record<ExtensionView['state'], string> = { started: 'running', refused: 'refused', failed: 'failed to start', skipped: 'not started', off: 'off' }

/** An extension's state coloured by how much it asks of you: one that should run and doesn't is broken. */
export const EXTENSION_ATTENTION: Record<ExtensionView['state'], Attention> = { started: 'quiet', off: 'quiet', refused: 'broken', failed: 'broken', skipped: 'working' }

const PROBLEM_LEVEL_NAME: Record<ExtensionProblem['level'], string> = { error: 'error', warn: 'warning', info: 'note' }

/** What the user does about each problem. */
export const PROBLEM_FIX: Record<ProblemCode, string> = {
  invalid: 'fix what it names, in its extension.json or its config entry; tower config check shows the config side',
  mismatch: 'make start return only what its manifest declares',
  'too-new': 'tower update',
  'too-old': "read the CHANGELOG's notes for extensions at this major, then raise requires.tower",
  unmet: 'add an extension that provides what it requires, or turn it off: extensions.<id>.off',
  cycle: 'drop one requires or wants of the cycle, or one before or after of a chain',
  conflict: 'turn all providers but one off: extensions.<id>.off',
  skipped: 'fix what it requires first',
  failed: "the tower's log has the error: fix it, then tower down tower and tower up tower",
  'under-declared': 'raise requires.tower to the newest key it uses',
  'not-yet': 'nothing: a later tower reads it',
  threw: "the tower's log has the stack: fix the handler, the fold or the reduce",
  shape: 'make the handler answer what its reply schema says, and a fold return what its manifest declares, or fix the schema',
  deprecated: 'call what it names to use instead',
  slow: 'make its folds cheaper: fold from its reduced streams, never from files or the whole board',
  hook: "make the answer match the hook's answer schema; a throw's stack is in the tower's log",
  paused: 'make its board trigger ask for fewer calls: a call that changes the board triggers it again',
  contract: 'put back what its contract.json lists, or move its major and say what to use instead in its CHANGELOG.md',
}

/** An extension in a short line: `Pulse 1.0 · running`, its errors counted. */
export const extensionLine = (e: ExtensionView): string => {
  const errors = e.problems.filter((p) => p.level === 'error').length
  return [`${e.title}${e.version ? ` ${e.version}` : ''}`, EXTENSION_STATE_NAME[e.state], ...(errors ? [plural(errors, 'problem')] : [])].join(' · ')
}

/** A problem in a line: `invalid at settings.every: …`. */
export const problemLine = (p: ExtensionProblem): string => `${p.code}${p.path ? ` at ${p.path}` : ''}${p.subject ? ` on ${p.subject}` : ''}: ${p.message}`

/** An extension in full: who it is, what it provides, where it is off, and every problem. */
export const extensionTitle = (e: ExtensionView): string =>
  [
    `${e.id}${e.bundled ? ' (bundled)' : ''}, provides ${e.provides}: ${EXTENSION_STATE_NAME[e.state]}`,
    ...(e.off?.length ? [`off on ${e.off.join(', ')}`] : []),
    ...e.problems.map((p) => `${PROBLEM_LEVEL_NAME[p.level]}: ${problemLine(p)}`),
  ].join('\n')
