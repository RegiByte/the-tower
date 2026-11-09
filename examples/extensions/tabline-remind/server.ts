/**
 * Tab line, reminded: tab line's card line, and a launch contributor that reminds the workers of it, by the floor's
 * `remind` setting. `start` puts the line's instructions in the brief of every worker started, resumed or forked, with
 * the line it carries over. `prompt` does that too, and turns on the plugin's hook, which reminds the worker at each
 * prompt.
 */
import type { LaunchParts, LaunchRequest, Start } from '/lib/extension.js'

/** How hard the workers are reminded: the manifest's `settings.remind`. */
export type Remind = 'start' | 'prompt'

/** The env key the plugin's hook reads: it reminds only when it holds `prompt`. */
export const REMIND_ENV = 'TOWER_TABLINE_REMIND'

const HOW =
  '- Your tab line: a few words under your card saying what you are on, read by the user at a glance. Set it as you ' +
  "start a task and when the task changes: `tower x tabline facts/line --value '<a few words>'`, in the words " +
  "`tower x tabline` asks for (read it once). Keep it when you go idle: it then says what you last worked on."

/** The line the worker carries over from earlier in its lineage: the newest written, none when that was blank. */
export const carriedLine = (request: LaunchRequest): string | undefined => {
  const value = request.facts.filter((f) => f.name === 'line').at(-1)?.value
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** What a worker's launch carries for `remind`: pure over the request. */
export const launchOf = (remind: Remind, request: LaunchRequest): LaunchParts => {
  const line = carriedLine(request)
  const now = line ? ` It reads "${line}" now: change it when your task is no longer that.` : ' You have none yet.'
  return {
    systemPrompt: [HOW + now],
    ...(remind === 'prompt' && request.runtime === 'claude' ? { env: { [REMIND_ENV]: 'prompt' } } : {}),
  }
}

const start: Start = () => ({
  launch: (request, ctx) => launchOf((ctx.settings as { remind: Remind }).remind, request),
})

export default start
