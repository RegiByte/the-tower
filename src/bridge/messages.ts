/**
 * Who received each message a session sent another Claude session. A message is sent to a name or to a socket
 * (`uds:/tmp/cc-socks/<pid>.sock`, a reply to the `from` of one received), and the receiving session logs it as a
 * prompt: the session that logged the same text is the recipient, whatever the address said.
 */
import type { Session } from './facts.ts'

/** A message sent: when (epoch ms), the address it was sent to, and the session that received it, if one did. */
export type Delivery = { at: number; to: string; session?: string }

/** Every session's sent messages, by session id, oldest first; each matched to the receipt of its text nearest in time. */
export const deliveries = (sessions: Session[]): Map<string, Delivery[]> => {
  const receipts = sessions.flatMap(({ header, facts }) => facts.received.map(([at, digest]) => ({ at, digest, session: header.id })))
  const sends = sessions
    .flatMap(({ header, facts }) => facts.sent.map(([at, to, digest]) => ({ at, to, digest, from: header.id })))
    .sort((a, b) => a.at - b.at)
  const taken = new Set<(typeof receipts)[number]>()
  const delivered = sends.map((send) => {
    const receipt = receipts
      .filter((r) => r.digest === send.digest && r.session !== send.from && !taken.has(r))
      .reduce<(typeof receipts)[number] | undefined>((best, r) => (!best || Math.abs(r.at - send.at) < Math.abs(best.at - send.at) ? r : best), undefined)
    if (receipt) taken.add(receipt)
    return { from: send.from, delivery: { at: send.at, to: send.to, ...(receipt && { session: receipt.session }) } }
  })
  return delivered.reduce((bySession, { from, delivery }) => bySession.set(from, [...(bySession.get(from) ?? []), delivery]), new Map<string, Delivery[]>())
}
