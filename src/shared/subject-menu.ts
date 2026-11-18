/**
 * A subject's menu as data every renderer draws alike: what a floor, a worker or something a worker showed offers now,
 * then what it holds, each line saying what picking it does and, for what can be open, whether the renderer has it
 * open. A renderer draws it in its own menu and runs a line's `does` through the same handlers as its buttons; nothing
 * here runs anything.
 */
import type { Board, Card, CardShown, Floor } from '../bridge/board.ts'
import { actionWords, addedActions, base, can, cardSubject, commandName, floorSubject, pastCount, shownHref, shownSubject, shownTitle } from './cards.ts'
import { PANES } from './keymap.ts'
import type { Pick } from './palette.ts'
import type { Subject } from './subjects.ts'
import { VERB_WORDS, verbHint, verbId, type VerbId } from './verb-words.ts'

/** Showing the subject a key names, in the view the renderer picks for it. */
export type DisplayPick = { t: 'display'; subject: string }

/** A floor's `shell` or `editor` on one of its dirs, the hub or a repo. */
export type DirPick = { t: 'dir'; verb: 'shell' | 'editor'; project: string; dir: string }

/** A page of the web, opened beside the renderer. */
export type LinkPick = { t: 'link'; href: string }

/** What picking a line of a subject's menu does: a palette entry's pick, or one of the menu's own. */
export type MenuPick = Pick | DisplayPick | DirPick | LinkPick

/**
 * One line: its `id`, unique in the menu; `open`, on what can be open, whether the renderer has it open (a tick),
 * absent on a line that does something.
 */
export type MenuLine = { id: string; label: string; hint?: string; destructive?: true; open?: boolean; does: MenuPick }

/** Lines under one name, drawn as a submenu. */
export type MenuSub = { id: string; label: string; lines: MenuLine[] }

/** A run of lines, named by `label`: the subject's verbs first, then what it holds. */
export type MenuGroup = { label: string; lines: (MenuLine | MenuSub)[] }

/** A subject's menu: what it is called, and its groups, each with something in it. */
export type SubjectMenu = { title: string; groups: MenuGroup[] }

/** A view the renderer has open on a subject, by the view's id and the subject's key: its main view and its tab. */
export type Opened = { view: string; subject: string }

/** What the renderer adds to the board: what it has open, and the web page of each dir's origin (`GET /origins`). */
export type MenuContext = { open: readonly Opened[]; origins: Readonly<Record<string, string>> }

/**
 * Verbs the menu leaves out, as the palette does: a prompt is typed in the worker's terminal, a worker is ended by
 * sending it home, a worktree is chosen in the new-worker form; the floor's shell and editor are each dir's.
 */
const UNLISTED: ReadonlySet<VerbId> = new Set(['card/submit', 'card/prompt', 'card/kill', 'floor/cut', 'floor/shell', 'floor/editor'])

/** The tab each of a card's verbs opens, a tick where the renderer has it open. */
const PANE_OF: Partial<Record<VerbId, string>> = Object.fromEntries(
  Object.entries(VERB_WORDS).flatMap(([id, words]) => PANES.filter((p) => p.command === words.command).map((p) => [id, p.view])),
)

const isOpen = (ctx: MenuContext, subject: string, view?: string) => ctx.open.some((o) => o.subject === subject && (view === undefined || o.view === view))

/** What extensions offer on `subject`, each a line. */
const addedLines = (board: Board, subject: Subject): MenuLine[] =>
  addedActions(board, subject).map((action, n) => {
    const words = actionWords(board, action)
    const name = 'verb' in action ? action.verb : `${action.cap}/${action.command}`
    return { id: `added:${name}#${n}`, label: words.label, ...(words.hint && { hint: words.hint }), ...(words.destructive && { destructive: true as const }), does: { t: 'added', subject: subject.key, action } }
  })

/** The groups that have lines. */
const groups = (...all: MenuGroup[]): MenuGroup[] => all.filter((g) => g.lines.length)

const floorMenu = (board: Board, f: Floor, ctx: MenuContext): SubjectMenu => {
  const key = `floor:${f.id}`
  const verbs = f.actions.filter((a) => !UNLISTED.has(verbId('floor', a.verb))).map((a): MenuLine => {
    const words = VERB_WORDS[verbId('floor', a.verb)]
    return { id: verbId('floor', a.verb), label: words.label, hint: words.hint, ...(words.destructive && { destructive: true as const }), does: { t: 'action', subject: 'floor', verb: a.verb, project: f.id } }
  })
  const past = pastCount(f)
  const archive: MenuLine[] = past ? [{ id: 'archive', label: 'Archive', hint: `${past} past workers and their conversations`, open: isOpen(ctx, key, 'tower/archive'), does: { t: 'open', subject: key, view: 'tower/archive' } }] : []
  const kept = f.collections.map((c): MenuLine => {
    const subject = `collection:${f.id}/${c.id}`
    return { id: subject, label: c.label, hint: `${c.items.length} kept${c.description ? `: ${c.description}` : ''}`, open: isOpen(ctx, subject), does: { t: 'display', subject } }
  })
  const shelf = (f.shelf ?? []).map((entry, n): MenuLine => {
    const subject = `shelf:${f.id}/${n}`
    const link = 'link' in entry
    return { id: subject, label: entry.label, ...(link && { hint: entry.link }), ...(!link && { open: isOpen(ctx, subject) }), does: { t: 'go', target: { t: 'shelf', project: f.id, n } } }
  })
  const repos = [f.hub, ...f.repos].map((dir): MenuSub => ({
    id: `dir:${dir}`,
    label: base(dir),
    lines: [
      ...(can(f, 'shell') ? [{ id: `shell:${dir}`, label: VERB_WORDS['floor/shell'].label, hint: `A login shell in ${dir}.`, does: { t: 'dir', verb: 'shell', project: f.id, dir } } as const] : []),
      ...(can(f, 'editor') ? [{ id: `editor:${dir}`, label: VERB_WORDS['floor/editor'].label, hint: `${dir} in a new window of your editor.`, does: { t: 'dir', verb: 'editor', project: f.id, dir } } as const] : []),
      ...(ctx.origins[dir] ? [{ id: `origin:${dir}`, label: 'On the web', hint: ctx.origins[dir], does: { t: 'link', href: ctx.origins[dir] } } as const] : []),
    ],
  }))
  return {
    title: f.name,
    groups: groups(
      { label: f.name, lines: [...verbs, ...archive] },
      { label: 'Kept', lines: kept },
      { label: 'Shelf', lines: shelf },
      { label: 'Repos', lines: repos.filter((r) => r.lines.length) },
      { label: 'Extensions', lines: addedLines(board, floorSubject(f)) },
    ),
  }
}

/** A showing as a line of its worker's menu, ticked while open. */
const shownLine = (c: Card, s: CardShown, ctx: MenuContext): MenuLine => {
  const subject = shownSubject(c, s).key
  return { id: subject, label: shownTitle(s), hint: s.target, open: isOpen(ctx, subject), does: { t: 'display', subject } }
}

const cardMenu = (board: Board, c: Card, ctx: MenuContext): SubjectMenu => {
  const key = `card:${c.id}`
  const verbs = c.actions.filter((a) => !UNLISTED.has(verbId('card', a.verb))).map((a): MenuLine => {
    const id = verbId('card', a.verb)
    const words = VERB_WORDS[id]
    const pane = PANE_OF[id]
    return { id, label: words.label, hint: verbHint('card', a.verb, c), ...(words.destructive && { destructive: true as const }), ...(pane && { open: isOpen(ctx, key, pane) }), does: { t: 'action', subject: 'card', verb: a.verb, id: c.id } }
  })
  const latest = c.conversations.at(-1)
  const earlier = c.conversations.filter((v) => v !== latest).flatMap((v) => v.actions.map((a): MenuLine => ({
    id: `${verbId('conversation', a.verb)}@${v.id}`,
    label: `${VERB_WORDS[verbId('conversation', a.verb)].label}: ${v.prompt ?? 'an earlier conversation'}`,
    hint: verbHint('conversation', a.verb, c),
    does: { t: 'action', subject: 'conversation', verb: a.verb, id: c.id, conversation: v.id },
  })))
  const processes = c.resources.flatMap((r) => r.actions.map((a): MenuLine => ({
    id: `${verbId('resource', a.verb)}@${r.pid}`,
    label: `${VERB_WORDS[verbId('resource', a.verb)].label} ${r.pid} ${commandName(r.command)}`,
    hint: r.command,
    does: { t: 'action', subject: 'resource', verb: a.verb, id: c.id, pid: r.pid },
  })))
  return {
    title: c.callsign,
    groups: groups(
      { label: c.callsign, lines: verbs },
      { label: 'Shown', lines: c.shown.map((s) => shownLine(c, s, ctx)).reverse() },
      { label: 'Earlier conversations and processes', lines: [...earlier, ...processes] },
      { label: 'Extensions', lines: addedLines(board, cardSubject(c)) },
    ),
  }
}

const shownMenu = (board: Board, c: Card, s: CardShown, ctx: MenuContext): SubjectMenu => ({
  title: shownTitle(s),
  groups: groups(
    {
      label: shownTitle(s),
      lines: [
        { ...shownLine(c, s, ctx), label: 'Open' },
        { id: 'out', label: 'Open in a browser tab', hint: s.target, does: { t: 'link', href: shownHref(s) } },
        { id: `worker:${c.id}`, label: `Go to ${c.callsign}`, does: { t: 'go', target: { t: 'worker', id: c.id } } },
      ],
    },
    { label: 'Extensions', lines: addedLines(board, shownSubject(c, s)) },
  ),
})

/**
 * The menu of the subject `key` names (`floor:<project>`, `card:<id>`, `shown:<card>/<at>`) as the board holds it now:
 * its verbs, each run with the call the board offers; then what it holds: a floor its archive, collections, shelf,
 * repos (a shell, the editor and the web page of each) and what extensions offer on it; a worker its showings, earlier
 * conversations and processes and extensions' actions; a showing itself, its worker and extensions' actions. Ticks
 * (`open`) for what `ctx.open` holds. Undefined for a key the board doesn't hold, or of another kind.
 */
export const subjectMenu = (board: Board, key: string, ctx: MenuContext): SubjectMenu | undefined => {
  const at = key.indexOf(':')
  if (at < 0) return undefined
  const kind = key.slice(0, at)
  const rest = key.slice(at + 1)
  if (kind === 'floor') {
    const f = board.floors.find((g) => g.id === rest)
    return f && floorMenu(board, f, ctx)
  }
  const cards = board.floors.flatMap((f) => f.cards)
  if (kind === 'card') {
    const c = cards.find((d) => d.id === rest)
    return c && cardMenu(board, c, ctx)
  }
  if (kind === 'shown') {
    const slash = rest.lastIndexOf('/')
    const c = cards.find((d) => d.id === rest.slice(0, slash))
    const s = c?.shown.find((t) => String(t.at) === rest.slice(slash + 1))
    return c && s && shownMenu(board, c, s, ctx)
  }
  return undefined
}
