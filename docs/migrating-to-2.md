# Migrating to 2.0

2.0 removes what 1.x kept for compatibility: old shapes, old names and old ways in, each of which had a replacement
in 1.x. It adds nothing. This guide lists every change that can break something of yours, by who it reaches, each
with what to do instead.

It is written so that Claude can apply it. Point a Claude session at this file and at your extension, renderer, fork
or config, and ask it to bring them to 2.0: each entry says what to find and what to change it to, and the tower's
own checks (`tower extensions check <dir>`, `tower config check`, `tower doctor`) say whether it worked.

## Everyone who runs a tower

- **The host must speak protocol 5.** A 2.0 tower starts sessions and logs facts only on a host at the current host
  protocol, which arrived in 1.x. While an older host runs, a spawn, a hire, a resume or a logged fact is refused
  with `unavailable`, naming the fix. Restart the host: `tower down host`, then `tower up`. That stops the running
  sessions; each one stays resumable.
- **The old CLI words are gone.** See [The CLI](#the-cli).

## Extension and renderer authors

- **`API_VERSION` is `2.0`.** `tower.version` reads `2.0`. A page that loads `/tower.js?v=1.<n>` is refused, since a
  pin names the major it was written against: load `/tower.js?v=2.0` once the page meets the rest of this section.
- **`requires.tower` is `"2.0"`.** A manifest that requires a 1.x tower is refused as `too-old` before any other key
  is read, and the tower says so on the board and in `tower extensions check`. Set `"requires": { "tower": "2.0" }`,
  then make the changes the rest of this section lists. Every name in the library now says it arrived in 2.0.

## The CLI

## Forks

- **Take upstream's `API_VERSION`**, as before: `2.0`. Your own extensions follow the authors' section above.

## Config

## Tower.app
