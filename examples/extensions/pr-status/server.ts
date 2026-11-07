/**
 * PR status: asks GitHub, through `gh`, for the newest pull request of each branch a worker on the board works on,
 * and appends what it said to its stream `seen` only when that changed. A card's fold reads the stream's state and
 * puts the pull request on the card as badges: its number, where it stands and its review, linking to it, and its
 * checks when they fail or still run.
 *
 * When: at the end of a worker's turn (its board trigger), for that worker's branch; and at its `tick`, for every
 * branch that is due. An open pull request is due every `every`; a branch with none, or with one merged or closed,
 * backs off while GitHub keeps saying the same (`BACKOFF`), since a new one most often shows at a turn's end. Each
 * round is one GraphQL query per GitHub host and `CHUNK` branches, every branch an alias in it.
 */
import type { Board, Card, Floor } from '/lib/board.js'
import type { FoldCtx, Start, StreamFact, TriggerCall } from '/lib/extension.js'

type Settings = { every: string; gh: string[] }
type Review = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
type Checks = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED'
/** A pull request as GitHub said it: `review` and `checks` as its GraphQL names them. */
type Pr = {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  draft: boolean
  url: string
  title: string
  review: Review | null
  checks: Checks | null
  headOid: string
  createdAt: string
}
/** What an ask found: the branch's pull request (the newest GitHub lists by its name that `mineOf` takes for its), or none, or why it couldn't be asked. */
type Answer = { pr: Pr | null } | { error: string }
/** What was last seen of a branch: its pull request as last asked, and `error` while its latest ask failed, which keeps the pull request seen before it. */
type Seen = { dir: string; branch: string; at: number; pr?: Pr | null; error?: string }
/** The stream's state: what was last seen of each checkout's branch, by `keyOf`. */
type State = Record<string, Seen>
type Branch = { dir: string; branch: string }

const keyOf = (dir: string, branch: string) => `${dir}\0${branch}`

/** The stream's fold: a `p` fact is what is seen of its branch now; an `f` fact keeps the pull request seen before it, so one failed ask hides no badge. */
const step = (state: State, [at, code, fact]: StreamFact): State => {
  const { dir, branch } = fact as Branch
  const key = keyOf(dir, branch)
  if (code === 'f') {
    const { pr } = state[key] ?? {}
    return { ...state, [key]: { dir, branch, at, ...(pr !== undefined && { pr }), error: (fact as { error: string }).error } }
  }
  return { ...state, [key]: { dir, branch, at, pr: (fact as { pr: Pr | null }).pr } }
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }
const periodMs = (every: string): number => {
  const [, n, unit] = /^(\d+)(s|m|h)$/.exec(every)!
  return Number(n) * UNIT_MS[unit]
}

/** How long a branch with no open pull request waits between asks, by how many answers in a row were the same: the last for every one after. */
const BACKOFF = [5 * 60_000, 15 * 60_000, 30 * 60_000]

/** How long an open pull request whose checks still run waits between asks: the tick's period, so a result shows within it. */
const RUNNING_CHECKS_MS = 30_000

/**
 * How long a branch waits after an ask: `RUNNING_CHECKS_MS` while its pull request is open and its checks run, `every`
 * while it is open, else `BACKOFF` by its streak of answers unchanged. A failed ask goes by the pull request seen
 * before it, so a blip on an open one is asked again as soon as before.
 */
const waitOf = (every: number, pr: Pr | null | undefined, unchanged: number): number =>
  pr?.state !== 'OPEN'
    ? Math.max(every, BACKOFF[Math.min(unchanged, BACKOFF.length - 1)])
    : pr.checks === 'PENDING' || pr.checks === 'EXPECTED'
      ? Math.min(every, RUNNING_CHECKS_MS)
      : every

/**
 * How early a tick takes a branch for due. Ticks come every 30 seconds and a branch falls due a wait after its last
 * ask ended, a moment past the tick that will find it: without this, every wait would run a tick longer.
 */
const DUE_SLACK_MS = 5_000

const GH_TIMEOUT_MS = 30_000
const GIT_TIMEOUT_MS = 10_000
/**
 * How many branches one query asks about. `ctx.run` keeps 64 KB of a command's stdout, and each branch's answer is up
 * to `CANDIDATES` pull requests of under 1 KB each: 20 keep a query's answer well inside it.
 */
const CHUNK = 20
/** How many pull requests GitHub lists per branch name, newest first: a fork's of the same name may be newer than the branch's own. */
const CANDIDATES = 3

/** A card's worktree in each repo of its floor that has a branch there, the card's own folder first: a worktree spans its floor's repos, each with its own branch and pull requests. */
const treeBranches = (floor: Floor, card: Card): Branch[] => {
  const tree = floor.worktrees.find((t) => t.name === card.worktree?.name)
  const branches = (tree?.repos ?? []).flatMap((repo) => (repo.branch === undefined ? [] : [{ dir: repo.path, branch: repo.branch }]))
  return branches.sort((a, b) => Number(b.dir === card.cwd) - Number(a.dir === card.cwd))
}

type Placed = { floor: Floor; card: Card }

const placedOn = (board: Board): Placed[] => board.floors.flatMap((floor) => floor.cards.map((card) => ({ floor, card })))

/** The branches these workers are on, once each: their worktrees', whose folders are there. The main checkout has none. */
const branchesOf = (placed: Placed[]): Branch[] => {
  const seen = new Map<string, Branch>()
  for (const { floor, card } of placed) {
    if (card.worktree?.gone !== false) continue
    for (const branch of treeBranches(floor, card)) seen.set(keyOf(branch.dir, branch.branch), branch)
  }
  return [...seen.values()]
}

/**
 * The statuses a turn ends in: done, done with something still running, interrupted, failed, or the worker gone
 * (sent home or its process ended) mid-turn. `blocked` and `needs_input` come mid-turn.
 */
const TURN_ENDS: ReadonlySet<Card['status']> = new Set(['done', 'watching', 'idle', 'failed', 'exited', 'lost'])

/**
 * The board trigger: one ask for the branches of the workers in a worktree whose turn ended between two boards, each
 * card working on the first and in a turn's end on the second, which is when a worker has just pushed or opened a
 * pull request.
 */
const turnsEnded = (prev: Board, next: Board): TriggerCall[] => {
  const was = new Map(placedOn(prev).map(({ card }) => [card.id, card.status]))
  const branches = branchesOf(placedOn(next).filter(({ card }) => was.get(card.id) === 'working' && TURN_ENDS.has(card.status)))
  return branches.length ? [{ verb: 'pr-status/ask', input: { branches } }] : []
}

/**
 * A checkout's GitHub repo: its host, owner and name, as `gh repo view` reads it; `remotes`, each remote's `owner/name`
 * by the remote's name, lowercased; and `heads`, every `owner/name` a pull request of its branches may come from: that
 * repo and each remote's.
 */
type Repo = { host: string; owner: string; name: string; remotes: Map<string, string>; heads: Set<string> }

/** The `owner/name` a remote's url names, `git@github.com:o/r.git` or `https://github.com/o/r`, lowercased: as written, before `currentName`. */
const remoteRepoOf = (url: string): string | undefined => /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url)?.slice(1, 3).join('/').toLowerCase()

const PR_FIELDS =
  'number state isDraft url title reviewDecision headRefOid createdAt headRepository { nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }'

/** One query asking for the newest pull requests of each of `n` branches, `b<i>` its alias, its repo and branch passed as variables. */
const queryOf = (n: number): string => {
  const vars = Array.from({ length: n }, (_, i) => `$o${i}: String!, $r${i}: String!, $b${i}: String!`).join(', ')
  const aliases = Array.from(
    { length: n },
    (_, i) => `b${i}: repository(owner: $o${i}, name: $r${i}) { pullRequests(headRefName: $b${i}, first: ${CANDIDATES}, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { ${PR_FIELDS} } } }`,
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
  headRepository: { nameWithOwner: string } | null
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
  seen !== undefined && ('error' in answer ? seen.error === answer.error : seen.error === undefined && JSON.stringify(seen.pr) === JSON.stringify(answer.pr))

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

type Found = { pr: Pr; seen: Seen }

/** What `x` says of a pull request. */
const prPart = ({ pr }: Found) => {
  const review = pr.state === 'OPEN' && pr.review ? REVIEW_WORDS[pr.review] : undefined
  return { number: pr.number, state: stateOf(pr), url: pr.url, title: pr.title, ...(review && { review }), ...(pr.checks && { checks: pr.checks.toLowerCase() }) }
}

/** A pull request's badges: `named` says its repo, for a card showing more than one repo's. */
const prBadges = ({ pr, seen }: Found, named: boolean) => {
  const state = stateOf(pr)
  const open = pr.state === 'OPEN'
  const review = open && pr.review ? REVIEW_WORDS[pr.review] : undefined
  const checks = open && pr.checks ? CHECKS_BADGE[pr.checks] : undefined
  const name = named ? `${repoOfUrl(pr.url).split('/')[1]} ` : ''
  return [
    {
      label: `${name}#${pr.number} ${state}${review ? ` · ${review}` : ''}`,
      tone: TONE[state],
      hint: seen.error === undefined ? prHint(pr) : `${prHint(pr)}\nAs last seen: GitHub can't be asked now (${firstLine(seen.error)})`,
      href: pr.url,
    },
    ...(checks ? [{ ...checks, hint: `The checks on #${pr.number}'s newest commit: ${pr.checks === 'FAILURE' || pr.checks === 'ERROR' ? 'at least one failed' : 'some still run'}\nOpens them on GitHub`, href: `${pr.url}/checks` }] : []),
  ]
}

const foldCard = (card: Card, { own, board }: FoldCtx) => {
  const floor = board.floors.find((f) => f.id === card.project)
  const state = own.streams.seen as State
  const found = (floor ? treeBranches(floor, card) : []).flatMap(({ dir, branch }): Found[] => {
    const seen = state[keyOf(dir, branch)]
    return seen?.pr ? [{ pr: seen.pr, seen }] : []
  })
  const [first, ...rest] = found
  if (!first) return {}
  return {
    x: { ...prPart(first), ...(rest.length && { also: rest.map(prPart) }) },
    badges: found.flatMap((f) => prBadges(f, rest.length > 0)),
  }
}

const start: Start = (ctx) => {
  const settings = () => ctx.settings as Settings
  const state = () => ctx.own.streams('seen') as State
  /** Every round waits for the one before it, so two never append for the same branch at once. */
  let queue: Promise<unknown> = Promise.resolve()
  /**
   * Kept in memory, so a restart asks about every branch once, and dropped for what leaves the board: each checkout's
   * repo, and per branch when it is due next, how many answers in a row were the same, and when it was made.
   */
  const repos = new Map<string, Repo>()
  const due = new Map<string, { at: number; unchanged: number }>()
  const made = new Map<string, number | undefined>()
  /** At halt `ctx.run` kills what it runs: what a killed `gh` or `git` said is no answer, so a round stops recording at once. */
  const halted = () => ctx.signal.aborted

  const gh = (args: string[], cwd: string) => ctx.run([...settings().gh, ...args], { cwd, timeoutMs: GH_TIMEOUT_MS })
  const failed = (ran: Awaited<ReturnType<typeof gh>>): string | undefined =>
    ran.timedOut ? `gh gave no answer within ${GH_TIMEOUT_MS / 1000}s` : ran.exit !== 0 ? (ran.stderr.trim() || `gh exited ${ran.exit ?? ran.signal}`).slice(-500) : undefined
  const git = (args: string[], cwd: string) => ctx.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })

  /**
   * A remote's repo by its name on GitHub now, `owner/name` lowercased: a remote's url keeps a repo's name from before a
   * rename or a transfer, which GitHub redirects and pull requests no longer carry. As written when GitHub can't say.
   */
  const currentName = async (host: string, written: string, dir: string): Promise<string> => {
    const ran = await gh(['repo', 'view', `${host}/${written}`, '--json', 'nameWithOwner'], dir)
    return failed(ran) ? written : (JSON.parse(ran.stdout) as { nameWithOwner: string }).nameWithOwner.toLowerCase()
  }

  const repoOf = async (dir: string): Promise<Repo | { error: string }> => {
    const known = repos.get(dir)
    if (known) return known
    if (halted()) return { error: 'halted' }
    try {
      const ran = await gh(['repo', 'view', '--json', 'nameWithOwner,url'], dir)
      const error = failed(ran)
      if (error) return { error }
      const { nameWithOwner, url } = JSON.parse(ran.stdout) as { nameWithOwner: string; url: string }
      const [owner, name] = nameWithOwner.split('/')
      const host = new URL(url).host
      const named = new Map(
        (await git(['remote', '-v'], dir)).stdout.split('\n').flatMap((line): [string, string][] => {
          const [remote, at] = line.split(/\s+/)
          const repo = at === undefined ? undefined : remoteRepoOf(at)
          return repo ? [[remote, repo]] : []
        }),
      )
      const remotes = new Map<string, string>()
      for (const [remote, written] of named) remotes.set(remote, await currentName(host, written, dir))
      if (halted()) return { error: 'halted' }
      const repo = { host, owner, name, remotes, heads: new Set([nameWithOwner.toLowerCase(), ...remotes.values()]) }
      repos.set(dir, repo)
      return repo
    } catch (err) {
      return { error: (err as Error).message.slice(-500) }
    }
  }

  /** When the branch was made, epoch ms: its reflog's first entry, or undefined without one. It doesn't change, so it is read once. */
  const madeAt = async ({ dir, branch }: Branch): Promise<number | undefined> => {
    const key = keyOf(dir, branch)
    if (made.has(key)) return made.get(key)
    const first = /@\{(\d+)\}$/.exec((await git(['reflog', 'show', '--date=unix', '--format=%gd', branch], dir)).stdout.trim().split('\n').at(-1) ?? '')
    const at = first ? Number(first[1]) * 1000 : undefined
    made.set(key, at)
    return at
  }

  /** The repo the branch pushes to, `owner/name` lowercased: its push remote's (`git push -u` sets it), or undefined before it was pushed. */
  const pushedTo = async (b: Branch & Repo): Promise<string | undefined> => {
    const remote = (await git(['for-each-ref', '--format=%(push:remotename)', `refs/heads/${b.branch}`], b.dir)).stdout.trim()
    return remote ? b.remotes.get(remote) : undefined
  }

  /**
   * Whether a pull request GitHub lists by the branch's name is this branch's.
   *
   * A pushed branch's pull requests come from the repo it pushes to (`push`): others of the same name (a stranger's
   * fork, or the upstream repo where others push branches named like yours) are not its. Of those, one opened after
   * the branch was made is its, which holds through a rebase or an amend not yet pushed, while a name a later worker
   * reuses (`tower/<callsign>`) shows none of the pull requests opened before. One opened before is its only while
   * open with its head commit in the branch's history: a branch checked out from a pull request's.
   *
   * A branch not yet pushed has opened no pull request of its own: one counts only from a repo the checkout knows
   * (`Repo.heads`) with its head commit in the branch's history, a branch checked out from it with no push remote yet.
   * Without a reflog, its head commit in the branch's history, or one git doesn't have, decides.
   */
  const mineOf = async (b: Branch & Repo, push: string | undefined, pr: Pr, head: string | undefined): Promise<boolean> => {
    const from = head?.toLowerCase()
    if (from === undefined || (push === undefined ? !b.heads.has(from) : from !== push)) return false
    const ancestor = async () => (await git(['merge-base', '--is-ancestor', pr.headOid, b.branch], b.dir)).exit
    if (push === undefined) return (await ancestor()) === 0
    const since = await madeAt(b)
    if (since !== undefined && Date.parse(pr.createdAt) >= since) return true
    const exit = await ancestor()
    return since === undefined ? exit !== 1 : pr.state === 'OPEN' && exit === 0
  }

  /**
   * One query for up to `CHUNK` branches on one host: each its answer. GitHub answers what it can and lists an error
   * per alias it couldn't (a repo gone or out of reach), and `gh` then exits 1 with that answer on stdout: each alias
   * takes its own data or its own error, so one repo out of reach fails only its branches. With no answer at all, every
   * branch takes `gh`'s error. Each branch's answer is the newest of its candidates that `mineOf` takes for its; undefined once halted.
   */
  const askHost = async (host: string, asks: (Branch & Repo)[]): Promise<Answer[] | undefined> => {
    const vars = asks.flatMap((a, i) => ['-f', `o${i}=${a.owner}`, '-f', `r${i}=${a.name}`, '-f', `b${i}=${a.branch}`])
    try {
      const ran = await gh(['api', 'graphql', '--hostname', host, '-f', `query=${queryOf(asks.length)}`, ...vars], asks[0].dir)
      if (halted()) return undefined
      const answered = graphqlOf(ran.stdout)
      const error = failed(ran)
      if (!answered) return asks.map(() => ({ error: error ?? `gh answered no GraphQL data: ${ran.stdout.slice(0, 200)}` }))
      const answers: Answer[] = []
      for (const [i, a] of asks.entries()) {
        const repo = answered.data[`b${i}`]
        if (!repo) {
          const said = answered.errors?.find((e) => e.path?.[0] === `b${i}`)?.message
          answers.push({ error: (said ?? error ?? `GitHub on ${host} answered nothing for ${a.owner}/${a.name}`).slice(0, 500) })
          continue
        }
        let mine: Pr | null = null
        const push = repo.pullRequests.nodes.length ? await pushedTo(a) : undefined
        for (const node of repo.pullRequests.nodes) {
          const pr = prOf(node)
          if (await mineOf(a, push, pr, node.headRepository?.nameWithOwner)) {
            mine = pr
            break
          }
          if (halted()) return undefined
        }
        if (halted()) return undefined
        answers.push({ pr: mine })
      }
      return answers
    } catch (err) {
      if (halted()) return undefined
      const error = (err as Error).message.slice(-500)
      return asks.map(() => ({ error }))
    }
  }

  /** Records an answer when it changed, and when the branch is due next: whether it changed. A first answer since the start starts the streak. */
  const record = async ({ dir, branch }: Branch, answer: Answer): Promise<boolean> => {
    const key = keyOf(dir, branch)
    const before = state()[key]
    const changed = !sameAnswer(before, answer)
    if (changed && 'error' in answer) await ctx.streams.append('seen', {}, 'f', { dir, branch, error: answer.error })
    if (changed && 'pr' in answer) await ctx.streams.append('seen', {}, 'p', { dir, branch, pr: answer.pr })
    const last = due.get(key)
    const unchanged = changed || !last ? 0 : last.unchanged + 1
    due.set(key, { at: Date.now() + waitOf(periodMs(settings().every), 'error' in answer ? before?.pr : answer.pr, unchanged), unchanged })
    return changed
  }

  /** Asks about the branches, `CHUNK` per query and host, once any round in flight is done: how many changed. A halt stops it before it records anything more. */
  const askAbout = (branches: Branch[]): Promise<number> => {
    const asked = queue.then(async () => {
      let changed = 0
      const byHost = new Map<string, (Branch & Repo)[]>()
      for (const b of branches) {
        const repo = await repoOf(b.dir)
        if (halted()) return changed
        if ('error' in repo) changed += Number(await record(b, repo))
        else byHost.set(repo.host, [...(byHost.get(repo.host) ?? []), { ...b, ...repo }])
      }
      for (const [host, all] of byHost) {
        for (let from = 0; from < all.length; from += CHUNK) {
          if (halted()) return changed
          const asks = all.slice(from, from + CHUNK)
          const answers = await askHost(host, asks)
          if (!answers) return changed
          for (const [i, a] of asks.entries()) changed += Number(await record(a, answers[i]))
        }
      }
      return changed
    })
    queue = asked.catch(() => undefined)
    return asked
  }

  /** Forgets what memory holds of the branches and checkouts no longer on the board. */
  const forgetGone = (branches: Branch[]) => {
    const keys = new Set(branches.map((b) => keyOf(b.dir, b.branch)))
    const dirs = new Set(branches.map((b) => b.dir))
    for (const key of [...due.keys()]) if (!keys.has(key)) due.delete(key)
    for (const key of [...made.keys()]) if (!keys.has(key)) made.delete(key)
    for (const dir of [...repos.keys()]) if (!dirs.has(dir)) repos.delete(dir)
  }

  const onBoard = () => branchesOf(placedOn(ctx.board()))
  let ticking = false

  return {
    reduce: { seen: { init: {}, step } },
    slots: {
      tick: async () => {
        if (ticking) return
        ticking = true
        try {
          const now = Date.now()
          const branches = onBoard()
          forgetGone(branches)
          const dueNow = branches.filter((b) => (due.get(keyOf(b.dir, b.branch))?.at ?? 0) <= now + DUE_SLACK_MS)
          if (dueNow.length) await askAbout(dueNow)
        } finally {
          ticking = false
        }
      },
    },
    folds: { card: foldCard },
    board: turnsEnded,
    verbs: {
      ask: async ({ branches }: { branches: Branch[] }) => ({ changed: await askAbout(branches) }),
      'ask-now': async () => {
        const branches = onBoard()
        await askAbout(branches)
        return halted() ? { t: 'error', code: 'unavailable', message: 'pr-status stopped while it asked: ask again once it runs' } : { asked: branches.length }
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
