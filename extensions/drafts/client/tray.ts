import { ICON } from '../../../src/shared/icons.ts'
import { mountKeptTray } from '../../../src/shared/items.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { draftTitles } from './drafts.ts'

/**
 * `drafts/tray`, the drafts collection in a floor's row of trays: its count, unfolding to the newest drafts by their
 * first line, a `+` opening a new one in the drafts editor.
 */
export const mount: Mount = (host, ctx) =>
  mountKeptTray(host, ctx, 'drafts/tray', {
    icon: ICON.draft,
    titles: (_, read, onText) => draftTitles(read, onText).title,
    actions: `<button data-act="new" aria-label="new draft" data-tip="new draft">${ICON.plus}</button>`,
    act: () => ctx.kit.display(ctx.subject.key, { view: 'drafts/editor' }),
  })
