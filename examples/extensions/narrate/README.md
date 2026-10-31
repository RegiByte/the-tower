# Narration

Hear what workers write, and the short memos they say to you, read aloud in a voice of your choosing.

## What it adds

### The tower page

**A speaker in the tab of a file a worker showed.** On any markdown or text file, it reads the whole file aloud.

| Light | Dark |
| --- | --- |
| ![The speaker icon in a shown file's tab](shots/tab-light.png) | ![The speaker icon in a shown file's tab](shots/tab-dark.png) |

**Listen and From here beside each section of a markdown document** (a kept item, a shown file, a shelf page).
Listen reads that section; From here reads from it to the end, the section being read lit.

| Light | Dark |
| --- | --- |
| ![The gutter while Monday is read](shots/sections-light.png) | ![The gutter while Monday is read](shots/sections-dark.png) |

**A notice at the bottom of the page** for as long as it reads, wherever you go on the page, with **Stop**.

| Light | Dark |
| --- | --- |
| ![The Listening notice](shots/notice-light.png) | ![The Listening notice](shots/notice-dark.png) |

**The memo strip at the top of the sidebar**: the latest memo a worker said and the rest of today's, each with
**Hear again**.

| Light | Dark |
| --- | --- |
| ![The memo strip](shots/memos-light.png) | ![The memo strip](shots/memos-dark.png) |

Listen also appears on every markdown or text kept item, beside each prompt and answer in a worker's Brief, and in
the palette.

### The workers

Every worker's `tower whoami` carries narrate's one-line guidance:

```
  narrate  ·  Say a short memo aloud to the user: when they asked to be told, a long task finished, or something needs them.
```

A worker says a memo with

```sh
tower x narrate memo '{"text": "The search fix is ready for your review."}'
```

The tower page you used last says it aloud as "GAGARIN-40 says: …", in the same voice as Listen, waiting its turn if
it is reading a document; every other page lists it silently. A page you haven't pressed or typed on since it loaded
can't play sound, so there the memo stands as a notice with **Hear**.

Tower 3D, The Week and the CLI draw none of it.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "narrate": { "path": "/abs/path/to/narrate" }
}
```

The tower picks it up without a restart.

## What it needs from you

**Nothing, to start: but the browser's speech is only a placeholder.** Without settings, narration speaks through
the browser's `speechSynthesis`, whose voices are flat, differ from one browser to the next, and can't be chosen
here. **A voice command is what makes it sound good**: any text-to-speech program, named in the settings.

```json
"narrate": {
  "path": "/abs/path/to/narrate",
  "settings": { "voice": { "command": ["/abs/path/to/narrate/voices/say.sh"] } }
}
```

Two samples are in [`voices/`](voices/), each an example of the contract below to copy and adapt:

- [`say.sh`](voices/say.sh): macOS's own `say`, free and offline. `SAY_VOICE` picks one of the voices `say -v '?'`
  lists.
- [`elevenlabs.sh`](voices/elevenlabs.sh): ElevenLabs' text-to-speech API over `curl`. It reads `ELEVENLABS_API_KEY`
  and `ELEVENLABS_VOICE_ID` from the environment the tower starts with. Keep the key there, never in the config,
  which every worker can read. It is an example of the contract, not an integration the tower maintains.

The contract is plain Unix:

- The command is the program's absolute path and its arguments. It runs without a shell, in this folder, with the
  tower's environment minus a Claude session's variables, and is killed after 120 s.
- It reads the text on stdin: at most 2000 characters, since narration voices a long text in chunks of up to 1800,
  cut at paragraphs, then sentences.
- It writes an audio file (`.mp3`, `.m4a`, `.aiff` or `.wav`) and prints its absolute path as the last line of its
  output.
- Exit 0 means it worked. Any other exit is a failure, and what it wrote on stderr is shown as the toast.

Narration serves only the files its command printed, and never deletes them: write them to a temporary folder.

**How a memo is limited and spoken** is `settings.memo`, both keys optional:

```json
"settings": { "memo": { "maxLength": 200, "prefix": "{callsign} reports: " } }
```

`maxLength` is the most characters a memo may have (1 to 2000, default 300); the `memo` verb refuses a longer one.
`prefix` is said before the memo, `{callsign}` standing for the worker's (default `"{callsign} says: "`).

**What workers say** is narrate's guidance, which you can change for your workers in the config,
`extensions.narrate.guidance`: `brief` and `full` replace narrate's, `also` adds to it ("never between 22:00 and
8:00").

## How it works

Listen reads a subject's text through `client/voice.js`, which voices it in chunks with the command and plays each
while the next is voiced. A memo is written only by the `memo` verb, one fact in the worker's own log; a card fold
puts the latest on its card (`x.narrate.memos`), and the `memos` view in the sidebar's strip says the ones that
arrive while its page is the one you used last.

## Make it yours

- **The voice**: copy a script from `voices/`, or write your own around any program (a local model, a voice
  service's CLI) in the same shape: read stdin, write a file, print its path.
- **What workers say, and when**: the config's `extensions.narrate.guidance`, as above.
- **In your copy**: where Listen appears is `commands.speak.on` and `accepts` in `extension.json`, and how a memo is
  drawn and said is `client/memos.js`.

## Pictures

`npm run tool:extension-shots -- examples/extensions/narrate` retakes them from [`shots.json`](shots.json),
voiced by `voices/say.sh`.
