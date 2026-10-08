---
{
  "type": "decision",
  "name": "One settings popover and one tooltip for every renderer",
  "summary": "Alerts, sound and theme sit in a small settings popover drawn from shared pure views; any element with data-tip shows its text in one shared tooltip, at once on hover and keyboard focus and inside the viewport; the status counts and the host lamp say what they mean in shared words.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/settings.ts",
    "hub/src/shared/settings.ts#settingsHtml",
    "hub/src/shared/settings.ts#soundSection",
    "hub/src/shared/settings.ts#settingsCss",
    "hub/src/shared/tips.ts",
    "hub/src/shared/tips.ts#watchTips",
    "hub/src/shared/tips.ts#placeNear",
    "hub/src/shared/tips.ts#placeOnOpen",
    "hub/src/shared/cards.ts#ATTENTION_MEANS",
    "hub/src/shared/cards.ts#statusLegendHtml",
    "hub/src/shared/cards.ts#hostState",
    "hub/src/shared/cards.ts#HOST_MEANS",
    "hub/src/shared/icons.ts#ICON",
    "hub/src/tower/tower.js",
    "hub/src/shared/shelf-page.ts",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/ui.ts#hudHtml",
    "hub/renderers/tower3d/src/main.ts#paintSettings"
  ],
  "links": [
    { "to": "shared-panels", "verb": "follows", "carries": "pure views, one stylesheet, data attributes each renderer wires" },
    { "to": "attention-list", "verb": "uses", "carries": "the ring setting in tower.store and the sounds as scores" },
    { "to": "design-system", "verb": "uses", "carries": "the scheme choice, the tokens a tip and the popover are drawn in" },
    { "to": "renderer-api", "verb": "uses", "carries": "tower.schemeChoice and tower.chooseScheme, the scheme verb of a framed page" }
  ]
}
---
**Problem.** A new user read the tower page's head as a bug: two buttons wore the same 🔔, one the browser's
notification permission (🔔, 🔕, 🔔?), the other how a wait rings (🔔, 🔔↻, 🔕), beside a ◐ for the scheme. What
each meant lived in `title` attributes, which show late, never on keyboard focus, and look different on every OS. The
status counts (waiting on you, ready, working, quiet, broken) and the host lamp said nothing of what they meant, and
the lamp read up or down only by colour. Tower 3D had its own bell in the HUD and no way to set the scheme.

**Why.** Settings and explanations are drawn alike in every renderer: written once in shared code, a next renderer
gets them by importing and wiring ([[renderer-is-disposable]], [[shared-panels]]).

**How.**
- *Settings popover* ([`settings.ts`](ref:hub/src/shared/settings.ts), served as `/settings.js`): sections as pure
  views, `alertsSection` (the browser's permission in words, and Turn on while the browser hasn't asked),
  [`soundSection`](ref:hub/src/shared/settings.ts#soundSection) (once, remind, off, and a play button per sound) and
  `themeSection` (system, light, dark), composed by [`settingsHtml`](ref:hub/src/shared/settings.ts#settingsHtml)
  from the sections a renderer offers; one stylesheet; `data-alerts-ask`, `data-ring-choice`, `data-sound-play` and
  `data-scheme-choice` wired by each renderer. It is a native `popover` (light dismiss, top layer, not a modal).
  Settings stay where they lived: the ring in `tower.store` ([[attention-list]]), notifications with the browser, and
  the scheme with `tower.js`, which gained `tower.schemeChoice()` and `tower.chooseScheme(c)`: localStorage at the
  tower's origin, and framed, a `{t: 'tower', verb: 'scheme'}` message the framing page keeps and answers with
  `scheme` (API 1.3, [[renderer-api]]). The tower page now reads its own scheme through the same calls.
- *The head* keeps the host lamp, the gear, `?` and `«`. The gear is `ICON.settings`, an inline SVG from
  `/icons.js` like the scheme icons, so it looks the same on every OS.
- *One tooltip* ([`tips.ts`](ref:hub/src/shared/tips.ts), `/tips.js`): [`watchTips`](ref:hub/src/shared/tips.ts#watchTips)
  puts one element in the top layer (a manual popover, so it shows above an open popover or a modal) and shows any
  `data-tip`'s text at once on hover and on keyboard focus (`:focus-visible`), lines kept, until the pointer or the
  focus leaves, Esc, a press or a scroll; it sets `aria-describedby` while shown.
  [`placeNear`](ref:hub/src/shared/tips.ts#placeNear) stands it below its element, above when only above has room,
  inside the viewport; [`placeOnOpen`](ref:hub/src/shared/tips.ts#placeOnOpen) stands the settings popover by its
  button the same way. Ink on panel in either scheme, edged in a wash of panel so it parts from dark surfaces (Tower
  3D's world). The Stats bars' readouts, a CSS `::after` before, use it too.
- *Words* in `/cards.js`: [`ATTENTION_MEANS`](ref:hub/src/shared/cards.ts#ATTENTION_MEANS) says what puts a worker in
  each attention (from `attentionOf` and the statuses), `WAITING_MEANS` what the waiting count counts, and
  `ON_DUTY_MEANS` that counts are over workers on duty. The counts' tooltips and the `?` sheet's legend
  ([`statusLegendHtml`](ref:hub/src/shared/cards.ts#statusLegendHtml)) read them; Tower 3D's HUD counts too.
- *The host lamp* reads at a glance: [`hostState`](ref:hub/src/shared/cards.ts#hostState) is up, outdated or down,
  coloured quiet, working (amber: a restart some time) or broken, with its word (`host up` faint, `host outdated` and
  `host down` on their colour) and [`HOST_MEANS`](ref:hub/src/shared/cards.ts#HOST_MEANS) as its tooltip. The note line
  under the head no longer repeats it. Tower 3D's HUD keeps a bare lamp while the host is up.
- *Tower 3D* opens the same popover from a gear in its HUD and a Settings button on the pause card, with Sound and
  Theme: it sends no notifications (the page framing it does), so it offers no Alerts.

**Alternatives considered.**
- *A modal dialog for settings*: three small choices don't deserve taking the screen.
- *Keeping `title`s, worded better*: shown after a delay, never on focus, styled by the OS.
- *A tooltip in CSS alone* (`:hover::after`, as the Stats bars had): clipped by a scrolling parent, no keyboard focus,
  and it can't stay inside the viewport.
- *CSS anchor positioning* for the popover and tip: not in every browser the tower may run in; the placement is a
  pure function of three boxes.
- *The tooltip's stylesheet in `/design.css`*: every shelf page would carry it; `watchTips` adds it with the element.
- *Alerts in Tower 3D*: a framed page can't read the framing page's permission, and Tower 3D notifies nothing.
- *Removing `RING_NAME` and `RING_MARK`*: served exports are the renderer API's; both stay, `@deprecated`.

**Impact.** One head with four controls, every one explained on hover and focus; status counts that say what they
count; a host lamp readable without hovering; settings and tooltips a third renderer gets by importing `/settings.js`
and `/tips.js`. Other `title`s can move to `data-tip` one by one with nothing else to change.
