import type { Floor } from '../../../src/bridge/board.ts'
import { dismissing, esc } from '../../../src/shared/cards.ts'
import { fileCall } from '../../../src/shared/file-acts.ts'
import { drawPanel } from '../../../src/shared/panel-kit.ts'
import { panelsCss } from '../../../src/shared/panels-css.ts'
import { itemSubject } from '../../../src/shared/subjects.ts'
import { readViewer, VIEWER_KEYS } from '../../../src/shared/viewer.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { closeHtml, viewCss } from '../../../src/views/parts.ts'
import type { PolicyReplies } from '../policies.ts'
import { policiesHtml, policyDoneLine, type PolicyCall } from './panel.ts'
import { floorPolicies, POLICIES } from './policies.ts'
import { pressing } from '../../../src/shared/press.ts'

/**
 * `policies/policies`, the policies extension's view of a floor: its policies, the slots they offer and what needs the
 * user (the Policies panel), with Run now, Approve and Accept; an offer dismissed for this viewer as a wait is.
 */

const ID = 'policies/policies'

const STYLE = `${panelsCss}
${viewCss(
  ID,
  `& .policies-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--sp-l); background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }`,
)}`

export const mount: Mount = async (host, { tower, board: first, subject, kit }) => {
  let board = first
  const project = (subject.value as Floor).id
  const floor = () => board.floors.find((f) => f.id === project) as Floor
  let dismissed = new Set((await readViewer(tower.store.get)).dismissed)

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="policies-body"></div>`
  const [head, body] = [host.querySelector<HTMLElement>('.shelf-head')!, host.querySelector<HTMLElement>('.policies-body')!]

  const draw = () => {
    const html = `<span class="label">Policies</span><span class="dim">${esc(floor().name)}</span><span class="actions">${closeHtml(board.keys)}</span>`
    if (head.innerHTML !== html) head.innerHTML = html
    drawPanel(body, policiesHtml({ board, floor: floor(), now: Date.now(), dismissed }), {})
  }

  /** A policy's Run now or Approve, or an offer's Accept: a run started opens its worker once the board carries it. */
  const policyCall = async (button: Element, call: PolicyCall) => {
    const { policy } = call[1] as { policy: string }
    const title = floorPolicies(floor()).policies.find((p) => p.id === policy)?.title ?? policy
    const reply = await pressing(button, () => tower.call(call[0] as never, call[1] as never) as Promise<PolicyReplies[keyof PolicyReplies]>).catch((err: Error) => void kit.toast(err.message))
    if (!reply) return
    kit.toast(policyDoneLine(call, title, reply))
    if (call[0] === 'policies/run') kit.display(`card:${(reply as PolicyReplies['policies/run']).id}`)
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    if (target.closest('[data-home]')) return kit.display('board')
    const call = target.closest<HTMLElement>('[data-policy-call]')
    if (call) return void policyCall(call, JSON.parse(call.dataset.policyCall!))
    const open = target.closest<HTMLElement>('[data-policy-open]')?.dataset.policyOpen
    const item = open && floor().collections.find((c) => c.id === POLICIES)?.items.find((i) => i.id === open)
    if (open) return item ? kit.display(itemSubject(project, POLICIES, item)) : kit.toast('That item is gone')
    const worker = target.closest<HTMLElement>('[data-worker]')?.dataset.worker
    if (worker) return kit.display(`card:${worker}`)
    const copy = target.closest<HTMLElement>('[data-copy]')?.dataset.copy
    if (copy) return void navigator.clipboard.writeText(copy).then(() => kit.toast(`Copied ${copy}`), (err: Error) => kit.toast(err.message))
    const dismiss = target.closest<HTMLElement>('[data-offer-dismiss]')?.dataset.offerDismiss
    if (dismiss) tower.store.set(VIEWER_KEYS.dismissed, dismissing(board, dismissed, dismiss))
  })

  const offStore = tower.store.on(async (key) => {
    if (key !== VIEWER_KEYS.dismissed) return
    dismissed = new Set((await readViewer(tower.store.get)).dismissed)
    draw()
  })
  draw()

  return {
    update(next) {
      board = next
      draw()
    },
    close: offStore,
  }
}
