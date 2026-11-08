import type { Board, Card } from './api.ts'
import type { RepoChanges } from '/lib/changes.js'
import type { AnchorStates } from '../../../extensions/reviews/client/reviews.ts'

/**
 * A fixture board's file (`fixtures/<name>.json`, written by `npm run tower3d:fixtures`): the boards the door's `advance`
 * delivers in order, each with its floors' archived cards as `GET /archive/<project>` would serve them, and what the page
 * reads beside them. `at` is the instant it was built at, the page's wall clock on the fixture.
 */
export type FixtureFile = {
  at: string
  boards: { board: Board; archive: Card[] }[]
  /** Review threads' texts, by `<project>/<id>`. */
  threads: Record<string, string>
  /** Drafts' texts, by `<project>/<id>`. */
  drafts: Record<string, string>
  /** Games' files, by `<project>/<id>`. */
  games: Record<string, string>
  /** A worker's Changes, by its session id. */
  changes: Record<string, RepoChanges[]>
  /** Where each worker's thread's anchors stand among its Changes, by its session id, as `reviews/anchors/<project>?card=<id>` answers. */
  anchors: Record<string, AnchorStates>
}
