// The TUI part of the tower's opencode plugin: opencode's TUI loads it beside the server part (index.js) from the same
// directory. It shows the worker's callsign right-aligned above the composer, where Claude Code shows `--name`.
//
// It is plain calls into OpenTUI's Solid renderer, which opencode's TUI hands every plugin as `@opentui/solid`, rather
// than JSX, which would need a compile step. The TUI gets no options from the server's plugin entry, so the callsign
// comes from the session's env (`TOWER_CALLSIGN`, set by its launch).
import { createElement, effect, insert, setProp } from '@opentui/solid'

/** What this plugin reads of opencode's TUI plugin context (`@opencode/plugin/tui`'s `Context`). */
type Context = {
  theme: { text: { muted: unknown } }
  ui: { slot: (claim: { append: 'session.composer.top'; render: () => unknown }) => () => void }
}

const callsign = () => {
  const name = process.env.TOWER_CALLSIGN
  if (!name) throw new Error('TOWER_CALLSIGN is not set: this opencode session was not started by the tower')
  return name
}

/** `<box flexDirection="row" justifyContent="flex-end" paddingRight={1}><text fg={muted}>{name}</text></box>` */
const label = (context: Context, name: string) => {
  const row = createElement('box')
  setProp(row, 'flexDirection', 'row')
  setProp(row, 'justifyContent', 'flex-end')
  setProp(row, 'paddingRight', 1)
  const text = createElement('text')
  effect((previous) => setProp(text, 'fg', context.theme.text.muted, previous))
  insert(text, name)
  insert(row, text)
  return row
}

export default {
  id: 'tower.callsign',
  setup(context: Context) {
    const name = callsign()
    return context.ui.slot({ append: 'session.composer.top', render: () => label(context, name) })
  },
}
