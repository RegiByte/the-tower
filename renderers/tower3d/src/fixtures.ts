import type { Board, Brief, Card, Tower } from './api.ts'
import type { Clients } from './clients.ts'
import { bytesOf, FILM_FILE } from './files.ts'
import type { FixtureFile } from './fixture-file.ts'
import { GAMES } from './games.ts'

/**
 * A fixture board (`?board=<name>`): states the renderer draws with no host behind them and none of the real system's
 * text, read from `fixtures/<name>.json`, which `npm run tower3d:fixtures` builds with the bridge
 * (scripts/tower3d-fixtures.ts holds the scenarios). A fixture page is its own record (`fixtureTower3d`, system.ts):
 * the file is its `fixture` resource, and the tower the page reads through answers from it.
 */

export type Fixture = Awaited<ReturnType<typeof startFixture>>

/** The fixture `name`'s file, and its boards as the door delivers them, one after another, the first on load. */
export async function startFixture(name: string) {
  const res = await fetch(new URL(`fixtures/${name}.json`, import.meta.url))
  if (!res.ok) throw new Error(`no fixture board "${name}": fixtures/${name}.json answered ${res.status}. The fixtures are renderers/tower3d/fixtures/*.json, copied by npm run tower3d`)
  const file = (await res.json()) as FixtureFile
  let at = 0
  return {
    name,
    file,
    /** The board delivered last, with its floors' archived cards, newest first. */
    delivered: () => file.boards[at],
    /** The next board, delivered now. */
    advance(): Board {
      const next = file.boards[at + 1]
      if (!next) throw new Error(`the ${name} fixture has ${file.boards.length} board${file.boards.length === 1 ? '' : 's'}, all delivered`)
      at++
      return next.board
    },
  }
}

/** A fixture tower's `tower.store`: kept in the page, so nothing the viewer's browser keeps reaches a fixture. */
function storeInPage(): Tower['store'] {
  const kept = new Map<string, unknown>()
  const watchers = new Set<(key: string) => void>()
  return {
    get: (key) => Promise.resolve(kept.get(key)),
    set: (key, value) => (kept.set(key, value), watchers.forEach((fn) => fn(key))),
    on: (fn) => (watchers.add(fn), () => void watchers.delete(fn)),
  }
}

const answersNo = (path: string) => Promise.reject(Object.assign(new Error(`a fixture board answers no ${path}`), { code: 'not_found' }))
const noTower = () => Promise.reject(new Error('a fixture board has no tower behind it'))
const notFound = (message: string) => Promise.reject(Object.assign(new Error(message), { code: 'not_found' }))

/**
 * A fixture worker's saved conversations: one per session it ran as, each resuming the one before, the latest first.
 * Its own session saves none until it is prompted.
 */
function fixtureBriefs(c: Card): Brief[] {
  const conversation = c.conversations[0]
  const of = (i: number) => c.lineage[i] && { ...c.lineage[i], callsign: c.callsign }
  const saved = conversation ? c.lineage : c.lineage.slice(0, -1)
  return saved.map((session, i) => {
    const last = i === c.lineage.length - 1
    const prompt = last ? (conversation?.prompt ?? '') : `Session ${i + 1}: pick up where the last one stopped`
    const answer = last ? conversation?.answer : `Stopped after session ${i + 1}; saved for a resume.`
    return {
      id: `${session.id}-conversation`, at: 0, resumed: i > 0, saved: true, prompt, answer, resumes: of(i - 1), resumedBy: of(i + 1),
      turns: [{ startedAt: session.startedAt, prompt, answer, session: session.id, steps: [] }], earlier: false, session: { ...session, callsign: c.callsign },
    }
  }).reverse()
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

/**
 * The tower a fixture page reads through, with the live one's interface: what the fixture holds it answers (a worker's
 * Changes and where its thread's anchors stand, the floors' origins as none, the review threads', drafts' and games'
 * texts, each board's archive and its workers' conversations), `store` is kept in the page, its streams never open,
 * every video it shows is the same test pattern and every image the same plot, and nothing is written anywhere.
 */
export function fixtureTower({ fixture, clients }: { fixture: Fixture; clients: Pick<Clients, 'DRAFTS'> }): Tower {
  const live = window.tower
  const { file } = fixture
  const film = bytesOf(FILM_FILE).then((bytes) => new Blob([bytes], { type: 'video/webm' }))
  const texts: Record<string, Record<string, string>> = { reviews: file.threads, [clients.DRAFTS]: file.drafts, [GAMES]: file.games }
  const missing: Record<string, string> = { [clients.DRAFTS]: 'draft', [GAMES]: 'game' }

  const get = (path: string): Promise<unknown> => {
    if (path === 'renderers') return (live.get as (path: string) => Promise<unknown>)(path)
    if (path === 'origins') return Promise.resolve({})
    const changes = /^changes\/([^?]+)/.exec(path)?.[1]
    if (changes !== undefined) return Promise.resolve(file.changes[changes] ?? [])
    const card = /^reviews\/anchors\/[^?]+\?card=([^&]+)$/.exec(path)?.[1]
    if (card !== undefined) return Promise.resolve({ states: file.anchors[decodeURIComponent(card)] ?? {} })
    return answersNo(path)
  }

  const text = (path: string): Promise<string> => {
    const [, project, collection, encoded] = /^collection\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path) ?? []
    if (project === undefined) return answersNo(path)
    const id = decodeURIComponent(encoded)
    const found = texts[collection]?.[`${project}/${id}`]
    if (found !== undefined) return Promise.resolve(found)
    if (collection === 'reviews') return answersNo(path)
    return notFound(`No ${missing[collection] ?? 'item'} "${id}"`)
  }

  const conversations = (id: string): Promise<Brief[]> => {
    const { board, archive } = fixture.delivered()
    const c = [...board.floors.flatMap((f) => f.cards), ...archive].find((c) => c.id === id)
    return c ? Promise.resolve(fixtureBriefs(c)) : Promise.reject(new Error(`No session "${id}"`))
  }

  const fromFile = () => {
    throw new Error("a fixture page's boards come from its file: the fixture feed delivers them")
  }

  return {
    ...live,
    /**
     * These pass to the live tower: they read the tower's own config and the sandbox's settings (the renderers it
     * serves, this renderer's settings, the viewer's appearance, the stats), not a floor's data. So does `get`'s
     * `renderers`.
     */
    renderer: live.renderer,
    prefs: live.prefs,
    stats: live.stats,
    get: get as Tower['get'],
    text,
    store: storeInPage(),
    call: noTower as Tower['call'],
    run: noTower,
    watch: () => () => {},
    blob: (path) => (path.endsWith('.webm') ? film : fixturePlot()),
    archive: (project) => Promise.resolve(fixture.delivered().archive.filter((c) => c.project === project)),
    conversations,
    recall: () => Promise.resolve(null),
    remember: () => {},
    subscribe: fromFile,
    onBoardError: fromFile,
  }
}
