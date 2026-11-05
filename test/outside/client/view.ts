/** A client that runs anywhere but the checkout: the browser modules, `/tower.js` and an extension it wants. */
import '/tower.js'
import { attending } from '/lib/attend.js'
import { briefHtml } from '/lib/brief.js'
import { changedFiles } from '/lib/changes.js'
import { toaster } from '/lib/chrome.js'
import type { Tower } from '/lib/client.js'
import { chordLabel, DEFAULT_KEYS } from '/lib/keys.js'
import { actionId } from '/lib/layout.js'
import { rankPalette } from '/lib/palette.js'
import { settingsHtml } from '/lib/settings.js'
import { spawnDefaults } from '/lib/spawn.js'
import { mountTermView, type TermViewHandle } from '/lib/terminal.js'
import { closeHtml, type Mount } from '/lib/view.js'
import { readViewer } from '/lib/viewer.js'
import { DRAFTS } from '/x/drafts/drafts.js'

export const reach = [attending, briefHtml, changedFiles, toaster, chordLabel, actionId, rankPalette, settingsHtml, spawnDefaults, readViewer, DRAFTS]

const page: Tower = tower

export const mount: Mount = (host) => {
  const close = closeHtml(DEFAULT_KEYS)
  host.innerHTML = close
  const terminal: TermViewHandle | undefined = undefined
  return { update: () => void page.store.set('seen', [terminal, mountTermView]), close: () => host.remove() }
}
