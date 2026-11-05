/** A server that runs anywhere but the checkout: the generic modules and `/lib/extension.js`, with its npm types its own. */
import { createHash } from 'node:crypto'
import { boardSubject, type Board } from '/lib/board.js'
import { tipsOf } from '/lib/capabilities.js'
import { BLOCKED_TEXT } from '/lib/cards.js'
import { palettes } from '/lib/design.js'
import { apiError, spawnProblems, type Start } from '/lib/extension.js'
import { repoName } from '/lib/files.js'
import { loop } from '/lib/machine.js'
import { markdownHtml } from '/lib/markdown.js'
import { hours } from '/lib/stats.js'
import { nextSlot } from '/lib/time.js'
import { esc } from '/lib/words.js'

/** `never` for an `any`: a package missing from the declarations turns every type it reaches into one, without an error. */
type Typed<T> = 0 extends 1 & T ? never : T
const typed = <T>(value: Typed<T>) => value

export const reach = [boardSubject, tipsOf, BLOCKED_TEXT, palettes, repoName, loop, markdownHtml, hours, nextSlot]

const start: Start = (ctx) => {
  const board: Board = typed(ctx.board())
  const problems = typed(spawnProblems({ cwd: 'hub' }))
  const refused = typed(apiError('invalid', problems.map((p) => p.message).join(', ')))
  return { reads: { said: () => esc(createHash('sha256').update(`${board.floors.length} ${refused.code}`).digest('hex')) } }
}

export default start
