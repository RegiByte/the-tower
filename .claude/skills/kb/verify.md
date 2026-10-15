# Verify workflow

Check the KB against the code and bring it back to truth. The truth rules in `SKILL.md` apply throughout.

`reviewed` on an entity is an attestation: someone confirmed its claims against the code on that
date. **Never bump `reviewed` without reading the change that made the entity suspect.** A bumped
date on an unread change is worse than a stale entity, because it hides the staleness.

## Procedure

1. **Freshen and run.** Fetch each checked repo (`git -C <checkout> fetch origin <branch>`), then from
   the project root run `node <skill-dir>/tool/kb.mjs verify`. Its REPOS section shows when each repo
   was last fetched. If a fetch fails, say so: results for that repo are only as fresh as its last fetch.
2. **Errors first.** For a broken ref or anchor, find where the code went
   (`git -C <checkout> log --follow --oneline origin/<branch> -- <path>`,
   `git -C <checkout> grep -n <symbol> origin/<branch>`) and update the ref. If the thing no longer
   exists, the claim is false: rewrite or remove it, and tell the human.
3. **Suspect entities.** Verify lists the commits after `reviewed` for each ref. One commit usually
   makes several entities suspect, so work commit by commit:
   `git -C <checkout> show <hash> -- <path>`. Then re-read the entity, summary included, and decide:
   - claims still true: set `reviewed` to today, change nothing else
   - claims changed: fix prose, links and refs, then set `reviewed` to today
   - a decision's premise changed: draft the decision that now stands and ask the human before writing it

   Verify lists first the suspects whose commits changed what the entity reads (an anchored symbol's lines, or a
   file read whole), then those whose file changed only elsewhere. Read both: a change outside the anchors is often a
   helper the anchored code calls or a new function beside it. When one makes a claim false, fix the claim and add a
   ref to that code, so the next change to it lands in the first list.
4. **Targeted updates.** When the human reports a change, find the affected entities even if they are
   not suspect (`grep -rli <term> kb/entities`), and update them the same way.
5. **Unanchored warnings.** Try to find the code that backs the entity. If you cannot, leave it and list it.
6. **Removals.** Delete an entity when its subject no longer exists. A decision holds current reasoning and git
   holds its history: one absorbed by another, superseded or rejected is merged into the decision that stands
   (rewritten as today's reasoning) or deleted. Fix every `[[link]]`, link target and `supersedes` the merge or
   deletion breaks.
7. **Render** with `node <skill-dir>/tool/kb.mjs render` until there are no errors.
8. **Report** briefly: the number confirmed unchanged, what was updated (one line each on what
   changed), what needs the human, and the path to the HTML file.
