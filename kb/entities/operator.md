---
{
  "type": "actor",
  "name": "Operator",
  "summary": "The one human running sessions, shells and projects from a renderer.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "clicks, keystrokes and spawn requests from the browser page on 127.0.0.1:4317" },
    { "to": "tower-cli", "verb": "uses", "carries": "tower commands in a terminal" }
  ]
}
---
Edits `~/.tower/config.json` by hand to declare projects; sessions may edit the shelf.
