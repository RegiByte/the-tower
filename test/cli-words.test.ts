import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { ALIASES, aliased, movedLine, type WordOwner } from '../src/cli-verbs.ts'
import { helpLines, jsonArgument, jsonDeprecatedLine, missingLine, nearest, parseWord, printedOf, readUrl, typedLine, unknownWordLines, usageOf, wordNamed, wordsOf, type Word } from '../src/shared/cli-words.ts'
import { Manifest } from '../src/shared/extensions.ts'

const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', 'extensions', 'typed', 'extension.json'), 'utf8')))
const WORDS = wordsOf(manifest)
const word = (name: string): Word => wordNamed(WORDS, name)!
const input = (name: string, ...args: string[]) => {
  const parsed = parseWord('typed', word(name), args)
  assert.equal(parsed.t, 'input', JSON.stringify(parsed))
  return (parsed as Extract<typeof parsed, { t: 'input' }>).input
}
const bad = (name: string, ...args: string[]) => {
  const parsed = parseWord('typed', word(name), args)
  assert.equal(parsed.t, 'bad', JSON.stringify(parsed))
  const { message, fix } = parsed as Extract<typeof parsed, { t: 'bad' }>
  return [message, fix]
}

test('a string is taken as typed, by either form of its flag, even when it looks like a flag', () => {
  assert.deepEqual(input('echo', '--text', 'hello there'), { text: 'hello there' })
  assert.deepEqual(input('echo', '--text=a=b'), { text: 'a=b' })
  assert.deepEqual(input('echo', '--text', '--not-a-flag'), { text: '--not-a-flag' })
})

test('a number is converted, or refused with its field and the type it wants', () => {
  assert.deepEqual(input('count', '--times', '3', '--ratio=1.5'), { times: 3, ratio: 1.5 })
  assert.deepEqual(input('count', '--times', '-2'), { times: -2 })
  assert.deepEqual(bad('count', '--times', '1.5'), ['--times wants an integer, not "1.5"', '`tower x typed count --help` says what it takes'])
  assert.deepEqual(bad('count', '--times', '1', '--ratio', 'lots'), ['--ratio wants a number, not "lots"', '`tower x typed count --help` says what it takes'])
})

test('a boolean is a bare flag, or converted from its value', () => {
  assert.deepEqual(input('flag', '--loud'), { loud: true })
  assert.deepEqual(input('flag', '--loud=false'), { loud: false })
  assert.deepEqual(bad('flag', '--loud=maybe')[0], '--loud wants true or false, not "maybe"')
})

test('an array takes its flag repeated, each value by its items; a single value twice is refused', () => {
  assert.deepEqual(input('tags', '--tag', 'a', '--tag', 'b', '--n', '1', '--n=2'), { tag: ['a', 'b'], n: [1, 2] })
  assert.deepEqual(bad('tags', '--n', 'x')[0], '--n wants an integer, not "x"')
  assert.deepEqual(bad('echo', '--text', 'a', '--text', 'b')[0], '--text was given twice: it takes one value')
})

test('objects and arrays of objects take JSON as the value of their flag, and nowhere else', () => {
  assert.deepEqual(input('shape', '--box', '{"w": 1}'), { box: { w: 1 } })
  assert.deepEqual(input('shape', '--marks', '{"a": 1}', '--marks', '[{"b": 2}, {"c": 3}]'), { marks: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  assert.deepEqual(bad('shape', '--box', '{nope')[0], '--box wants JSON, not "{nope"')
})

test('positional fields are taken in order, an array the rest; a word by another name and its verb are one', () => {
  assert.deepEqual(input('send', 'HOLMES-42'), { to: 'HOLMES-42' })
  assert.deepEqual(input('send', '--to', 'HOLMES-42'), { to: 'HOLMES-42' })
  assert.deepEqual(input('resolve', '3', '4'), { notes: [3, 4] })
  assert.deepEqual(input('review', 'ODIN-7', '--tell'), { of: 'ODIN-7', tell: true })
  assert.equal(word('hire'), word('review'))
  assert.deepEqual(input('send', '--', '--dashed'), { to: '--dashed' })
  assert.deepEqual(bad('send', 'a', 'b')[0], 'send takes no argument "b"')
  assert.deepEqual(bad('resolve', 'n3')[0], '<notes> wants an integer, not "n3"')
})

test('a read is typed by its params and query, and reached by its path with the path settling its params', () => {
  const thread = word('thread')
  assert.deepEqual(input('thread', 'odin-1', '--project', 'lab'), { checkout: 'odin-1', project: 'lab' })
  assert.equal(readUrl('typed', thread, { checkout: 'odin 1', project: 'lab' }), '/typed/said/lab?checkout=odin+1')
  const path = wordNamed(WORDS, 'plain/42')!
  assert.deepEqual(parseWord('typed', path, ['--limit', '3']), { t: 'input', input: { limit: '3' } })
  assert.equal(readUrl('typed', path, { limit: '3' }), '/typed/plain/42?limit=3')
  assert.equal(path.word, undefined)
  assert.equal(wordNamed(WORDS, 'plain'), undefined)
})

test('a missing flag or input names it, with an example that keeps what was typed', () => {
  assert.equal(missingLine('typed', word('note'), { project: 'lab', re: 3 }), "note needs its body on stdin: tower x typed note --re 3 <<'EOF' … EOF")
  assert.equal(missingLine('typed', word('note'), { body: 'b\n' }), "note needs --project: tower x typed note --project <project> <<'EOF' … EOF")
  assert.equal(missingLine('typed', word('count'), {}), 'count needs --times: tower x typed count --times <times>')
  assert.equal(missingLine('typed', word('send'), {}), 'send needs <to>: tower x typed send <to>')
  assert.equal(missingLine('typed', word('note'), { project: 'lab', body: 'b' }), undefined)
})

test('an unknown word suggests the nearest of its words and the listing command; an unknown flag the nearest flag', () => {
  assert.deepEqual(unknownWordLines('typed', WORDS, 'nite'), { message: 'typed has no word "nite"', fix: 'Did you mean note? `tower x typed` lists its words' })
  assert.deepEqual(unknownWordLines('typed', WORDS, 'zzzzzzzzzz'), { message: 'typed has no word "zzzzzzzzzz"', fix: '`tower x typed` lists its words' })
  assert.deepEqual(bad('note', '--ree', '3'), ['note has no --ree', 'Did you mean --re? `tower x typed note --help` says what it takes'])
  assert.deepEqual(bad('count', '--times'), ['--times needs a value', '`tower x typed count --help` says what it takes'])
  assert.equal(nearest('resolv', ['send', 'resolve']), 'resolve')
})

test("usage comes from cli.usage, else from the fields; help lists each flag", () => {
  assert.equal(usageOf(word('note')), 'note [--re <n>] [--at <repo>:<path>:<from>[-<to>] …]')
  assert.equal(usageOf(word('count')), 'count --times <times> [--ratio <ratio>]')
  assert.equal(usageOf(word('resolve')), "resolve <notes> … [<<'EOF' … EOF]")
  assert.equal(usageOf(word('review')), 'review <of> [--tell]')
  assert.equal(usageOf(word('thread')), 'thread [<checkout>] [--project <project>]')
  assert.deepEqual(helpLines('typed', word('echo')), ['tower x typed echo --text <text>', 'Says the text back.', '  --text  a string, required: What to say back.'])
  assert.deepEqual(parseWord('typed', word('echo'), ['--help']), { t: 'help' })
  assert.deepEqual(helpLines('typed', word('note')).slice(1, 3), ["  --project  a string, your floor's when left out", '  --body  a string, or text on stdin, required'])
})

test('a JSON argument is still read, and says what to type instead', () => {
  assert.deepEqual(jsonArgument(word('count'), ['{"times": 3}']), { body: { times: 3 } })
  assert.deepEqual(jsonArgument(word('send'), ['{"to": "X"}']), { body: { to: 'X' } })
  assert.equal(jsonArgument(word('send'), ['HOLMES-42']), undefined)
  assert.equal(jsonArgument(word('count'), ['--times', '3']), undefined)
  assert.equal(jsonDeprecatedLine('typed', word('count'), { times: 3 }), 'A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x typed count --times 3')
  assert.equal(jsonDeprecatedLine('typed', word('note'), { body: 'b', at: ['a:b:1', 'a:c d:2'], re: 3 }), "A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x typed note --re 3 --at a:b:1 --at 'a:c d:2' <<'EOF' … EOF")
  assert.equal(typedLine('typed', word('review'), { of: 'ODIN-7', tell: true }), 'tower x typed review ODIN-7 --tell')
  assert.equal(typedLine('typed', word('shape'), { box: { w: 1 } }), `tower x typed shape --box '{"w":1}'`)
  const help = (name: string) => `A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x typed ${name} --help`
  assert.equal(jsonDeprecatedLine('typed', word('count'), [1]), help('count'))
  assert.equal(jsonDeprecatedLine('typed', word('tags'), { tag: 'x' }), help('tags'))
  assert.equal(jsonDeprecatedLine('typed', word('tags'), { tag: null }), help('tags'))
  assert.equal(jsonDeprecatedLine('typed', word('tags'), { n: ['x'] }), help('tags'))
  assert.equal(jsonDeprecatedLine('typed', word('resolve'), { notes: 3 }), help('resolve'))
  assert.equal(jsonDeprecatedLine('typed', word('count'), { times: 3, other: 1 }), help('count'))
  assert.equal(jsonDeprecatedLine('typed', word('echo'), { text: null }), help('echo'))
  assert.equal(jsonDeprecatedLine('typed', word('echo'), { text: 3 }), help('echo'))
})

test('a door needs --value, a blank reaches it as an empty string, and a null is typed only on a string door', () => {
  const tabline = Manifest.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'examples', 'extensions', 'tabline', 'extension.json'), 'utf8')))
  const door = wordNamed(wordsOf(tabline), 'facts/line')!
  assert.equal(missingLine('tabline', door, {}), 'facts/line needs --value: tower x tabline facts/line --value <value>')
  assert.deepEqual(parseWord('tabline', door, ['--value', '']), { t: 'input', input: { value: '' } })
  assert.deepEqual(parseWord('tabline', door, ['--value=']), { t: 'input', input: { value: '' } })
  assert.equal(missingLine('tabline', door, { value: '' }), undefined)
  assert.deepEqual(parseWord('tabline', door, ['--value', 'null']), { t: 'input', input: { value: 'null' } })
  assert.equal(usageOf(door), 'facts/line --value <value> [--session <session>]')
  assert.equal(jsonDeprecatedLine('tabline', door, { value: null }), 'A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x tabline facts/line --value ""')
  assert.equal(jsonDeprecatedLine('tabline', door, { value: 'on it' }), "A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x tabline facts/line --value 'on it'")
  const counter: Word = { ...door, fields: [{ ...door.fields[0], takes: 'integer' }, door.fields[1]] }
  assert.equal(jsonDeprecatedLine('tabline', counter, { value: null }), 'A JSON argument to tower x is deprecated and goes at 2.0. A null has no typed form on facts/line: a door that needs one should offer a verb.')
  const shaped: Word = { ...door, fields: [{ ...door.fields[0], takes: 'json' }, door.fields[1]] }
  assert.equal(jsonDeprecatedLine('tabline', shaped, { value: null }), 'A JSON argument to tower x is deprecated and goes at 2.0. Type instead: tower x tabline facts/line --value null')
  assert.deepEqual(parseWord('tabline', shaped, ['--value', 'null']), { t: 'input', input: { value: null } })
})

test('printing names a string or lines, and a field the reply left out prints nothing', () => {
  assert.equal(printedOf({ said: 'hi' }, 'said'), 'hi')
  assert.equal(printedOf({ lines: ['a', 'b'] }, 'lines'), 'a\nb')
  assert.equal(printedOf({}, 'said'), undefined)
})

test("reviews' old words rewrite into its words, the note's grammar into flags", () => {
  const typed = (name: string, ...words: string[]) => aliased(ALIASES[name], name, words).args.join(' ')
  assert.equal(typed('note'), 'reviews note')
  assert.equal(typed('note', 're', 'n3'), 'reviews note --re n3')
  assert.equal(typed('note', 'on', 'odin-1', 're', '3', 'lab:src/a.ts:1-9', 'lab:b.ts:2'), 'reviews note --on odin-1 --re 3 --at lab:src/a.ts:1-9 --at lab:b.ts:2')
  assert.equal(typed('note', 'resolve', 'n3', 'n4'), 'reviews resolve n3 n4')
  assert.equal(typed('note', 'on', 'odin-1', 'resolve', 'n3'), 'reviews resolve n3 --on odin-1')
  assert.equal(typed('note', 're', 'n3', 'on', 'odin-1'), 'reviews note --re n3 --on odin-1')
  assert.equal(typed('note', 'lab:a.ts:1', 're', 'n3'), 'reviews note --at lab:a.ts:1 --re n3')
  assert.equal(typed('note', 'resolve', 'n3', 'on', 'odin-1'), 'reviews resolve n3 --on odin-1')
  assert.equal(typed('note', '--help'), 'reviews note --help')
  assert.equal(typed('thread', 'odin-1'), 'reviews thread odin-1')
  assert.equal(typed('send', 'ODIN-1'), 'reviews send ODIN-1')
  assert.equal(typed('review', 'ODIN-1', 'tell'), 'reviews review ODIN-1 --tell')
})

test('an old word rewrites into its word under tower x and says so', () => {
  assert.deepEqual(aliased({ now: 'reviews note', args: (words) => words.map((w) => w.replace(/^n/, '--re=')) }, 'note', ['n3']), { args: ['reviews', 'note', '--re=3'], line: 'tower note n3 is tower x reviews note --re=3; the old word goes at 2.0' })
})

test('a capability or its word typed at the top names its form under tower x, a stopped owner with its state', () => {
  const owner = (provides: string, words: string[], state: WordOwner['state'] = 'started'): WordOwner => ({ provides, state, words: words.map((w) => ({ ...word('echo'), name: w, word: w })) })
  const owners = [owner('quota', [], 'off'), owner('quota', ['limits', 'status']), owner('pr-status', ['status']), owner('reviews', ['thread', 'note']), owner('narrate', ['say'], 'failed')]
  assert.deepEqual(movedLine('limits', owners), { message: '"limits" is under tower x: tower x quota limits', fix: '`tower x quota limits --help` says what it takes' })
  assert.deepEqual(movedLine('status', owners), { message: '"status" is under tower x: tower x quota status, or tower x pr-status status', fix: '`tower x quota` and `tower x pr-status` list their words' })
  assert.deepEqual(movedLine('reviews', owners), { message: '"reviews" is under tower x: tower x reviews', fix: '`tower x reviews` lists its words' })
  assert.deepEqual(movedLine('quota', owners), { message: '"quota" is under tower x: tower x quota', fix: '`tower x quota` lists its words' })
  assert.deepEqual(movedLine('quota', [owner('quota', [], 'off')]), { message: '"quota" is under tower x: tower x quota (quota: off)', fix: '`tower extensions` lists each extension and its state' })
  assert.deepEqual(movedLine('say', owners), { message: '"say" is under tower x: tower x narrate say (narrate: failed to start)', fix: '`tower extensions` lists each extension and its state' })
  assert.equal(movedLine('x-typo', owners), undefined)
})

test("policies' and quota's old words each reach the word that replaced them", () => {
  const typed = (name: string, ...words: string[]) => aliased(ALIASES[name], name, words).args.join(' ')
  assert.equal(typed('policies'), 'policies list')
  assert.equal(typed('policies', 'run', 'warm-lily'), 'policies run-now warm-lily')
  assert.equal(typed('policies', 'approve', 'warm-lily'), 'policies approve-now warm-lily')
  assert.equal(typed('runs', 'warm-lily', '--limit', '3'), 'policies runs warm-lily --limit 3')
  assert.equal(typed('probes'), 'quota probes')
  assert.equal(typed('probes', 'run', 'quota'), 'quota read-now')
  assert.equal(aliased(ALIASES.policies, 'policies', ['run', 'warm-lily']).line, 'tower policies run warm-lily is tower x policies run-now warm-lily; the old word goes at 2.0')
})
