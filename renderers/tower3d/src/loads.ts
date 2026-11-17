import type { Tower } from './api.ts'
import { loadKit, type Kit } from './kit.ts'
import { loadModels, type Models } from './models.ts'
import type { Renderer } from '/lib/board.js'
import { loadFaces } from './toon.ts'

/**
 * What every floor draws, loading: the models, the kit and the faces, with the viewer's kept spot and the renderer's
 * declared settings. `loaded` settles once all are in; the page reads its viewer and its board meanwhile, so a page
 * opened behind another tab, where the loads wait for it to show, still hears the board (decision `tower3d-start`).
 */
export function startAssets({ tower }: { tower: Tower }) {
  let landed: Loaded | undefined
  /** Settles with what loaded once `got` holds it, so whatever runs on it reads `got` too. */
  const loaded = Promise.all([loadModels(), tower.recall(), loadFaces(), loadKit(), tower.renderer()]).then(([models, kept, , kit, declared]) => (landed = { models, kept, kit, declared }))
  // The feed handles a failed load (feed.ts#failStart), but only once it is imported, after most other resources have
  // started; one that fails first skips the feed, and the loading screen already says why.
  loaded.catch(() => {})
  /** What loaded, once it has: before, nothing has drawn a board, and a reader that can run then says what it does without. */
  const got = () => landed
  return { loaded, got }
}

export type Assets = ReturnType<typeof startAssets>

/** What every floor draws by, as loaded: the models, the kit, the viewer's kept record and the renderer's declared settings. */
export type Loaded = { models: Models; kept: unknown; kit: Kit; declared: Renderer | null }
