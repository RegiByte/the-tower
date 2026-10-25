# Narration

An example extension: **Listen** on every draft reads it aloud in the browser, and **Stop listening** in the palette
stops it. It is client code only, two commands and no server: copy the folder and make it yours.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "narrate": { "path": "/abs/path/to/narrate" }
}
```

The tower picks it up without a restart. `tower extensions` lists it as started, and `tower extensions check
/abs/path/to/narrate` reads it as the tower would. The tower page shows **Listen** on every draft and in the palette;
the CLI and Tower 3D, which don't import client modules, leave it out.

It requires `drafts`, so it is off wherever drafts is: on a floor with `projects.<p>.capabilities.drafts.off`, or
everywhere with `extensions.drafts.off`.

## Swap the voice

The voice is `client/voice.js`: `speak(text)` and `stop()`, over the browser's `speechSynthesis`. To use another
provider, replace those two functions with calls to it and keep their names; `client/narrate.js` reads the draft
(through the drafts collection's generic read) and hands its text to `speak`.

## What it shows

- `extension.json`: `requires` naming the capability it builds on, and `commands` with `on: ["item.drafts"]`, which
  offers a command on every subject of that kind with no server code.
- `client/narrate.js`: a command's export takes `{ tower, board, subject, args }`; `tower` is the page's
  `window.tower`, the same API every renderer drives.
