import type { Tower } from './api.ts'
import { loadKit } from './kit.ts'
import { loadModels } from './models.ts'
import { loadFaces } from './toon.ts'

/**
 * What every floor draws, loading: the models, the kit and the faces, with the viewer's kept spot and the renderer's
 * declared settings. `loaded` settles once all are in; the page reads its viewer and its board meanwhile, so a page
 * opened behind another tab, where the loads wait for it to show, still hears the board (decision `tower3d-start`).
 */
export function startAssets({ tower }: { tower: Tower }) {
  const loaded = Promise.all([loadModels(), tower.recall(), loadFaces(), loadKit(), tower.renderer()]).then(([models, kept, , kit, declared]) => ({ models, kept, kit, declared }))
  // The feed handles a failed load (feed.ts#failStart), but only once it is imported, after most other resources have
  // started; one that fails first skips the feed, and the loading screen already says why.
  loaded.catch(() => {})
  return { loaded }
}

export type Assets = ReturnType<typeof startAssets>
