/**
 * PR status: asks GitHub, through `gh`, for the newest pull request of each branch a worker on the board works on,
 * and appends what it said to its stream `seen` only when that changed. A card's fold reads the stream's state and
 * puts the pull request on the card as badges: its number, where it stands and its review, linking to it, and its
 * checks when they fail or still run.
 *
 * When: at the end of a worker's turn (its board trigger), for that worker's branch; and at its `tick`, for every
 * branch that is due. An open pull request is due every `every`; a branch with none, or with one merged or closed,
 * backs off while GitHub keeps saying the same (`BACKOFF`), since a new one most often shows at a turn's end. Each
 * round is one GraphQL query per GitHub host, every branch an alias in it.
 */
import type { Board, Card } from '../../../src/bridge/board.ts'
import type { FoldCtx, Start, StreamFact, TriggerCall } from '../../../src/shared/extensions.ts'

type Settings = { every: string; gh: string[] }
type Review = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
type Checks = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED'
/** A pull request as GitHub said it: `review` and `checks` as its GraphQL names them, absent from facts before they were asked. */
type Pr = {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  draft: boolean
  url: string
  title: string
  review?: Review | null
  checks?: Checks | null
  headOid?: string
  createdAt?: string
}
/**
 * What an ask found: the newest pull request GitHub has from a head of the branch's name, and whether git took it for
 * this branch's (`mine`), or why it couldn't be asked.
 */
type Answer = { pr: Pr | null; mine?: boolean } | { error: string }
/**
 * What was last seen of a branch: its newest pull request and `mine` as last asked, and `error` while its latest ask
 * failed, which keeps the pull request seen before it.
 */
type Seen = { dir: string; branch: string; at: number; pr?: Pr | null; mine?: boolean; error?: string }
/** The stream's state: what was last seen of each checkout's branch, by `keyOf`. */
type State = Record<string, Seen>
type Branch = { dir: string; branch: string }

const keyOf = (dir: string, branch: string) => `${dir}\0${branch}`

/** The stream's fold: a `p` fact is what is seen of its branch now; an `f` fact keeps the pull request seen before it, so one failed ask hides no badge. */
const step = (state: State, [at, code, fact]: StreamFact): State => {
  const { dir, branch } = fact as Branch
  const key = keyOf(dir, branch)
  if (code === 'f') {
    const { pr, mine } = state[key] ?? {}
    return { ...state, [key]: { dir, branch, at, ...(pr !== undefined && { pr }), ...(mine !== undefined && { mine }), error: (fact as { error: string }).error } }
  }
  const { pr, mine } = fact as { pr: Pr | null; mine?: boolean }
  return { ...state, [key]: { dir, branch, at, pr, ...(mine !== undefined && { mine }) } }
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }
const periodMs = (every: string): number => {
  const [, n, unit] = /^(\d+)(s|m|h)$/.exec(every)!
  return Number(n) * UNIT_MS[unit]
}

/** How long a branch with no open pull request waits between asks, by how many answers in a row were the same: the last for every one after. */
const BACKOFF = [5 * 60_000, 15 * 60_000, 30 * 60_000]

/**
 * How long a branch waits after an ask: `every` while its pull request is open, else `BACKOFF` by its streak of answers
 * unchanged. A failed ask goes by the pull request seen before it, so a blip on an open one is asked again at `every`.
 */
const waitOf = (every: number, pr: Pr | null | undefined, unchanged: number): number =>
  pr?.state === 'OPEN' ? every : Math.max(every, BACKOFF[Math.min(unchanged, BACKOFF.length - 1)])

const GH_TIMEOUT_MS = 30_000
const GIT_TIMEOUT_MS = 10_000

/** The branches the board's workers are on, once each: a worktree's, whose folder is there. The main checkout has none. */
const branchesOf = (cards: Card[]): Branch[] => {
  const seen = new Map<string, Branch>()
  for (const card of cards) {
    const branch = card.worktree?.branch
    if (branch === undefined || card.worktree!.gone) continue
    seen.set(keyOf(card.cwd, branch), { dir: card.cwd, branch })
  }
  return [...seen.values()]
}

const cardsOf = (board: Board): Card[] => board.floors.flatMap((floor) => floor.cards)

/**
 * The board trigger: an ask for the branch of each worker in a worktree whose turn ended between two boards, its card
 * working on the first and not on the second, which is when a worker has just pushed or opened a pull request.
 */
const turnsEnded = (prev: Board, next: Board): TriggerCall[] => {
  const was = new Map(cardsOf(prev).map((card) => [card.id, card.status]))
  const ended = cardsOf(next).filter((card) => was.get(card.id) === 'working' && card.status !== 'working')
  return branchesOf(ended).map((input) => ({ verb: 'pr-status/ask', input }))
}

/** A checkout's GitHub repo: its host, owner and name, as `gh repo view` reads its remote. */
type Repo = { host: string; owner: string; name: string }

const PR_FIELDS = 'number state isDraft url title reviewDecision headRefOid createdAt commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }'

/** One query asking for the newest pull request of each of `n` branches, `b<i>` its alias, its repo and branch passed as variables. */
const queryOf = (n: number): string => {
  const vars = Array.from({ length: n }, (_, i) => `$o${i}: String!, $r${i}: String!, $b${i}: String!`).join(', ')
  const aliases = Array.from(
    { length: n },
    (_, i) => `b${i}: repository(owner: $o${i}, name: $r${i}) { pullRequests(headRefName: $b${i}, first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { ${PR_FIELDS} } } }`,
  )
  return `query(${vars}) {\n${aliases.join('\n')}\n}`
}

type Node = {
  number: number
  state: Pr['state']
  isDraft: boolean
  url: string
  title: string
  reviewDecision: Review | null
  headRefOid: string
  createdAt: string
  commits: { nodes: { commit: { statusCheckRollup: { state: Checks } | null } }[] }
}

const prOf = (node: Node): Pr => ({
  number: node.number,
  state: node.state,
  draft: node.isDraft,
  url: node.url,
  title: node.title,
  review: node.reviewDecision,
  checks: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
  headOid: node.headRefOid,
  createdAt: node.createdAt,
})

type Graphql = { data: Record<string, { pullRequests: { nodes: Node[] } } | null>; errors?: { message: string; path?: string[] }[] }

/** A GraphQL answer `gh` printed, whatever its exit: undefined when stdout holds none (a failure before GitHub answered). */
const graphqlOf = (stdout: string): Graphql | undefined => {
  try {
    const answer = JSON.parse(stdout) as Graphql
    return answer && typeof answer.data === 'object' && answer.data !== null ? answer : undefined
  } catch {
    return undefined
  }
}

const sameAnswer = (seen: Seen | undefined, answer: Answer): boolean =>
  seen !== undefined &&
  ('error' in answer
    ? seen.error === answer.error
    : seen.error === undefined && seen.mine === answer.mine && JSON.stringify(seen.pr) === JSON.stringify(answer.pr))

/** A pull request's state in words: a draft is open, said as a draft. */
const stateOf = (pr: Pr): 'open' | 'draft' | 'merged' | 'closed' => (pr.state === 'OPEN' ? (pr.draft ? 'draft' : 'open') : pr.state === 'MERGED' ? 'merged' : 'closed')
/** Each state in the tone nearest GitHub's color for it: open green, draft grey, closed red; merged is purple there, and blue, the nearest tone, here. */
const TONE = { open: 'ready', draft: 'quiet', merged: 'offered', closed: 'broken' } as const
const REVIEW_WORDS: Record<Review, string> = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested', REVIEW_REQUIRED: 'review required' }
/** An open pull request's checks, when they need a look: failing or still running. Passing says nothing. */
const CHECKS_BADGE: Partial<Record<Checks, { label: string; tone: 'broken' | 'working' }>> = {
  FAILURE: { label: 'checks failing', tone: 'broken' },
  ERROR: { label: 'checks failing', tone: 'broken' },
  PENDING: { label: 'checks running', tone: 'working' },
  EXPECTED: { label: 'checks running', tone: 'working' },
}

/** A checkout whose remotes aren't on GitHub: its branches have no pull requests to ask about, which is no fault. */
const notOnGitHub = (error: string): boolean => /none of the git remotes configured for this repository point to a known GitHub host/.test(error)

/** What to do about an ask that failed, by what failed. */
const fixOf = (error: string): string =>
  /ENOENT/.test(error)
    ? "the tower can't find gh: install it (https://cli.github.com), or set this extension's `gh` setting to its absolute path, such as [\"/opt/homebrew/bin/gh\"]"
    : /gh auth login/.test(error)
      ? 'gh is not signed in: run `gh auth login`'
      : /no answer within/.test(error)
        ? 'GitHub or the network is slow: it asks again on its own'
        : 'run the same `gh` in that checkout to see why it fails'

/** The first line of an error, for a tooltip. */
const firstLine = (error: string): string => error.split('\n')[0].trim().replace(/[.:]$/, '')

/** Checks in words, any state GitHub rolls them up to. */
const CHECKS_WORDS: Record<Checks, string> = { SUCCESS: 'checks passing', FAILURE: 'checks failing', ERROR: 'checks failing', PENDING: 'checks running', EXPECTED: 'checks running' }

/** Where a pull request lives, `owner/repo`, read from its url. */
const repoOfUrl = (url: string): string => new URL(url).pathname.split('/').slice(1, 3).join('/')

/**
 * The pull request badge's tooltip: what the card doesn't already say. Its number and title, where it stands with its
 * review and checks for an open one, and the repo it opens in: no branch, which the card's row shows above it.
 */
const prHint = (pr: Pr): string => {
  const stand = [stateOf(pr), ...(pr.state === 'OPEN' && pr.review ? [REVIEW_WORDS[pr.review]] : []), ...(pr.state === 'OPEN' && pr.checks ? [CHECKS_WORDS[pr.checks]] : [])]
  return `#${pr.number} ${pr.title}\n${stand.join(' · ')}\nOpens on GitHub, ${repoOfUrl(pr.url)}`
}

const foldCard = (card: Card, { own }: FoldCtx) => {
  const branch = card.worktree?.branch
  if (branch === undefined) return {}
  const seen = (own.streams.seen as State)[keyOf(card.cwd, branch)]
  const pr = seen?.pr
  if (!pr || seen.mine === false) return {}
  const state = stateOf(pr)
  const open = pr.state === 'OPEN'
  const review = open && pr.review ? REVIEW_WORDS[pr.review] : undefined
  const checks = open && pr.checks ? CHECKS_BADGE[pr.checks] : undefined
  return {
    x: { number: pr.number, state, url: pr.url, title: pr.title, ...(review && { review }), ...(pr.checks && { checks: pr.checks.toLowerCase() }) },
    badges: [
      {
        label: `#${pr.number} ${state}${review ? ` · ${review}` : ''}`,
        tone: TONE[state],
        hint: seen.error === undefined ? prHint(pr) : `${prHint(pr)}\nAs last seen: GitHub can't be asked now (${firstLine(seen.error)})`,
        href: pr.url,
      },
      ...(checks ? [{ ...checks, hint: `The checks on #${pr.number}'s newest commit: ${pr.checks === 'FAILURE' || pr.checks === 'ERROR' ? 'at least one failed' : 'some still run'}\nOpens them on GitHub`, href: `${pr.url}/checks` }] : []),
    ],
  }
}

const start: Start = (ctx) => {
  const settings = () => ctx.settings as Settings
  const state = () => ctx.own.streams('seen') as State
  /** Every round waits for the one before it, so two never append for the same branch at once. */
  let queue: Promise<unknown> = Promise.resolve()
  /** Kept in memory, so a restart asks about every branch once: each checkout's repo, and per branch when it is due next and how many answers in a row were the same. */
  const repos = new Map<string, Repo>()
  const due = new Map<string, { at: number; unchanged: number }>()

  const gh = (args: string[], cwd: string) => ctx.run([...settings().gh, ...args], { cwd, timeoutMs: GH_TIMEOUT_MS })
  const failed = (ran: Awaited<ReturnType<typeof gh>>): string | undefined =>
    ran.timedOut ? `gh gave no answer within ${GH_TIMEOUT_MS / 1000}s` : ran.exit !== 0 ? (ran.stderr.trim() || `gh exited ${ran.exit ?? ran.signal}`).slice(-500) : undefined

  const repoOf = async (dir: string): Promise<Repo | { error: string }> => {
    const known = repos.get(dir)
    if (known) return known
    try {
      const ran = await gh(['repo', 'view', '--json', 'nameWithOwner,url'], dir)
      const error = failed(ran)
      if (error) return { error }
      const { nameWithOwner, url } = JSON.parse(ran.stdout) as { nameWithOwner: string; url: string }
      const [owner, name] = nameWithOwner.split('/')
      const repo = { host: new URL(url).host, owner, name }
      repos.set(dir, repo)
      return repo
    } catch (err) {
      return { error: (err as Error).message.slice(-500) }
    }
  }

  const git = (args: string[], cwd: string) => ctx.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })

  /**
   * Whether a pull request GitHub found by the branch's name is this branch's, as git reads the checkout: its head
   * commit in the branch's history, and, merged or closed, opened after the branch was made (its reflog's first entry).
   * A name a later worker reuses (`tower/<callsign>`) starts from the default branch: a merged pull request's head may be
   * in that history, but it was opened before. A head commit git doesn't have was pushed from elsewhere: then the
   * pull request is taken for the branch's while open, and by when it was opened once not.
   */
  const mineOf = async ({ dir, branch }: Branch, pr: Pr): Promise<boolean> => {
    const ancestor = (await git(['merge-base', '--is-ancestor', pr.headOid!, branch], dir)).exit
    if (ancestor === 1) return false
    if (pr.state === 'OPEN') return true
    const made = /@\{(\d+)\}$/.exec((await git(['reflog', 'show', '--date=unix', '--format=%gd', branch], dir)).stdout.trim().split('\n').at(-1) ?? '')
    return !made || Date.parse(pr.createdAt!) >= Number(made[1]) * 1000
  }

  /**
   * One query for every branch on one host: each its answer. GitHub answers what it can and lists an error per alias it
   * couldn't (a repo gone or out of reach), and `gh` then exits 1 with that answer on stdout: each alias takes its own
   * data or its own error, so one repo out of reach fails only its branches. With no answer at all, every branch takes
   * `gh`'s error.
   */
  const askHost = async (host: string, asks: (Branch & Repo)[]): Promise<Answer[]> => {
    const vars = asks.flatMap((a, i) => ['-f', `o${i}=${a.owner}`, '-f', `r${i}=${a.name}`, '-f', `b${i}=${a.branch}`])
    try {
      const ran = await gh(['api', 'graphql', '--hostname', host, '-f', `query=${queryOf(asks.length)}`, ...vars], asks[0].dir)
      const answered = graphqlOf(ran.stdout)
      const error = failed(ran)
      if (!answered) return asks.map(() => ({ error: error ?? `gh answered no GraphQL data: ${ran.stdout.slice(0, 200)}` }))
      return asks.map((a, i): Answer => {
        const repo = answered.data[`b${i}`]
        if (repo) {
          const [node] = repo.pullRequests.nodes
          return { pr: node ? prOf(node) : null }
        }
        const said = answered.errors?.find((e) => e.path?.[0] === `b${i}`)?.message
        return { error: said ?? error ?? `GitHub on ${host} answered nothing for ${a.owner}/${a.name}` }
      })
    } catch (err) {
      const error = (err as Error).message.slice(-500)
      return asks.map(() => ({ error }))
    }
  }

  /** Records an answer when it changed, and when the branch is due next: whether it changed. */
  const record = async ({ dir, branch }: Branch, answer: Answer): Promise<boolean> => {
    const key = keyOf(dir, branch)
    const before = state()[key]
    const changed = !sameAnswer(before, answer)
    if (changed && 'error' in answer) await ctx.streams.append('seen', {}, 'f', { dir, branch, error: answer.error })
    else if (changed) await ctx.streams.append('seen', {}, 'p', { dir, branch, ...answer })
    const unchanged = changed ? 0 : (due.get(key)?.unchanged ?? 0) + 1
    due.set(key, { at: Date.now() + waitOf(periodMs(settings().every), 'error' in answer ? before?.pr : answer.pr, unchanged), unchanged })
    return changed
  }

  /** Asks about the branches, one query per GitHub host, once any round in flight is done: how many changed. */
  const askAbout = (branches: Branch[]): Promise<number> => {
    const asked = queue.then(async () => {
      let changed = 0
      const byHost = new Map<string, (Branch & Repo)[]>()
      for (const b of branches) {
        const repo = await repoOf(b.dir)
        if ('error' in repo) changed += Number(await record(b, repo))
        else byHost.set(repo.host, [...(byHost.get(repo.host) ?? []), { ...b, ...repo }])
      }
      for (const [host, asks] of byHost) {
        if (ctx.signal.aborted) break
        const answers = await askHost(host, asks)
        for (const [i, a] of asks.entries()) {
          const answer = answers[i]
          changed += Number(await record(a, 'pr' in answer && answer.pr ? { ...answer, mine: await mineOf(a, answer.pr) } : answer))
        }
      }
      return changed
    })
    queue = asked.catch(() => undefined)
    return asked
  }

  const onBoard = () => branchesOf(cardsOf(ctx.board()))
  let ticking = false

  return {
    reduce: { seen: { init: {}, step } },
    slots: {
      tick: async () => {
        if (ticking) return
        ticking = true
        try {
          const now = Date.now()
          const dueNow = onBoard().filter((b) => (due.get(keyOf(b.dir, b.branch))?.at ?? 0) <= now)
          if (dueNow.length) await askAbout(dueNow)
        } finally {
          ticking = false
        }
      },
    },
    folds: { card: foldCard },
    board: turnsEnded,
    verbs: {
      ask: async (b: Branch) => ({ changed: (await askAbout([b])) > 0 }),
      'ask-now': async () => {
        const branches = onBoard()
        await askAbout(branches)
        return { asked: branches.length }
      },
    },
    reads: {
      status: () => {
        const branches = Object.values(state()).filter((seen) => due.has(keyOf(seen.dir, seen.branch)))
        const failing = branches.filter((seen) => seen.error !== undefined && !notOnGitHub(seen.error))
        if (!failing.length) {
          const off = branches.filter((seen) => seen.error !== undefined).length
          return { ok: true, message: `asks GitHub about ${branches.length} branch${branches.length === 1 ? '' : 'es'}${off ? `, ${off} in a checkout not on GitHub` : ''}` }
        }
        const errors = [...new Set(failing.map((seen) => seen.error!))]
        return {
          t: 'error',
          code: 'refused',
          message: `${failing.length} of ${branches.length} branches can't be asked: ${errors.map((e) => `${firstLine(e)} (${fixOf(e)})`).join('; ')}`,
        }
      },
      prs: () => ({
        branches: Object.values(state())
          .sort((a, b) => b.at - a.at)
          .map((seen) => {
            const next = due.get(keyOf(seen.dir, seen.branch))
            return { ...seen, ...(next && { dueAt: next.at }) }
          }),
      }),
    },
  }
}

export default start
