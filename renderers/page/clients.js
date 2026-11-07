/**
 * The bundled clients whose words the page draws. A user's extension can take over a bundled capability, and `/x/<cap>/`
 * then serves that extension's folder, which may hold no such file. The page goes on without what the file drew: a
 * file that exists and fails to load fails here, as any import does.
 */

/**
 * @typedef {typeof import('/x/quota/quota.js')} Quota
 * @typedef {typeof import('/x/drafts/drafts.js')} Drafts
 */

/**
 * The module at `url`, or `without` when the tower serves no such file: `without` holds only what the page calls with
 * the file gone. `DRAFTS` is left out so that no subject reads as a draft nobody holds.
 * @template T
 * @param {string} url @param {Partial<T>} without
 * @returns {Promise<T>}
 */
async function clientOf(url, without) {
  return import(url).catch(async (err) => {
    if ((await fetch(url)).status !== 404) throw err
    console.warn(`${url} is not served: its extension was replaced by one without it, and the page goes on without what it drew`)
    return without
  })
}

const [quota, drafts] = await Promise.all([
  /** @type {typeof clientOf<Quota>} */ (clientOf)('/x/quota/quota.js', { commandProbes: () => [] }),
  /** @type {typeof clientOf<Drafts>} */ (clientOf)('/x/drafts/drafts.js', { draftsOf: () => undefined, draftItem: () => undefined, draftTitles: () => ({ title: () => '', prune: () => {} }) }),
])

export const { commandProbes, PROBE_ATTENTION, probedLines, probeLine, probeTitle } = quota
export const { DRAFTS, discard, draftItem, draftPath, draftsOf, draftTitles, keepUnsent, openDraft, titleOf } = drafts
