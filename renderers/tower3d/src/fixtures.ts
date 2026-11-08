import { tower, type Board, type Brief, type Card } from './api.ts'
import { bytesOf, FILM_FILE } from './files.ts'
import type { FixtureFile } from './fixture-file.ts'
import { FIXTURE } from './fixture-name.ts'

/**
 * A fixture board (`?board=<name>`): states the renderer draws with no host behind them and none of the real system's
 * text, read from `fixtures/<name>.json`, which `npm run tower3d:fixtures` builds with the bridge
 * (scripts/tower3d-fixtures.ts holds the scenarios). The file is fetched only on a fixture page, before the page
 * builds anything.
 */

export { FIXTURE }

async function readFixture(name: string): Promise<FixtureFile> {
  const res = await fetch(new URL(`fixtures/${name}.json`, import.meta.url))
  if (!res.ok) throw new Error(`no fixture board "${name}": fixtures/${name}.json answered ${res.status}. The fixtures are renderers/tower3d/fixtures/*.json, copied by npm run tower3d`)
  return (await res.json()) as FixtureFile
}

const file = FIXTURE === undefined ? undefined : await readFixture(FIXTURE)

/** The instant the fixture board was built at: the page's wall clock on it. */
export const FIXTURE_AT = file && Date.parse(file.at)

/** The fixture board's review threads, by `<project>/<id>` (`threadSlot`): what their files read. */
export const FIXTURE_THREADS: Record<string, string> = file?.threads ?? {}

/** The fixture board's drafts' texts, by `<project>/<id>`: what its notes read. */
export const FIXTURE_DRAFTS: Record<string, string> = file?.drafts ?? {}

/** The fixture board's games' texts, by `<project>/<id>`: what their marquees read. */
export const FIXTURE_GAMES: Record<string, string> = file?.games ?? {}

/** Each fixture worker's Changes, by session id. */
export const FIXTURE_CHANGES: FixtureFile['changes'] = file?.changes ?? {}

/** Each fixture board's archived cards, newest first: what `GET /archive/<project>` would serve with it. */
const archives = new Map(file?.boards.map(({ board, archive }) => [board, archive]))

/** A fixture tower's `tower.store`: kept in the page, so nothing the viewer's browser keeps reaches a fixture. */
function storeInPage(): typeof tower.store {
  const kept = new Map<string, unknown>()
  const watchers = new Set<(key: string) => void>()
  return {
    get: (key) => Promise.resolve(kept.get(key)),
    set: (key, value) => (kept.set(key, value), watchers.forEach((fn) => fn(key))),
    on: (fn) => (watchers.add(fn), () => void watchers.delete(fn)),
  }
}

/** A fixture worker's Changes as `changes/<id>` reads them, the same under every scope; none for a worker without. */
const changesAt = (path: string) => {
  const id = /^changes\/([^?]+)/.exec(path)?.[1]
  return id === undefined ? undefined : (FIXTURE_CHANGES[id] ?? [])
}

/**
 * The tower the views Tower 3D mounts read through: on a fixture board, one answering a worker's Changes from the
 * fixture and keeping `store` in the page, with no tower behind anything else.
 */
export const viewTower: typeof tower =
  FIXTURE === undefined
    ? tower
    : {
        ...tower,
        get: ((path: string) => {
          const changes = changesAt(path)
          return changes ? Promise.resolve(changes) : Promise.reject(new Error(`a fixture board answers no ${path}`))
        }) as typeof tower.get,
        store: storeInPage(),
        call: (() => Promise.reject(new Error('a fixture board has no tower behind it'))) as typeof tower.call,
        run: () => Promise.reject(new Error('a fixture board has no tower behind it')),
      }

/** A fixture board has no host behind it: its streams are never opened, so monitors stay blank and desks stay open. */
export const watchStream: typeof tower.watch = FIXTURE === undefined ? (...a) => tower.watch(...a) : () => () => {}

/** The test pattern, fetched as the fixture page boots so it is at hand before any frame shows it. */
const film = FIXTURE === undefined ? undefined : bytesOf(FILM_FILE).then((bytes) => new Blob([bytes], { type: 'video/webm' }))

/** A fixture board's files are read from no host: every video it shows is the same test pattern, every image the same plot. */
export const readBlob: typeof tower.blob =
  FIXTURE === undefined ? (path) => tower.blob(path) : (path) => (path.endsWith('.webm') ? film! : fixturePlot())

/** A floor's archive (`GET /archive/<project>`), read beside `board`: a fixture board's own on a fixture. */
export const readArchive = (board: Board, project: string): Promise<Card[]> =>
  FIXTURE === undefined ? tower.archive(project) : Promise.resolve(archives.get(board)!.filter((c) => c.project === project))

/** A fixture worker's saved conversations: one per session it ran as, each resuming the one before, the latest first. */
function fixtureBriefs(c: Card): Brief[] {
  const conversation = c.conversations[0]
  const of = (i: number) => c.lineage[i] && { ...c.lineage[i], callsign: c.callsign }
  return c.lineage.map((session, i) => {
    const last = i === c.lineage.length - 1
    const prompt = last ? (conversation?.prompt ?? '') : `Session ${i + 1}: pick up where the last one stopped`
    const answer = last ? conversation?.answer : `Stopped after session ${i + 1}; saved for a resume.`
    return {
      id: `${session.id}-conversation`, at: 0, resumed: i > 0, saved: true, prompt, answer, resumes: of(i - 1), resumedBy: of(i + 1),
      turns: [{ startedAt: session.startedAt, prompt, answer, session: session.id, steps: [] }], earlier: false, session: { ...session, callsign: c.callsign },
    }
  }).reverse()
}

/** A worker's saved conversations (`GET /conversations/<id>`), read beside `board`: a fixture worker's own, from its card. */
export const readConversations = (board: Board, id: string): Promise<Brief[]> => {
  if (FIXTURE === undefined) return tower.conversations(id)
  const c = [...board.floors.flatMap((f) => f.cards), ...archives.get(board)!].find((c) => c.id === id)
  return c ? Promise.resolve(fixtureBriefs(c)) : Promise.reject(new Error(`No session "${id}"`))
}

function fixturePlot(): Promise<Blob> {
  const cv = Object.assign(document.createElement('canvas'), { width: 900, height: 700 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#f7f4ee'
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = '#2b2f3a'
  g.fillRect(80, 620, 760, 4)
  g.fillRect(80, 60, 4, 564)
  for (let i = 0; i < 12; i++) {
    const h = 80 + ((i * 5) % 7) * 70
    g.fillStyle = i % 4 === 3 ? '#e5484d' : '#4f7cff'
    g.fillRect(110 + i * 61, 620 - h, 44, h)
  }
  return new Promise((resolve) => cv.toBlob((blob) => resolve(blob!), 'image/png'))
}


/** The fixture's boards, in the order the door's `advance` delivers them. */
export const fixtureBoards = (): Board[] | undefined => file?.boards.map(({ board }) => board)
