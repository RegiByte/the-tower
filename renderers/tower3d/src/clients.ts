/**
 * The bundled extension clients whose words Tower 3D draws. A user's extension can take over a bundled capability, and
 * `/x/<cap>/` then serves that extension's folder, which may hold no such file. Tower 3D goes on without what the file
 * drew: `without` holds what is called with the file gone, and everything else is reached only past those readers. A
 * file that exists and fails to load fails here, as any import does.
 */

import { clientOf } from '/lib/client.js'

type Drafts = typeof import('/x/drafts/drafts.js')
type Quota = typeof import('/x/quota/quota.js')
type Reviews = typeof import('/x/reviews/reviews.js')
type Panel = typeof import('/x/reviews/panel.js')

const [drafts, quota, reviews, panel] = await Promise.all([
  clientOf<Drafts>('/x/drafts/drafts.js', { draftsOf: () => undefined, draftItem: () => undefined, draftTitles: () => ({ title: () => '', prune: () => {} }) }),
  clientOf<Quota>('/x/quota/quota.js', { commandProbes: () => [] }),
  clientOf<Reviews>('/x/reviews/reviews.js', { reviewerOf: () => undefined }),
  clientOf<Panel>('/x/reviews/panel.js', {
    cardReviews: () => undefined,
    floorThreadsOf: () => [],
    keepsThreads: () => false,
    threadCheckout: (c) => c.checkout,
  }),
])

export const {
  AUTOSAVE_MS, DRAFT_STATE, DRAFTS, discard, discardItem, draftItem, draftPath, draftState, draftsOf, draftTitles, edit, follow,
  keepsApart, keepUnsent, leave, newDraft, openDraft, readDraft, restore, save, sendable, settle, titleOf,
} = drafts
export const { commandProbes, PROBE_ATTENTION, PROBE_STATE_NAME, probedLines, probeTitle } = quota
export const { reviewerOf, THE_USER } = reviews
export const { cardReviews, floorThreadsOf, keepsThreads, threadCheckout } = panel
