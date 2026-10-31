/**
 * Narration's voice command: `say` runs the command the settings name, the text on its stdin, and keeps the audio file
 * it printed under a token; `audio/<token>` serves that file, and only files this server was given so. `voice` says
 * whether a command is set, so the client picks its voice: the command's, or the browser's own speech without one.
 * A worker's card carries its latest memos, the facts its `memo` verb logged.
 */
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { mediaTypeOf } from 'tower:media.js'
import type { CallCtx, FoldCtx, StartCtx } from '../../../src/shared/extensions.ts'

type Settings = { voice?: { command: string[] }; memo?: { maxLength?: number; prefix?: string } }
type Refusal = { t: 'error'; code: 'not_found' | 'refused'; message: string }

/** How many of a worker's memos its card carries: the latest. */
const MEMOS = 20

/** How long one line may take to voice before its command is killed. */
const SAY_MS = 120_000

/** The longest memo and the words said before it, when the settings name neither. */
const MEMO_MAX = 300
const MEMO_PREFIX = '{callsign} says: '

const refusal = (code: Refusal['code'], message: string): Refusal => ({ t: 'error', code, message })

/** The last non-empty line of a command's output. */
const lastLine = (out: string) => out.trim().split('\n').at(-1)?.trim() ?? ''

export default (ctx: StartCtx) => {
  const { voice, memo = {} } = ctx.settings as Settings
  const maxLength = memo.maxLength ?? MEMO_MAX
  const prefix = memo.prefix ?? MEMO_PREFIX
  /** The audio files the command wrote, by the token they are served under: nothing else is served. */
  const voiced = new Map<string, string>()

  /** The file a command printed, kept under a new token, or why it can't be served. */
  const keep = async (printed: string): Promise<{ audio: string } | Refusal> => {
    if (!path.isAbsolute(printed)) return refusal('refused', `the voice command printed "${printed}": it must print the absolute path of the audio file it wrote`)
    if (!mediaTypeOf(printed).startsWith('audio/')) return refusal('refused', `the voice command printed ${printed}, which is no audio file the tower serves (.mp3, .m4a, .aiff, .wav)`)
    if (!(await stat(printed).catch(() => undefined))?.isFile()) return refusal('refused', `the voice command printed ${printed}, which is no file`)
    const token = randomUUID()
    voiced.set(token, printed)
    return { audio: `narrate/audio/${token}` }
  }

  return {
    folds: {
      /** A worker's latest memos over its lineage, each keyed by the session that said it and when. */
      card: (_card: unknown, { own }: FoldCtx) => {
        const memos = (own.facts ?? []).filter((f) => f.name === 'memo').slice(-MEMOS)
        return memos.length ? { x: { memos: memos.map((f) => ({ key: `${f.session}/${f.at}`, at: f.at, text: f.value as string })) } } : {}
      },
    },
    reads: {
      voice: () => ({ command: voice !== undefined }),
      'memo-settings': () => ({ maxLength, prefix }),
      'audio/<token>': ({ params }: { params: { token: string } }) => {
        const file = voiced.get(params.token)
        return file ? { file } : refusal('not_found', `no audio ${params.token}: narration serves only what its voice command wrote since the tower started`)
      },
    },
    verbs: {
      memo: async ({ text }: { text: string }, { caller }: CallCtx) => {
        if (caller.t !== 'worker') return refusal('refused', 'a memo is a worker saying something aloud: only a worker says one, in its own session')
        if (text.length > maxLength) return refusal('refused', `the memo is ${text.length} characters and the limit is ${maxLength}: say it shorter`)
        await ctx.facts.append(caller.id!, 'memo', text)
        return {}
      },
      say: async ({ text }: { text: string }) => {
        if (!voice) return refusal('refused', 'narrate has no voice command: set extensions.narrate.settings.voice.command')
        const [program] = voice.command
        const ran = await ctx.run(voice.command, { cwd: ctx.dir, stdin: text, timeoutMs: SAY_MS }).catch((err: Error) => err)
        if (ran instanceof Error) return refusal('refused', `the voice command ${program} could not start: ${ran.message}`)
        if (ran.timedOut) return refusal('refused', `the voice command ${program} took over ${SAY_MS / 1000} s and was stopped`)
        if (ran.exit !== 0) return refusal('refused', ran.stderr.trim() || `the voice command ${program} failed (${ran.signal ?? `exit ${ran.exit}`}) and said nothing on stderr`)
        return keep(lastLine(ran.stdout))
      },
    },
  }
}
