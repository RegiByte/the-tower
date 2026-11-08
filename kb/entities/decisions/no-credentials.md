---
{
  "type": "decision",
  "name": "The config holds no credentials",
  "summary": "No key, token or password goes in the config or an extension's settings: workers read the config all the time and every client reads it. An integration that needs a credential keeps it in the script or command its settings name.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-07",
  "reviewed": "2026-11-08",
  "refs": ["hub/src/shared/model.ts#ExtensionConfig", "hub/src/shared/extensions.ts#ExtensionView", "hub/src/shared/extensions.ts#settingsOf", "hub/examples/extensions/narrate/voices/elevenlabs.sh"]
}
---
**Problem.** An extension's settings are the obvious place to put what an integration needs, a key among them. But the
config is read constantly: workers open the file as part of their work, `GET /config` answers any page of the tower,
and since 1.154 each extension's settings ride the board to every renderer ([[extensions]]). A secret there is a secret
in every worker's transcript.

**Why.** Being readable is what makes the config useful: the UI derives from it, and what the user can do, agents can
do ([[agents-have-every-capability]]). Hiding parts of it would take that away to protect something that needn't be
there.

**How.** A setting names a command, and the command holds or finds its own credential. Narrate is the model: its
settings name a voice command, and the sample [`elevenlabs.sh`](ref:hub/examples/extensions/narrate/voices/elevenlabs.sh)
reads `ELEVENLABS_API_KEY` from its own environment, so the config never sees the key. Settings have no secret kind and
no redaction.

**Alternatives considered.** Marking settings secret in the manifest and leaving them off the board: it protects only
the board, as the file and `GET /config` still hold them, and adds a field every extension must get right. Keeping
settings off the client altogether: it costs each client-only extension a server module for one read and protects
nothing, since `GET /config` already answers.

**Impact.** A review refuses a setting that holds a credential. New integrations follow narrate's shape.
