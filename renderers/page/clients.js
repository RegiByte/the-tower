/**
 * The bundled clients whose words the page draws. A user's extension can take over a bundled capability, and `/x/<cap>/`
 * then serves that extension's folder, which may hold no such file. The page goes on without what the file drew: a
 * file that exists and fails to load fails here, as any import does.
 */

import { clientOf } from '/lib/client.js'

/**
 * @typedef {typeof import('/x/quota/quota.js')} Quota
 * @typedef {typeof import('/x/drafts/drafts.js')} Drafts
 */

const [quota, drafts] = await Promise.all([
  /** @type {typeof clientOf<Quota>} */ (clientOf)('/x/quota/quota.js', { commandProbes: () => [] }),
  /** @type {typeof clientOf<Drafts>} */ (clientOf)('/x/drafts/drafts.js', { draftsOf: () => undefined, draftItem: () => undefined, draftTitles: () => ({ title: () => '', prune: () => {} }) }),
])

export const { commandProbes, PROBE_ATTENTION, probedLines, probeLine, probeTitle } = quota
export const { DRAFTS, discard, draftItem, draftPath, draftsOf, draftTitles, keepUnsent, openDraft, titleOf } = drafts
