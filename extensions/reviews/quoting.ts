/**
 * A note's anchors as a worker types them, `repo:path:from-to`, and the lines each quotes, read from the checkout's
 * files as they are now. The tower and the checkouts share a machine, so a note is quoted where its files are, whoever
 * runs the command.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { apiError, type ApiError } from '/lib/extension.js'
import { checkoutDirs, langOf, repoName } from '/lib/files.js'
import type { Floor } from '/lib/board.js'
import type { Anchor } from './client/reviews.ts'

const ANCHOR = /^([^:\s]+):(.+):(\d+)(?:-(\d+))?$/

/** The anchor `text` names; `undefined` for text that names none. */
export const parseAnchor = (text: string): Omit<Anchor, 'quote'> | undefined => {
  const [, repo, file, from, to] = ANCHOR.exec(text) ?? []
  return repo === undefined ? undefined : { repo, path: file, from: Number(from), to: Number(to ?? from) }
}

/** The repos a note's anchors on `checkout` name, in the form `--at` takes. */
export const anchorLine = (floor: Floor, checkout: string): string =>
  `A note's anchors name one of the checkout's repos: ${checkoutDirs(floor, checkout).map((d) => `${repoName(d)}:<path>:<from>-<to>`).join(', ')}.`

/** An anchor with its lines, read from `checkout`'s copy of its repo. */
export const quotedAnchor = (floor: Floor, checkout: string, anchor: Omit<Anchor, 'quote'>): Anchor | ApiError => {
  const dirs = checkoutDirs(floor, checkout)
  const dir = dirs.find((d) => repoName(d) === anchor.repo)
  if (!dir) return apiError('invalid', `Checkout ${checkout} has no repo "${anchor.repo}": it has ${dirs.map(repoName).join(', ')}`)
  const file = path.join(dir, anchor.path)
  if (!existsSync(file)) return apiError('not_found', `No file at ${file}`)
  const text = readFileSync(file, 'utf8')
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
  if (anchor.from > anchor.to || anchor.to > lines.length) return apiError('invalid', `${anchor.repo}:${anchor.path} has ${lines.length} lines: ${anchor.from}-${anchor.to} isn't a range of them`)
  return { ...anchor, quote: { lang: langOf(anchor.path), lines: lines.slice(anchor.from - 1, anchor.to) } }
}
