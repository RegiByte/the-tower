import type { Board, Floor } from '../../../src/bridge/board.ts'
import { esc, plural } from '../../../src/shared/cards.ts'
import { drawPanel } from '../../../src/shared/panel-kit.ts'
import { panelsCss } from '../../../src/shared/panels-css.ts'
import { pressing } from '../../../src/shared/press.ts'
import { itemKey } from '../../../src/shared/subjects.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { closeHtml, viewCss } from '../../../src/views/parts.ts'
import { clockOf, COFFEE, floorCoffee, type Decision, type Entry, type Proposal, type RoundView } from './rounds.ts'

/**
 * `coffee/machine`, the coffee extension's view of a floor: the round open now (who is at the machine and what they
 * are on, what was said, the ideas left), the ideas waiting on the user from any round with Hire, Draft and Pass, and
 * the earlier rounds, each opening its transcript. Coffee time is called, and a round closed, from its head.
 */

const ID = 'coffee/machine'

const STYLE = `${panelsCss}
${viewCss(
  ID,
  `& .coffee-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-l); display: flex; flex-direction: column; gap: var(--sp-xl); background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }
  & h2 { margin: 0 0 var(--sp-s); font: 700 var(--fs-s)/1.4 var(--ui); color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }
  & .machine { padding: var(--sp-l); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  & .machine.idle { color: var(--muted); display: flex; flex-direction: column; gap: var(--sp-m); align-items: flex-start; }
  & .machine .since { color: var(--faint); font-size: var(--fs-s); margin-bottom: var(--sp-m); }
  & .here { display: flex; flex-wrap: wrap; gap: var(--sp-s); margin-bottom: var(--sp-l); }
  & .cup { display: grid; grid-template-columns: auto 1fr; column-gap: var(--sp-s); align-items: baseline; max-width: 34ch; padding: var(--sp-s) var(--sp-m); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); font-size: var(--fs-s); }
  & .cup b { font: 700 var(--fs-s)/1.4 var(--mono); }
  & .cup .doing { grid-column: 1 / -1; color: var(--muted); white-space: pre-wrap; }
  & .talk { display: flex; flex-direction: column; gap: var(--sp-m); margin: 0; padding: 0; list-style: none; }
  & .talk li { display: grid; grid-template-columns: minmax(10ch, auto) 1fr; column-gap: var(--sp-m); }
  & .talk .who { font: 700 var(--fs-s)/1.5 var(--mono); color: var(--ink); }
  & .talk .who small { display: block; font: var(--fs-xs)/1.4 var(--ui); color: var(--faint); font-weight: 400; }
  & .talk .what { white-space: pre-wrap; font-size: var(--fs-m); line-height: 1.5; }
  & .talk .what .act { color: var(--faint); font-size: var(--fs-s); }
  & .ideas { display: flex; flex-direction: column; gap: var(--sp-m); }
  & .idea { padding: var(--sp-m) var(--sp-l); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius); background: var(--panel); }
  & .idea.decided { border-left-color: var(--line-strong); opacity: .8; }
  & .idea .t { font-weight: 700; }
  & .idea .by { color: var(--faint); font-size: var(--fs-s); margin-left: var(--sp-s); }
  & .idea .body { margin: var(--sp-xs) 0 var(--sp-s); white-space: pre-wrap; color: var(--muted); font-size: var(--fs-s); line-height: 1.5; }
  & .idea .acts { display: flex; flex-wrap: wrap; gap: var(--sp-s); align-items: center; font-size: var(--fs-s); color: var(--faint); }
  & .rounds { display: flex; flex-direction: column; gap: var(--sp-2xs); }
  & .round-row { display: grid; grid-template-columns: auto 1fr auto; column-gap: var(--sp-m); align-items: baseline; padding: var(--sp-xs) var(--sp-m); border: none; border-radius: var(--radius); background: none; text-align: left; font-size: var(--fs-s); color: var(--muted); cursor: pointer; }
  & .round-row:hover { background: var(--panel); color: var(--ink); }
  & .round-row .tag { font: var(--fs-xs)/1.4 var(--mono); color: var(--faint); }
  & .round-row .meta { color: var(--faint); font-size: var(--fs-xs); white-space: nowrap; }
  & .none { color: var(--faint); font-style: italic; font-size: var(--fs-s); }
  & button.link { display: inline; min-height: 0; margin: 0; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }`,
)}`

const callsignOf = (board: Board, session: string) => board.floors.flatMap((f) => f.cards).find((c) => c.id === session || c.lineage.some((l) => l.id === session))?.callsign

const decisionHtml = (board: Board, d: Decision) =>
  d.t === 'hire'
    ? `hired <button class="link" data-worker="${esc(d.session)}">${esc(callsignOf(board, d.session) ?? d.session)}</button> on it · ${esc(d.by)}, ${esc(clockOf(d.at))}`
    : d.t === 'draft'
      ? `kept as a draft · ${esc(d.by)}, ${esc(clockOf(d.at))}`
      : `passed · ${esc(d.by)}, ${esc(clockOf(d.at))}`

const ideaHtml = (board: Board, project: string, round: RoundView, p: Proposal) => {
  const call = (verb: string) => esc(JSON.stringify([`coffee/${verb}`, { project, round: round.id, proposal: p.n }]))
  const acts = p.decision
    ? decisionHtml(board, p.decision)
    : `<button class="primary" data-coffee-call="${call('hire')}" data-tip="start a worker on this idea">Hire</button><button data-coffee-call="${call('draft')}" data-tip="keep it as a draft for later">Draft</button><button data-coffee-call="${call('pass')}" data-tip="let it go">Pass</button>`
  return `<div class="idea${p.decision ? ' decided' : ''}"><span class="t">${esc(p.title)}</span><span class="by">p${p.n} · ${esc(p.by)}, ${esc(clockOf(p.at))} · round ${esc(round.tag)}</span><div class="body">${esc(p.body)}</div><div class="acts">${acts}</div></div>`
}

const entryHtml = (board: Board, e: Entry) => {
  const act = e.act
  const what =
    act.t === 'proposes' ? `<span class="act">proposes p${act.n} · </span><b>${esc(act.title)}</b>${e.body ? `\n${esc(e.body)}` : ''}`
    : act.t === 'joins' ? `<span class="act">arrives · </span>${esc(e.body)}`
    : act.t === 'calls' ? `<span class="act">calls coffee time · ${esc(e.body)}</span>`
    : act.t === 'closes' ? `<span class="act">closes the round${e.body ? ` · ${esc(e.body)}` : ''}</span>`
    : act.t === 'hires' ? `<span class="act">hires <button class="link" data-worker="${esc(act.session)}">${esc(callsignOf(board, act.session) ?? act.session)}</button> on p${act.n}</span>`
    : act.t === 'drafts' ? `<span class="act">keeps p${act.n} as a draft</span>`
    : act.t === 'passes' ? `<span class="act">passes p${act.n}</span>`
    : esc(e.body)
  return `<li><span class="who">${esc(e.author)}<small>${esc(clockOf(e.at))}</small></span><span class="what">${what}</span></li>`
}

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  const project = (subject.value as Floor).id
  const floor = () => board.floors.find((f) => f.id === project) as Floor

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="coffee-body"></div>`
  const [head, body] = [host.querySelector<HTMLElement>('.shelf-head')!, host.querySelector<HTMLElement>('.coffee-body')!]

  const html = () => {
    const f = floor()
    const { open, rounds } = floorCoffee(f)
    const waiting = rounds.flatMap((r) => r.proposals.filter((p) => !p.decision).map((p) => ({ r, p })))
    const machine = open
      ? `<div class="machine"><h2>At the machine</h2><div class="since">open since ${esc(clockOf(open.opened))}, called by ${esc(open.by)}${open.present.length ? ` · ${plural(open.present.length, 'worker')} here` : ' · nobody has joined yet'}</div>
          <div class="here">${open.present.map((p) => `<div class="cup"><b>${esc(p.callsign)}</b><span class="doing">${esc(p.doing)}</span></div>`).join('') || '<span class="none">the invited workers join as their turns allow</span>'}</div>
          <ol class="talk">${open.entries.map((e) => entryHtml(board, e)).join('')}</ol></div>`
      : `<div class="machine idle"><span>Nobody at the coffee machine. <b>Coffee time</b> prompts every worker waiting at its prompt to come, say what it is on, and leave ideas for you.</span>
          <button class="primary" data-coffee-call="${esc(JSON.stringify(['coffee/call', { project }]))}">☕ Coffee time</button></div>`
    const ideas = waiting.length ? `<section><h2>Ideas waiting on you</h2><div class="ideas">${waiting.map(({ r, p }) => ideaHtml(board, project, r, p)).join('')}</div></section>` : ''
    const past = rounds.filter((r) => r.closed)
    const earlier = `<section><h2>Earlier rounds</h2><div class="rounds">${
      past.length
        ? past.map((r) => `<button class="round-row" data-round="${esc(r.id)}" data-tip="open the transcript"><span class="tag">${esc(r.tag)}</span><span>${esc(r.opened)} · ${esc(r.present.map((p) => p.callsign).join(', ') || 'nobody came')}</span><span class="meta">${plural(r.said, 'line')} · ${plural(r.proposals.length, 'idea')}${r.proposals.some((p) => !p.decision) ? ' · waiting' : ''}</span></button>`).join('')
        : '<span class="none">none yet</span>'
    }</div></section>`
    return `${machine}${ideas}${earlier}`
  }

  const draw = () => {
    const f = floor()
    const { open } = floorCoffee(f)
    const act = open
      ? `<button data-coffee-call="${esc(JSON.stringify(['coffee/close', { project }]))}" data-tip="close the round: its ideas keep waiting on you">Close round</button>`
      : `<button class="primary" data-coffee-call="${esc(JSON.stringify(['coffee/call', { project }]))}" data-tip="call the floor's available workers to the coffee machine">☕ Coffee time</button>`
    const h = `<span class="label">Coffee machine</span><span class="dim">${esc(f.name)}</span><span class="actions">${act}${closeHtml(board.keys)}</span>`
    if (head.innerHTML !== h) head.innerHTML = h
    drawPanel(body, html(), {})
  }

  const press = async (button: Element, [verb, input]: [string, Record<string, unknown>]) => {
    const reply = await pressing(button, () => tower.call(verb as never, input as never) as Promise<Record<string, unknown>>).catch((err: Error) => void kit.toast(err.message))
    if (!reply) return
    if (reply.t === 'error') return void kit.toast(String(reply.message))
    if (reply.t === 'called') kit.toast(`Coffee time: ${(reply.invited as string[]).length ? `invited ${(reply.invited as string[]).join(', ')}` : 'nobody free to invite'}${(reply.busy as string[]).length ? ` · busy: ${(reply.busy as string[]).length}` : ''}`)
    else if (reply.t === 'closed') kit.toast(`Round closed: ${plural(reply.proposals as number, 'idea')}${(reply.pending as number) ? `, ${reply.pending} waiting on you` : ''}`)
    else if (reply.t === 'spawned') (kit.toast('Hired a worker on it'), kit.display(`card:${reply.id as string}`))
    else if (reply.t === 'drafted') kit.toast(`Kept as draft ${reply.tag as string}`)
    else if (reply.t === 'passed') kit.toast('Passed')
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    const call = target.closest<HTMLElement>('[data-coffee-call]')
    if (call) return void press(call, JSON.parse(call.dataset.coffeeCall!))
    const round = target.closest<HTMLElement>('[data-round]')?.dataset.round
    if (round !== undefined) return kit.display(itemKey(project, COFFEE, round))
    const worker = target.closest<HTMLElement>('[data-worker]')?.dataset.worker
    if (worker) kit.display(`card:${worker}`)
  })

  draw()
  return {
    update(next) {
      board = next
      draw()
    },
    close() {},
  }
}
