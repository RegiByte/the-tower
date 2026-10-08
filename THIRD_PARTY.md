# Third-party notices

The tower's own code is MIT (`LICENSE`). These works ship with it, in the repo or in what it builds and serves.

## In the repo

| Work | Where | License |
| --- | --- | --- |
| KayKit Bits Bundle 1 (1.1), by Kay Lousberg (www.kaylousberg.com) | `renderers/tower3d/kaykit/` (the models Tower 3D uses, unchanged) | CC0 1.0 (`renderers/tower3d/kaykit/License.txt`) |

## Bundled or served from `node_modules`

Installed by `npm ci`. Tower 3D's bundle embeds three.js; the tower serves the others to the pages it draws.

| Package | Copyright | License |
| --- | --- | --- |
| `three` | three.js authors | MIT |
| `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-serialize`, `@xterm/headless` | The xterm.js authors; SourceLair Private Company | MIT |
| `highlight.js` | Ivan Sagalaev and the highlight.js authors | BSD-3-Clause |
| `marked` | MarkedJS; Christopher Jeffrey | MIT |
| `@fontsource/atkinson-hyperlegible` (Atkinson Hyperlegible) | Braille Institute of America, Inc. | SIL Open Font License 1.1 |
| `@fontsource/jetbrains-mono` (JetBrains Mono) | The JetBrains Mono Project Authors | SIL Open Font License 1.1 |
| `@fontsource/overpass` (Overpass) | The Overpass Project Authors | SIL Open Font License 1.1 |

Each package's full license text is in its folder under `node_modules/`.
