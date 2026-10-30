# Narration

An example extension: **Listen** on every markdown or text item (a draft, say), every markdown or text file a worker
shows, each section of a markdown document and each prompt and answer in a worker's Brief reads it aloud in the browser, and **Stop listening** in the palette stops it. It is client code only, two
commands and no server: copy the folder and make it yours.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "narrate": { "path": "/abs/path/to/narrate" }
}
```

The tower picks it up without a restart. `tower extensions` lists it as started, and `tower extensions check
/abs/path/to/narrate` reads it as the tower would. The tower page shows **Listen** on every draft, beside the tab of a
markdown or text file a worker showed, in the gutter beside each section of a markdown document, beside the copy of
each prompt and answer in the Brief, and in the palette; the CLI and Tower 3D, which don't import client modules,
leave it out.

## Swap the voice

The voice is `client/voice.js`: `speak(text)` and `stop()`, over the browser's `speechSynthesis`. To use another
provider, replace those two functions with calls to it and keep their names; `client/narrate.js` reads the subject's
text (`textOf` from `/cards.js`) and hands it to `speak`.

## What it shows

- `extension.json`: `commands` with `on: ["item.*", "shown", "section", "said"]`, which offers a command on every item
  of any collection, everything a worker showed, and two viewer subjects a page draws (a document's sections, a
  brief's prompts and answers, each carrying its own text as `body`) with no server code, and `accepts`, which narrows that to the subjects whose media
  type is markdown or plain text.
- `client/narrate.js`: a command's export takes `{ tower, board, target, subject, args }`; `target` is the subject
  (`{ kind, key, project, value }`), `tower` the page's `window.tower`, the same API every renderer drives, and
  `textOf(tower, target)` reads a subject's text wherever it is.
