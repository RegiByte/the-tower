/**
 * Check: everything CI runs, in CI's order, stopping at the first step that fails and naming it.
 *
 *   npm run check
 *
 * The steps are read from the `check` job of `.github/workflows/ci.yml`: every step that is a single `run:` line and
 * has no `if:` (the install, `npm ci`, is skipped: run it first in a fresh worktree). A step added to the job runs here
 * with no change to this script. What CI does only for a pull request, and the Swift typecheck of `apps/macos`
 * (`xcrun swiftc -typecheck -swift-version 5 apps/macos/Sources/*.swift`, which CI runs on a Mac only when that
 * folder changed), is not run: run the Swift one yourself after such a change.
 *
 * The step that proves the tree is as committed fails while you have uncommitted work: commit, then run the check.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO = path.join(import.meta.dirname, '..')
const CI = path.join(REPO, '.github/workflows/ci.yml')

type Step = { name: string; run: string }

const checkJobSteps = (yaml: string): Step[] => {
  const job = yaml.split(/^ {2}check:\n/m)[1]?.split(/^ {2}\S/m)[0]
  if (!job) throw new Error(`${CI} has no \`check\` job: update scripts/check.ts to where CI's steps now live`)
  const blocks = job.split(/^ {6}- /m).slice(1)
  return blocks.flatMap((block): Step[] => {
    const run = /^ {0,8}run: (.+)$/m.exec(block)?.[1]
    if (!run || /^ {0,8}if: /m.test(block)) return []
    if (/^[|>]/.test(run)) throw new Error(`${CI}: a multi-line \`run:\` step with no \`if:\`: scripts/check.ts reads single-line steps`)
    const name = /^name: (.+)$/m.exec(block)?.[1] ?? run
    return run === 'npm ci' ? [] : [{ name, run }]
  })
}

const steps = checkJobSteps(readFileSync(CI, 'utf8'))
for (const [i, step] of steps.entries()) {
  console.log(`\n[${i + 1}/${steps.length}] ${step.name}\n$ ${step.run}`)
  const result = spawnSync(step.run, { cwd: REPO, shell: true, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\ncheck failed at step ${i + 1}/${steps.length}: ${step.name}\n$ ${step.run}`)
    process.exit(result.status ?? 1)
  }
}
console.log(`\ncheck: all ${steps.length} steps passed`)
