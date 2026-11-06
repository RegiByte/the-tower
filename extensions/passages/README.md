# Passages

Pick text in a markdown document a worker showed, write a prompt about it, and the worker gets the prompt with the
passage quoted and its place in the file named.

## What it adds

### The tower page

**A prompt box over the passage.** Drag across text in a shown markdown file (or extend a selection with the keys).
Once the selection stops changing, the passage is lit and a box opens under it, or over it where there is no room
below. Its placeholder names who the prompt goes to (hover it for the file and lines). Type a prompt and press Enter or **Send** (Shift+Enter for a new line). The worker gets:

```
About this passage of /path/to/plan.md (lines 15–16, under "Negative rates"):

> A negative rate makes no sense for a conversion. The function should refuse it
> with a clear error that names the rate and where it came from.

<your prompt>
```

The prompt goes through the core's `submit`, so it waits in the worker's queue while the worker is busy. **Cancel**
(Esc), a click elsewhere on the page and a click in the document all close the box. What you typed is kept for that
document while the page is open, so picking again brings it back.

The box says why it takes no prompt, instead of offering one, when:

- the worker that showed the document isn't taking prompts (it has stopped, or it is waiting on the user),
- the document isn't a worker's showing (a kept item, a shelf file),
- the passage is longer than 4,000 characters.

### Tower 3D and The Week

Nothing: they draw no `passage.acts` region.

## How it works

The core draws the document, reads the frame's selection and turns a settled pick into a `passage` subject:
`/picks.js`, `src/views/sections.ts`, and the source-line marks of `sectionsHtml`. This extension is one view on that
subject, `passages/composer`, at `row` scale. Another extension can act on passages too, with a command or a view
`on: ["passage"]`.
