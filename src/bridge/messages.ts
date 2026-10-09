/**
 * Who received each message a session sent another Claude session. A message is sent to a name or to a socket
 * (`uds:/tmp/cc-socks/<pid>.sock`, a reply to the `from` of one received), and the receiving session logs it as a
 * prompt: the session that logged the same text is the recipient, whatever the address said.
 */
import type { Session } from './facts.ts'

/** A message sent: when (epoch ms), the address it was sent to, and the session that received it, if one did. */
export type Delivery = { at: number; to: string; session?: string }

/** A message received: when (epoch ms), the digest of its text, and the session that sent it. */
export type Receipt = { at: number; digest: number; from: string }

const DELIVERY = /^<cross-session-message [^>]*?from-name="([^"]*)"[^>]*>\n([\s\S]*)\n<\/cross-session-message>$/

/**
 * A message from another Claude session as Claude delivers it, a prompt wrapping the text as sent: the sender's peer
 * name and that text. Other prompts of a peer's origin (a subagent's hand-back) are not one.
 */
export const delivered = (prompt: string): { name: string; text: string } | undefined => {
  const match = DELIVERY.exec(prompt)
  return match ? { name: match[1], text: match[2] } : undefined
}

/** Every message sent, oldest first, matched to the receipt of its text nearest in time. */
const matched = (sessions: Session[]) => {
  const receipts = sessions.flatMap(({ header, facts }) => facts.received.map(([at, digest]) => ({ at, digest, session: header.id })))
  const sends = sessions
    .flatMap(({ header, facts }) => facts.sent.map(([at, to, digest]) => ({ at, to, digest, from: header.id })))
    .sort((a, b) => a.at - b.at)
  const taken = new Set<(typeof receipts)[number]>()
  return sends.map((send) => {
    const receipt = receipts
      .filter((r) => r.digest === send.digest && r.session !== send.from && !taken.has(r))
      .reduce<(typeof receipts)[number] | undefined>((best, r) => (!best || Math.abs(r.at - send.at) < Math.abs(best.at - send.at) ? r : best), undefined)
    if (receipt) taken.add(receipt)
    return { send, receipt }
  })
}

/** Every session's sent messages, by session id, oldest first. */
export const deliveries = (sessions: Session[]): Map<string, Delivery[]> =>
  matched(sessions).reduce((bySession, { send, receipt }) =>
    bySession.set(send.from, [...(bySession.get(send.from) ?? []), { at: send.at, to: send.to, ...(receipt && { session: receipt.session }) }]), new Map<string, Delivery[]>())

/** Every session's received messages whose sender is known, by session id, oldest sent first. */
export const receipts = (sessions: Session[]): Map<string, Receipt[]> =>
  matched(sessions).reduce((bySession, { send, receipt }) =>
    receipt ? bySession.set(receipt.session, [...(bySession.get(receipt.session) ?? []), { at: receipt.at, digest: receipt.digest, from: send.from }]) : bySession, new Map<string, Receipt[]>())
