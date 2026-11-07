/**
 * Which checkout a system's daemons run from, against the one this command runs from. A daemon starts with its
 * checkout as its working directory, so a running process says where it came from and nothing has to record it.
 * Same-user processes are trusted: this catches a slip, a second checkout acting on the system of the first.
 */

/**
 * A running daemon's checkout, or what stands in for it: `gone`, a checkout deleted while the daemon runs;
 * `unreadable`, a read that failed; `unowned`, a daemon that answers but that `tower up` didn't start, so no pid of
 * ours leads to it and `tower down` can't stop it.
 */
export type DaemonCheckout =
  | { t: 'read'; name: string; checkout: string }
  | { t: 'gone'; name: string; checkout: string }
  | { t: 'unreadable'; name: string; why: string }
  | { t: 'unowned'; name: string; where: string }

/** The daemons not known to run from `here`: one whose checkout can't be told isn't taken to be fine. */
export const notHere = (running: DaemonCheckout[], here: string): DaemonCheckout[] => running.filter((r) => r.t !== 'read' || r.checkout !== here)

const described = (r: DaemonCheckout): string => {
  if (r.t === 'read') return `${r.name} runs from ${r.checkout}`
  if (r.t === 'gone') return `${r.name} runs from ${r.checkout}, which no longer exists`
  if (r.t === 'unreadable') return `${r.name} is running, but its checkout can't be read: ${r.why}`
  return `${r.name} answers at ${r.where} but was not started by tower up from this system`
}

/** What `notHere` found, in a line. */
export const notHereLine = (elsewhere: DaemonCheckout[], here: string): string => `${elsewhere.map(described).join('; ')}; this checkout is ${here}`

const towerAt = (checkout: string) => `${checkout}/src/mod/bin/tower`

/** Moving `names` here: stopping them leaves nothing to compare, so this always works for a daemon `tower down` can stop. */
const moveHere = (names: string[], here: string): string => {
  const list = names.join(' ')
  return `to run ${names.join(' and ')} from this checkout${names.includes('jobs') ? ', which ends any running job' : ''}: ${towerAt(here)} down ${list}, then ${towerAt(here)} up ${list}`
}

/**
 * Why `tower update` must not run from `here`, given the daemons it would restart, with what to do instead. Updating
 * the other checkout is offered only when that alone would pass: every daemon read, in one checkout.
 */
export const updateRefusal = (running: DaemonCheckout[], here: string): { message: string; fix: string } | undefined => {
  const elsewhere = notHere(running, here)
  if (!elsewhere.length) return undefined
  const message = `update refused, since it would restart these from here: ${notHereLine(elsewhere, here)}`
  const unowned = elsewhere.filter((r) => r.t === 'unowned').map((r) => r.name)
  const movable = elsewhere.filter((r) => r.t !== 'unowned').map((r) => r.name)
  const reads = running.flatMap((r) => (r.t === 'read' ? [r.checkout] : []))
  if (reads.length === running.length && new Set(reads).size === 1) return { message, fix: `update where they run: ${towerAt(reads[0])} update; or ${moveHere(movable, here)}` }
  const steps = [...(unowned.length ? [`stop ${unowned.join(' and ')} where it runs`] : []), ...(movable.length ? [moveHere(movable, here)] : [])]
  return { message, fix: steps.join(', and ') }
}
