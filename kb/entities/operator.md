---
{
  "type": "actor",
  "name": "User",
  "summary": "The one human running sessions, shells and projects from a renderer.",
  "in": "tower",
  "reviewed": "2026-10-15",
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "clicks, keystrokes and spawn requests from a renderer in the browser, at the config's port" },
    { "to": "tower-cli", "verb": "uses", "carries": "tower commands in a terminal" }
  ]
}
---
Edits `~/.tower/config.json` by hand to declare projects; sessions may edit the shelf.
