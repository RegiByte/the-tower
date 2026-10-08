/**
 * Runs a program inside a PTY and relays it to this terminal, while recording both sides of it:
 *
 *   out/raw.log     every byte the program printed: the stream of drawing instructions
 *   out/screen.txt  that stream reduced by a headless xterm into the screen it draws, every second
 *
 *   npm run spike:pty              # claude
 *   npm run spike:pty -- htop      # anything else
 *   watch -n1 cat spikes/pty/out/screen.txt   # in another pane
 */
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as pty from '@lydell/node-pty'
import headless from '@xterm/headless'

type Terminal = InstanceType<typeof headless.Terminal>
type Meta = { title: string; busy: boolean }

const visibleRows = (term: Terminal): string[] => {
  const buf = term.buffer.active
  return Array.from({ length: term.rows }, (_, i) => buf.getLine(buf.baseY + i)?.translateToString(true) ?? '')
}

const renderScreen = (meta: Meta, rows: string[]): string =>
  [`title: ${meta.title}`, `busy:  ${meta.busy}`, '─'.repeat(40), ...rows].join('\n')

/** OSC 9;4;<state> is a progress report: 0 clears it, anything else means work in progress. */
const progressBusy = (osc: string): boolean | undefined => {
  const m = /^4;(\d)/.exec(osc)
  return m ? m[1] !== '0' : undefined
}

/**
 * A parent Claude Code session marks its descendants' environment. A Claude spawned with those
 * markers believes it is a child session: it stops saving its transcript, and it inherits the
 * parent's messaging socket and token.
 */
const PARENT_SESSION_VARS = new Set(['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_EXECPATH'])
const PARENT_SESSION_PREFIXES = ['CLAUDE_CODE_SESSION', 'CLAUDE_CODE_CHILD', 'CLAUDE_CODE_MESSAGING']

const isParentSessionVar = (key: string): boolean =>
  PARENT_SESSION_VARS.has(key) || PARENT_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))

const withoutParentSession = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !isParentSessionVar(entry[0])))

if (!process.stdin.isTTY) throw new Error('Run this from a real terminal: it puts stdin in raw mode.')

const [file = 'claude', ...args] = process.argv.slice(2)
const outDir = path.join(import.meta.dirname, 'out')
mkdirSync(outDir, { recursive: true })
const rawLog = createWriteStream(path.join(outDir, 'raw.log'))
const screenPath = path.join(outDir, 'screen.txt')

const size = () => ({ cols: process.stdout.columns, rows: process.stdout.rows })

const proc = pty.spawn(file, args, {
  name: 'xterm-256color',
  ...size(),
  cwd: process.cwd(),
  env: withoutParentSession(process.env),
})
const term = new headless.Terminal({ ...size(), allowProposedApi: true })
const meta: Meta = { title: '', busy: false }

term.onTitleChange((title) => (meta.title = title))
term.parser.registerOscHandler(9, (osc) => {
  meta.busy = progressBusy(osc) ?? meta.busy
  return true
})

proc.onData((data) => {
  process.stdout.write(data)
  rawLog.write(data)
  term.write(data)
})

process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (keys: string) => proc.write(keys))

process.stdout.on('resize', () => {
  const { cols, rows } = size()
  proc.resize(cols, rows)
  term.resize(cols, rows)
})

const snapshot = () => writeFileSync(screenPath, renderScreen(meta, visibleRows(term)))
const timer = setInterval(snapshot, 1000)

proc.onExit(({ exitCode }) => {
  clearInterval(timer)
  term.write('', () => {
    snapshot()
    rawLog.end()
    process.stdin.setRawMode(false)
    process.exit(exitCode)
  })
})
