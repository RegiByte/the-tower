/**
 * Which checkout a system's daemons run from, against the one this command runs from. A daemon starts with its
 * checkout as its working directory, so a running process says where it came from and nothing has to record it.
 * Same-user processes are trusted: this catches a slip, a second checkout acting on the system of the first.
 */

/** A running daemon's checkout, or why it can't be told. */
export type DaemonCheckout = { t: 'read'; name: string; checkout: string } | { t: 'unreadable'; name: string; why: string }

/** The daemons not known to run from `here`: one whose checkout can't be read isn't taken to be fine. */
export const notHere = (running: DaemonCheckout[], here: string): DaemonCheckout[] => running.filter((r) => r.t === 'unreadable' || r.checkout !== here)

/** What `notHere` found, in a line. */
export const notHereLine = (elsewhere: DaemonCheckout[], here: string): string =>
  `${elsewhere.map((r) => (r.t === 'read' ? `${r.name} runs from ${r.checkout}` : `${r.name} is running, but its checkout can't be read: ${r.why}`)).join('; ')}; this checkout is ${here}`

const towerAt = (checkout: string) => `${checkout}/src/mod/bin/tower`

/**
 * Why `tower update` must not run from `here`, given the daemons it would restart, with what to do instead. Updating
 * the other checkout is offered only when that alone would pass. Moving the daemons here always works, since stopping
 * them leaves nothing to compare.
 */
export const updateRefusal = (running: DaemonCheckout[], here: string): { message: string; fix: string } | undefined => {
  const elsewhere = notHere(running, here)
  if (!elsewhere.length) return undefined
  const checkouts = new Set(running.map((r) => (r.t === 'read' ? r.checkout : undefined)))
  const [only] = checkouts
  const names = running.map((r) => r.name).join(' ')
  const moveHere = `to run them from this checkout instead, which ends any running job: ${towerAt(here)} down ${names}, then ${towerAt(here)} up ${names}`
  return {
    message: `update refused, since it would restart these from here: ${notHereLine(elsewhere, here)}`,
    fix: checkouts.size === 1 && only !== undefined ? `update where they run: ${towerAt(only)} update; or ${moveHere}` : moveHere,
  }
}
