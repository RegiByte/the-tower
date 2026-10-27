/**
 * A throwaway system for checking renderers: its own config, sockets and logs under its root, sessions as bash loops in
 * place of Claude, and a tower on its own port, kept as `port` in its config. Nothing here reaches the real system.
 *
 * The root (`sandbox-root.ts`) is `TOWER_SANDBOX` when set (sockets cap the path near 104 bytes), else a tower worker's
 * own `/tmp/tower-<callsign>`, else `/tmp/tower-sandbox`. A new sandbox at `/tmp/tower-sandbox` gets port 4399, any
 * other a free port, so workers running at once never share one: run yours with no root or port.
 *
 *   npm run sandbox -- up [--port <n>]   write the config when the sandbox has none, start the host, terms and tower,
 *                                        and print how to reach it; an existing config stays as it is (hand-edit it:
 *                                        `hiring`, more projects), only --port is written into it, and a later `up`
 *                                        without --port keeps the port. A config from an older script keeps its old
 *                                        shape: delete the root to get the current one. `up` refuses a port another
 *                                        tower holds
 *   npm run sandbox -- down              stop this sandbox's three, and no other's
 *   npm run -s sandbox -- run <cmd…>     run a command against the sandbox: TOWER_CONFIG names its config, so `tower`
 *                                        reads it; TOWER_URL is its URL; this checkout's `tower` is first on PATH; and
 *                                        TOWER_SESSION_ID and TOWER_HOOKS_SOCKET are unset, so a worker's own session
 *                                        doesn't reach the real tower. When the sandbox can't be named, nothing runs;
 *                                        nor when this checkout has no node_modules of its own (`npm ci`), which its
 *                                        `tower` runs from
 *   npm run -s sandbox -- env            the same environment as `export` lines, for a shell of your own to `eval`
 *
 * Outside `run`, `tower` reads the real system: the sandbox's root names it only to these scripts and to `tool:frames`
 * and `tool:tour`, which find it as `up` does.
 *
 * Tower 3D runs at <the URL up prints>/r/tower3d/ once built (`npm run tower3d`), a fixture board at …/r/tower3d/?board=busy.
 *
 * Checking a change as an agent: one command (`npm run -s sandbox -- run tower extensions`), or several as a script on
 * stdin, its quotes kept as written:
 *
 *   npm run -s sandbox -- run sh <<'SH'
 *   tower agents --all; tower extensions                                                     the sandbox's workers, extensions
 *   curl -s -XPOST $TOWER_URL/spawn -H "origin: $TOWER_URL" -H 'content-type: application/json' -d '{"project":"lab","cwd":"'$TOWER_SANDBOX/lab'"}'
 *   curl -s -XPOST $TOWER_URL/kill  -H "origin: $TOWER_URL" -H 'content-type: application/json' -d '{"id":"<id>"}'    a finished session
 *   curl -sN -m 2 $TOWER_URL/board | grep -m1 '^data:'                                          {v, board}, once
 *   curl -s $TOWER_URL/conversations/<id>                                                       what its brief shows
 *   npm run drive -- "$TOWER_URL/#<id>" --wait 1500 --eval '<js>' --shot <file>               the tower page on it
 *   curl -s --unix-socket $TOWER_SANDBOX/hooks.sock -d '{"hook_event_name":"tower.claude","version":"9.9.9"}' \
 *     http://host/hooks/<id>                                                                     a release untested
 *   SH
 *
 * Worktrees: `lab` (hub `lab`, repo `lab-api`) has bare origins under `origins/`. Cut on `lab` only: the `tower` floor
 * is this repo, and a cut there is a real worktree in it.
 *
 *   curl -s -XPOST $TOWER_URL/spawn -H "origin: $TOWER_URL" -H 'content-type: application/json' -d '{"project":"lab","cut":{}}'
 *   curl -s -XPOST $TOWER_URL/tidy  -H "origin: $TOWER_URL" -H 'content-type: application/json' -d '{"project":"lab"}'
 *
 * Every POST needs the tower's own Origin (the guard against cross-site requests answers 403 without it). `/board`,
 * `/screen/<id>` and `/shell/<id>` are SSE streams that never end: bound them, or curl hangs. Stop only what you
 * started: `down`, or `kill` a PID you saved; never `pkill`, `killall` or `tower reap`, which reach every worker's.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { initialConfig } from '../src/init.ts'
import { bringAllDown, bringAllUp, daemons } from '../src/machine.ts'
import { CLAUDE_TESTED } from '../src/shared/claude.ts'
import { towerPort } from '../src/shared/model.ts'
import { systemPaths } from '../src/shared/paths.ts'
import { readConfig } from '../src/system.ts'
import { freePort } from './drive.ts'
import { SANDBOX_CONFIG as CONFIG, SANDBOX_ROOT as ROOT, SHARED_SANDBOX, sandboxUrl } from './sandbox-root.ts'

const REPO = path.join(import.meta.dirname, '..')
const BIN = path.join(REPO, 'src', 'mod', 'bin')

process.env.TOWER_CONFIG = CONFIG
/** Claude appends the mod's bin to PATH, behind any global `tower`: a sandbox's sessions run this checkout's first. */
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`

/**
 * A session that prints a line, reports the newest tested Claude release and one saved conversation with a prompt and an answer as Claude's hooks and mod
 * would (or continues the one `--resume` names, on the prompt after `--` when one is given), its step on the model and
 * effort its flags ask for (`claude-<model>-9-9`, else the made-up defaults `claude-opus-9-9` and `medium`), and waits to be killed,
 * exiting 143 on SIGTERM as Claude does: Claude's flags land in `$@`.
 */
const SESSION = String.raw`post() { curl -sS -m 2 --unix-socket "$TOWER_HOOKS_SOCKET" -H 'content-type: application/json' --data-binary "$1" "http://host/hooks/$TOWER_SESSION_ID" >/dev/null; }
conv=$(uuidgen | tr A-Z a-z); source=startup; prompt='Say hello from the sandbox.'; model=claude-opus-9-9; effort=medium
while [ $# -gt 0 ]; do [ "$1" = --resume ] && conv=$2 && source=resume; [ "$1" = --model ] && model=claude-$2-9-9; [ "$1" = --effort ] && effort=$2; [ "$1" = -- ] && prompt=$2; shift; done
prompt=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$prompt")
printf "sandbox session %s in %s\n" "$$" "$PWD"
post '{"hook_event_name":"tower.claude","version":"${CLAUDE_TESTED.highest}"}'
post '{"hook_event_name":"SessionStart","source":"'$source'","session_id":"'$conv'"}'
post '{"hook_event_name":"UserPromptSubmit","session_id":"'$conv'","prompt":'"$prompt"'}'
post '{"hook_event_name":"prompt.submit","origin":{"kind":"composer"},"text":'"$prompt"'}'
post '{"hook_event_name":"turn.step","model":"'$model'","effort":"'$effort'","result":{}}'
post '{"hook_event_name":"turn.complete","answer":"Hello from the sandbox, session '$$'.\n\n- a list\n- of things"}'
trap 'exit 143' TERM
while :; do sleep 3600 & wait; done`

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

/**
 * A repo the tower can cut worktrees in: a first commit on `main` pushed to a bare origin under `origins/`, an ignored
 * `.env` its `.worktreeinclude` copies, and an ignored `.notes` the config links. Push to the origin, or merge
 * there, to play a remote: `git -C $TOWER_SANDBOX/lab push`, `git --git-dir $TOWER_SANDBOX/origins/lab.git …`.
 */
function seedRepo(dir: string) {
  const origin = path.join(ROOT, 'origins', `${path.basename(dir)}.git`)
  if (existsSync(origin)) return
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  if (!existsSync(path.join(dir, '.git'))) execFileSync('git', ['init', '-q', dir])
  git(dir, 'checkout', '-q', '-B', 'main')
  writeFileSync(path.join(dir, 'README.md'), `# ${path.basename(dir)}\n`)
  writeFileSync(path.join(dir, '.gitignore'), '.env\n.notes\n')
  writeFileSync(path.join(dir, '.worktreeinclude'), '.env\n')
  writeFileSync(path.join(dir, '.env'), 'SECRET=sandbox\n')
  mkdirSync(path.join(dir, '.notes'), { recursive: true })
  writeFileSync(path.join(dir, '.notes', 'NOTES.md'), 'shared by every worktree\n')
  git(dir, 'add', '.')
  git(dir, '-c', 'user.name=sandbox', '-c', 'user.email=sandbox@localhost', 'commit', '-q', '-m', 'first')
  git(dir, 'remote', 'add', 'origin', origin)
  git(dir, 'push', '-q', '-u', 'origin', 'main')
  git(dir, 'remote', 'set-head', 'origin', '--auto')
}

function freshConfig(port: number) {
  const lab = path.join(ROOT, 'lab')
  const labApi = path.join(ROOT, 'lab-api')
  for (const dir of [lab, labApi]) seedRepo(dir)
  return {
    argv: ['bash', '-c', SESSION, 'session'],
    port,
    projects: {
      tower: { name: 'tower', color: '#c792ea', hub: REPO, repos: [] },
      lab: { name: 'lab', color: '#7fb069', hub: lab, repos: [labApi], collections: { notes: { label: 'Notes', description: 'Notes the lab keeps on its experiments.' } } },
    },
    collections: {
      ...initialConfig('/', [], undefined).collections,
      games: { label: 'Games', description: "Games played in Tower 3D's arcade: one self-contained .html file each, kept with `tower keep games <file>.html`." },
    },
    worktrees: { links: { '.notes': '.notes' } },
  }
}

async function prepareConfig(port: number | undefined) {
  const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : freshConfig(port ?? (ROOT === SHARED_SANDBOX ? 4399 : await freePort()))
  if (port !== undefined) config.port = port
  /** A sandbox's quota probe would read the real account: it is turned on by hand to try it. */
  if (config.probes === undefined) config.extensions = { quota: { off: true }, ...config.extensions }
  writeFileSync(CONFIG, JSON.stringify(config, null, 2))
}

const OWN_SANDBOX = `Run one of your own beside it: TOWER_SANDBOX=/tmp/tower-<you> npm run sandbox -- up (the root under ~80 bytes: sockets cap it; a new root gets a free port).`

/**
 * What a command run against the sandbox has in its environment: the sandbox's config for `tower`, this checkout's
 * `tower` first, the sandbox's URL as TOWER_URL, and no worker's session, so nothing it runs reaches the real tower.
 */
const sandboxEnv = (): NodeJS.ProcessEnv => {
  /** `bin/tower` runs the checkout's own tsx, which node's lookup up the tree doesn't stand in for. */
  if (!existsSync(path.join(REPO, 'node_modules', '.bin', 'tsx'))) throw new Error(`${REPO} has no node_modules of its own, which its tower runs from: npm ci there first`)
  const { TOWER_SESSION_ID, TOWER_HOOKS_SOCKET, ...env } = process.env
  return { ...env, TOWER_SANDBOX: ROOT, TOWER_CONFIG: CONFIG, TOWER_URL: sandboxUrl() }
}

const RUN_LINE = `npm run -s sandbox -- run <command>    one command, or several as a script: run sh <<'SH' … SH`

const paths = systemPaths(CONFIG)
const [command, ...rest] = process.argv.slice(2)
if (command === 'run') {
  const [program, ...args] = rest[0] === '--' ? rest.slice(1) : rest
  if (!program) throw new Error('usage: npm run -s sandbox -- run <command>')
  const run = spawnSync(program, args, { stdio: 'inherit', env: sandboxEnv() })
  if (run.error) throw run.error
  process.exitCode = run.status ?? 1
} else if (command === 'env') {
  const env = sandboxEnv()
  const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
  for (const key of ['TOWER_SANDBOX', 'TOWER_CONFIG', 'TOWER_URL']) console.log(`export ${key}=${quote(env[key]!)}`)
  console.log(`export PATH=${quote(BIN)}:"$PATH"`)
  console.log('unset TOWER_SESSION_ID TOWER_HOOKS_SOCKET')
} else if (command === 'up') {
  const { values } = parseArgs({ args: rest, options: { port: { type: 'string' } } })
  mkdirSync(ROOT, { recursive: true })
  await prepareConfig(values.port !== undefined ? Number(values.port) : undefined)
  const port = towerPort(readConfig(CONFIG))
  const URL = sandboxUrl()
  const brought = await bringAllUp(daemons(paths, port)).catch((err: Error) => {
    throw new Error(`${err.message}. ${OWN_SANDBOX}`)
  })
  const answers = brought.map(([daemon, answer]) => `${daemon.name}: ${answer}`)
  answers.push(`${URL}/ · ${URL}/r/tower3d/`, '', `${ROOT}: run anything against it, never the real tower, as`, `  ${RUN_LINE}`, '  npm run sandbox -- down                stops it, and only it')
  console.log(answers.join('\n'))
  if (ROOT === SHARED_SANDBOX && answers.some((a) => a.includes('already up'))) console.log(`\n${ROOT} was already up: another worker may be using it, and its down stops yours. ${OWN_SANDBOX}`)
} else if (command === 'down') {
  for (const [daemon, result] of await bringAllDown(daemons(paths, towerPort(readConfig(CONFIG))))) {
    if (result instanceof Error) {
      console.error(result.message)
      process.exitCode = 1
    } else console.log(`${daemon.name}: ${result}`)
  }
} else {
  throw new Error('usage: npm run sandbox -- up [--port <n>] | down | run <command> | env')
}
