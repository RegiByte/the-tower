/**
 * The opencode releases the tower is tested on, and the surfaces of opencode's it reads. opencode's v2 plugin API and
 * bus events change between minor releases, so a session outside the range is flagged (`card.runtimeUntested`,
 * `board.runtimes.opencode.untested`). Only v2 is supported: a v1 opencode refuses the tower's plugin.
 */
import type { TestedRange } from './claude.ts'

/** The releases recorded with every surface below checked, both included: 2.2.5 is the one the fixtures hold. */
export const OPENCODE_TESTED: TestedRange = { lowest: '2.2.5', highest: '2.2.5' }

/** What a renderer prints for opencode's runtime instead of naming it. */
export const OPENCODE_LABEL = 'opencode'

/** What the tower reads of opencode's, each where it is read: what to check again before the range moves. */
export const OPENCODE_SURFACES: { surface: string; read: string }[] = [
  { surface: 'the v2 plugin API: setup(ctx), ctx.event.subscribe, ctx.tool/shell/session hooks, ctx.model.list, ctx.mcp.list, ctx.session.get, ctx.options', read: 'src/mod/opencode/index.js' },
  { surface: 'bus events (session.*, permission.*, form.*, location.shutdown) and their data fields', read: 'src/bridge/runtimes/opencode.ts' },
  { surface: 'config keys read from OPENCODE_CONFIG_CONTENT (plugins, skills, model with #variant) and XDG_STATE_HOME', read: 'src/shared/launch-opencode.ts' },
  { surface: 'the root command flags --standalone, -s and --prompt', read: 'src/shared/launch-opencode.ts' },
]
