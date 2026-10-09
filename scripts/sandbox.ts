/**
 * A throwaway system for checking renderers: its own config, sockets and logs under `TOWER_SANDBOX` (default
 * `/tmp/tower-sandbox`; sockets cap the path near 104 bytes), sessions as bash loops in place of Claude, and a tower on
 * its own port, kept as `port` in its config (4399 for a new sandbox). Nothing here reaches the real system. Workers
 * running at once each pick their own root and port (`TOWER_SANDBOX=/tmp/tower-<callsign> npm run sandbox -- up --port
 * <port>`): `up` refuses a port another tower holds.
 *
 *   npm run sandbox -- up [--port <n>]   write the config, start the host, terms and tower; the port stays in the
 *                                        config, so a later `up` without --port keeps it
 *   npm run sandbox -- down              stop all three
 *
 * Tower 3D runs at <the URL up prints>/r/tower3d/ once built (`npm run tower3d`), a fixture board at …/r/tower3d/?board=busy.
 *
 * Checking a change as an agent:
 *
 *   B=http://127.0.0.1:4399                                                                         the URL up prints
 *   curl -s -XPOST $B/spawn -H "origin: $B" -H 'content-type: application/json' -d '{"project":"lab","cwd":"/tmp/tower-sandbox/lab"}'
 *   curl -s -XPOST $B/kill  -H "origin: $B" -H 'content-type: application/json' -d '{"id":"<id>"}'    a finished session
 *   curl -sN -m 2 $B/board | grep -m1 '^data:'                                                      {v, board}, once
 *   curl -s $B/conversations/<id>                                                                   what its brief shows
 *   npm run drive -- "$B/#<id>" --wait 1500 --eval '<js>' --shot <file>                           the tower page on it
 *   curl -s --unix-socket $TOWER_SANDBOX/hooks.sock -d '{"hook_event_name":"tower.claude","version":"9.9.9"}' \
 *     http://host/hooks/<id>                                                                         a release untested
 *
 * Worktrees: `lab` (hub `lab`, repo `lab-api`) has bare origins under `origins/`. Cut on `lab` only: the `tower` floor
 * is this repo, and a cut there is a real worktree in it.
 *
 *   curl -s -XPOST $B/spawn -H "origin: $B" -H 'content-type: application/json' -d '{"project":"lab","cut":{}}'
 *   curl -s -XPOST $B/tidy  -H "origin: $B" -H 'content-type: application/json' -d '{"project":"lab"}'
 *
 * Every POST needs the tower's own Origin (the guard against cross-site requests answers 403 without it). `/board`,
 * `/screen/<id>` and `/shell/<id>` are SSE streams that never end: bound them, or curl hangs.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { initialConfig } from '../src/init.ts'
import { bringAllDown, bringAllUp, daemons } from '../src/machine.ts'
import { CLAUDE_TESTED } from '../src/shared/claude.ts'
import { towerPort } from '../src/shared/model.ts'
import { systemPaths } from '../src/shared/paths.ts'
import { readConfig } from '../src/system.ts'
import { SANDBOX_CONFIG as CONFIG, SANDBOX_ROOT as ROOT, sandboxUrl } from './sandbox-root.ts'

const REPO = path.join(import.meta.dirname, '..')

process.env.TOWER_CONFIG = CONFIG

/**
 * A session that prints a line, reports the newest tested Claude release and one saved conversation with a prompt and an answer as Claude's hooks and mod
 * would (or continues the one `--resume` names, on the prompt after `--` when one is given), and waits to be killed: Claude's flags land in `$@`.
 */
const SESSION = String.raw`post() { curl -sS -m 2 --unix-socket "$TOWER_HOOKS_SOCKET" -H 'content-type: application/json' --data-binary "$1" "http://host/hooks/$TOWER_SESSION_ID" >/dev/null; }
conv=$(uuidgen | tr A-Z a-z); source=startup; prompt='Say hello from the sandbox.'
while [ $# -gt 0 ]; do [ "$1" = --resume ] && conv=$2 && source=resume; [ "$1" = -- ] && prompt=$2; shift; done
prompt=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$prompt")
printf "sandbox session %s in %s\n" "$$" "$PWD"
post '{"hook_event_name":"tower.claude","version":"${CLAUDE_TESTED.highest}"}'
post '{"hook_event_name":"SessionStart","source":"'$source'","session_id":"'$conv'"}'
post '{"hook_event_name":"UserPromptSubmit","session_id":"'$conv'","prompt":'"$prompt"'}'
post '{"hook_event_name":"prompt.submit","origin":{"kind":"composer"},"text":'"$prompt"'}'
post '{"hook_event_name":"turn.complete","answer":"Hello from the sandbox, session '$$'.\n\n- a list\n- of things"}'
while :; do sleep 3600; done`

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

function writeConfig(port: number) {
  const lab = path.join(ROOT, 'lab')
  const labApi = path.join(ROOT, 'lab-api')
  for (const dir of [lab, labApi]) seedRepo(dir)
  writeFileSync(CONFIG, JSON.stringify({
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
  }, null, 2))
}

const OWN_SANDBOX = `Run one of your own beside it: TOWER_SANDBOX=/tmp/tower-<you> npm run sandbox -- up --port <free port> (the root under ~80 bytes: sockets cap it).`

const paths = systemPaths(CONFIG)
const { positionals: [command], values } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' } } })
if (command === 'up') {
  mkdirSync(ROOT, { recursive: true })
  writeConfig(values.port !== undefined ? Number(values.port) : existsSync(CONFIG) ? towerPort(readConfig(CONFIG)) : 4399)
  const port = towerPort(readConfig(CONFIG))
  const URL = sandboxUrl()
  const brought = await bringAllUp(daemons(paths, port)).catch((err: Error) => {
    throw new Error(`${err.message}. ${OWN_SANDBOX}`)
  })
  const answers = brought.map(([daemon, answer]) => `${daemon.name}: ${answer}`)
  answers.push(`${URL}/ · ${URL}/r/tower3d/`)
  console.log(answers.join('\n'))
  if (answers.some((a) => a.includes('already up'))) console.log(`\n${ROOT} was already up: another worker may be using it, and its down stops yours. ${OWN_SANDBOX}`)
} else if (command === 'down') {
  for (const [daemon, result] of await bringAllDown(daemons(paths, towerPort(readConfig(CONFIG))))) {
    if (result instanceof Error) {
      console.error(result.message)
      process.exitCode = 1
    } else console.log(`${daemon.name}: ${result}`)
  }
} else {
  throw new Error('usage: npm run sandbox -- up [--port <n>] | down')
}
