---
{
  "type": "actor",
  "name": "User",
  "summary": "The one human running sessions, shells and projects from a renderer.",
  "in": "tower",
  "reviewed": "2026-11-08",
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "clicks, keystrokes and spawn requests from a renderer in the browser, at the config's port" },
    { "to": "tower-cli", "verb": "uses", "carries": "tower commands in a terminal" }
  ]
}
---
Declares projects in `~/.tower/config.json`, by hand or through the tower's config verbs, which share the file with
them per key ([[config-writes]]); sessions may edit the shelf.
