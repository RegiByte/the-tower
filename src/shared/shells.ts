import type { Board, Floor } from '../bridge/board.ts'
import { base } from './format.ts'

/** Shells in words: where one runs, and what killing it asks. */

/** Where a shell runs, by its floor's name: the hub alone, any other directory by its base name after. */
export const shellWhere = (f: Floor | undefined, sh: Board['shells'][number]) => `${f?.name ?? sh.project}${sh.cwd === f?.hub ? '' : '/' + base(sh.cwd)}`

/** What a renderer asks before killing a shell. */
export const killShellAsk = (f: Floor | undefined, sh: Board['shells'][number]) => `Kill the shell in ${shellWhere(f, sh)} (${sh.activity})?`
