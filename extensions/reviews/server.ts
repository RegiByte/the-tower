/**
 * The reviews extension (decision `review-threads`): one append-only markdown thread per checkout in its owned
 * `reviews` collection, appended to through `reviews/append`, each floor's threads and each card's thread folded from
 * the parsed files and the core's checkouts, and the floor's history read.
 */
import type { Card, Floor } from '../../src/bridge/board.ts'
import type { RouteInput } from '../../src/shared/api.ts'
import type { CallCtx, Part, Start } from '../../src/shared/extensions.ts'
import { reviewHistory } from '../../src/bridge/reviews.ts'
import { parseThread, REVIEWS, type ReviewThread } from '../../src/shared/reviews.ts'

const start: Start = (ctx) => ({
  parse: { [REVIEWS]: (text: string): ReviewThread => parseThread(text) },
  folds: {
    card: (_card: Card): Part => ({}),
    floor: (_floor: Floor): Part => ({}),
  },
  verbs: {
    append: (input: RouteInput['review/append'], { call }: CallCtx) => call('tower/review/append', input),
  },
  reads: {
    'history/<project>': ({ params }: { params: Record<string, string> }) =>
      reviewHistory(ctx.collections.list(params.project, REVIEWS).map((item) => ({ id: item.id, thread: ctx.own.collections(params.project, REVIEWS).find((i) => i.id === item.id)?.parsed as ReviewThread }))),
  },
})

export default start
