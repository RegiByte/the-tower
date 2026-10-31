# Narration

An example extension: **Listen** on every markdown or text item (a draft, say), every markdown or text file a worker
shows, each section of a markdown document and each prompt and answer in a worker's Brief reads it aloud; **From
here** on a section reads the document from that section to its end; and **Stop listening** in the palette stops it.
Workers can say short memos to you, which the tower page you used last says aloud (below). It reads through the browser's own speech, or through a voice command you set: any
text-to-speech program, run by a little server code. Copy the folder and make it yours.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "narrate": { "path": "/abs/path/to/narrate" }
}
```

The tower picks it up without a restart. `tower extensions` lists it as started, and `tower extensions check
/abs/path/to/narrate` reads it as the tower would. The tower page shows **Listen** on every draft, as a speaker icon inside the tab of a
markdown or text file a worker showed, in the gutter beside each section of a markdown document (a kept item, a
shown file, a shelf page) with **From here** next to it, beside the copy of each prompt and answer in the Brief, and in
the palette; the CLI and Tower 3D, which don't import client modules,
leave it out.

## A voice command

Without settings, narration speaks through the browser's `speechSynthesis`. Set a voice command and it speaks through
that instead:

```json
"narrate": {
  "path": "/abs/path/to/narrate",
  "settings": { "voice": { "command": ["/abs/path/to/voice-line", "an-argument"] } }
}
```

The contract is plain Unix:

- The command is the program's absolute path and its arguments. It runs without a shell, in this folder, with the
  tower's environment minus a Claude session's variables, and is killed after 120 s.
- It reads the text on stdin: at most 2000 characters, since narration voices a long text in chunks of up to 1800,
  cut at paragraphs, then sentences.
- It writes an audio file (`.mp3`, `.m4a`, `.aiff` or `.wav`) and prints its absolute path as the last line of its
  output.
- Exit 0 means it worked. Any other exit is a failure, and what it wrote on stderr is shown as the toast.

The audio files are the command's own: narration serves only the files its command printed since the tower started,
each under a token, and never deletes them. Write them to a temporary folder.

On macOS, `say` makes a voice command in three lines:

```sh
#!/bin/sh
out="${TMPDIR:-/tmp}/narrate-$$.m4a"
say --data-format=aac -o "$out" -f - && echo "$out"
```

Make it executable, name its absolute path as `command`, and Listen speaks in the system's voice. A wrapper around any
other program (a local model, a voice service's CLI) follows the same shape: read stdin, write a file, print its path.

## How it plays

A narration reads parts in order. Listen on a section or a prompt reads it alone; From here reads that section and
each one after it; Listen on a document the page draws by sections (a kept item's head, a shown file's tab) reads it
section by section from the first, and anything else as one text. While it reads, the section being read is marked in
the document (its row in the gutter says "Listening", its part of the page is lit) and a notice at the bottom of the
page says what is read, with **Stop**, wherever you go on the page.

`client/voice.js` holds both voices. With a command, it voices the first chunk (Listen stays busy, and a toast says
it is voicing), plays it in an `<audio>` element while the next chunk is voiced, and so on in order, across the parts; Stop, or
another Listen, pauses it and drops what is still being voiced. The audio is fetched whole into a Blob URL, which plays in
Chrome and in WebKit (Safari, Tower.app) alike.

## Memos

A worker can say something to you: a short memo, such as "the thing you asked for is ready". It writes one with

```sh
tower x narrate facts/memo '{"value": "The search fix is ready for your review."}'
```

and the tower page you used last (clicked, typed in or switched to, on any machine reading the tower, even while you
are in a Tower 3D or Week tab since) says it aloud
as "GAGARIN-40 says: …", in the same voice as Listen. If that page is reading a document, the memo waits for the
part being read to end, is said, and the document goes on. Every other page lists it silently. The strip at the top
of the tower page's sidebar shows the latest memo and the rest of today's, each with **Hear again**, and **Clear**
puts them away on that browser. A page you haven't pressed or typed on since it loaded can't play sound, so there
the memo stands as a notice with **Hear**.

What a worker should say, and when, is in narrate's guidance: `tower whoami` lists its one-line brief, and `tower x
narrate` prints the whole of it. Change it for your workers in the config, `extensions.narrate.guidance`: `brief` and
`full` replace narrate's, `also` adds to it ("never between 22:00 and 8:00").

## What it shows

- `extension.json`: `commands` with `on: ["item.*", "shown", "section", "said"]`, which offers a command on every item
  of any collection, everything a worker showed, and two viewer subjects a page draws (a document's sections, a
  brief's prompts and answers, each carrying its own text as `body`), and `accepts`, which narrows that to the subjects
  whose media type is markdown or plain text. Its `settings` schema, the `say` verb and two reads, `voice` and
  `audio/<token>`, the latter `serves: "file"`.
- `server.ts`: a verb that runs a command with `ctx.run` (argv, stdin, a timeout) and a read that serves only the
  files it was given, by token.
- `client/narrate.js`: a command's export takes `{ tower, board, target, subject, args, kit }`; `target` is the
  subject (`{ kind, key, project, value }`), `tower` the page's `window.tower`, the same API every renderer drives,
  `textOf(tower, target)` reads a subject's text wherever it is, and `kit.toast` says something to the user.
  `kit.bus` is the page's viewer subjects: `bus.under(of, 'section')` finds a document's sections, and
  `bus.mark(key, 'narrate', { label })` marks the one being read, for the document to draw. `kit.notice` is a toast
  that stands until it is closed: "Listening", with Stop.
- `facts.memo`: a writable fact, `self` its only writer, so a worker's memo is one fact in its own log. The card fold
  in `server.ts` puts its latest memos on its card (`x.narrate.memos`), each keyed by session and time.
- `views.memos` (`client/memos.js`): a view on the board at `row` scale, which the tower page mounts in its
  `board.strip` for as long as the page is open. It says a memo that arrives while `board.viewers.last.<renderer>`
  is its page's `tower.viewer` (`tower.renderer()` names it), never one already on the board as it mounted, through `voice.interject`: at once when
  nothing reads, else after the chunk sounding.
- `guidance`: what narrate tells the workers about memos, when to speak and how to write for listening.
