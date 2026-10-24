import type { Card, Floor } from '../bridge/board.ts'
import type { Call } from './api.ts'
import { noun } from './format.ts'
import { callOf, can, noLongerOffered } from './offered.ts'
import { statusName } from './status-words.ts'
import { KILL_COST } from './tidy.ts'

/**
 * Taking stranded workers back on duty or letting them go, and sending a worker home: what a renderer asks first and
 * tells after.
 */

/** A floor's stranded workers, waiting to be resumed or let go, the first started first. */
export const strandedOf = (f: Floor) => f.cards.filter((c) => can(c, 'let-go') && can(c, 'resume')).sort((a, b) => a.startedAt - b.startedAt)

/** What letting a stranded worker go means, said before it is done. */
export const LET_GO_MEANS = "off duty, its desk freed: it moves to the floor's archive, where its conversation can still be resumed"

/** What a renderer asks before letting a worker go, and tells once it is done. */
export const letGoAsk = (c: Card) => `Let ${c.callsign} go?\n\nIt goes ${LET_GO_MEANS}.`
export const letGoneLine = (c: Card) => `Let ${c.callsign} go: it is in the archive`

/** What carrying on does, said where a renderer resumes a cut-off worker through its `carry-on`. */
export const CARRY_ON_MEANS = 'resume it on a prompt that tells it it was cut off mid-turn, and to carry on where it left off'

/** How a stranded worker is resumed with the rest of its floor: carried on when cut off mid-turn, else plainly. */
const resumeCallOf = (c: Card) => callOf(c, 'carry-on') ?? callOf(c, 'resume')

/** What a renderer asks before resuming every stranded worker of a floor (`strandedOf`), naming each and how it resumes. */
export const resumeAllAsk = (f: Floor, stranded: Card[]) =>
  `Resume ${stranded.length} stranded ${noun(stranded.length, 'worker')} on ${f.name}?\n\n${stranded.map((c) => `${c.callsign} · ${statusName(c)} · ${can(c, 'carry-on') ? 'carry on' : 'resume'}`).join('\n')}${
    stranded.some((c) => can(c, 'carry-on')) ? `\n\nCarry on: ${CARRY_ON_MEANS}.` : ''}`

/** Resumes each of `stranded` in turn through `run`, past any that fails, carrying on the cut-off; answers what to tell the user. */
export async function resumeStranded(stranded: Card[], run: (c: Call<'resume'>) => Promise<unknown>) {
  const failed: string[] = []
  for (const c of stranded) {
    const call = resumeCallOf(c)
    if (call) await run(call).catch((err: Error) => failed.push(`${c.callsign}: ${err.message}`))
    else failed.push(noLongerOffered(c.callsign, 'resume'))
  }
  return failed.length ? `Resumed ${stranded.length - failed.length} of ${stranded.length}; ${failed.join('; ')}` : `Resumed ${stranded.map((c) => c.callsign).join(', ')}`
}

/** What a renderer asks before sending `c` home with `sent`, those its `send-home` calls end, naming who is mid-turn. */
export const sendHomeAsk = (c: Card, sent: Card[]) => {
  const busy = sent.filter((h) => h.status === 'working')
  return `Send ${c.callsign} home${sent.length > 1 ? ' with everyone under it that runs' : ''}?\n\n${sent.map((h) => `${h.callsign} · ${statusName(h)}`).join('\n')}${
    busy.length ? `\n\n${busy.map((h) => h.callsign).join(', ')} ${busy.length === 1 ? 'is' : 'are'} working right now.` : ''}\n\n${sent.length > 1 ? 'Each stays' : 'It stays'} ${KILL_COST}.`
}
