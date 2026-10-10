#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadKb } from "./model.mjs";
import { execFileSync } from "node:child_process";
import { collectEvidence, suspectsInSymbols, suspectsSince } from "./evidence.mjs";
import { buildPayload, renderHtml } from "./render.mjs";

const ROOT = path.resolve("kb");
const USAGE = `usage: node <skill-dir>/tool/kb.mjs <command>   (run from the project root, next to kb/)

  tree [id]   print the entity tree, from the project or from <id>
  verify      report repo freshness, errors and warnings (exit 1 on errors)
  verify --since <rev>
              the same, with only the suspects caused by commits in <rev>..HEAD of the repo holding kb/
              (a branch's own: verify --since origin/main)
  verify --symbols
              the same, with a suspect read at symbols (path#name) kept only for the commits that changed
              the lines of one of them; read at a whole file, or at the first or last lines of one, it is
              kept as is. Combines with --since.
  render      build kb/dist/<project-id>.html (refuses on errors)

The repo holding kb/ is read at HEAD, which must contain its origin/<branch>; every other repo at its
origin/<branch>. Nothing is fetched: run git fetch for fresh results.`;

function report(diagnostics) {
  const errors = diagnostics.filter((d) => d.level === "error");
  const warnings = diagnostics.filter((d) => d.level === "warn");
  for (const [label, list] of [["ERRORS", errors], ["WARNINGS", warnings]]) {
    if (!list.length) continue;
    console.log(`\n${label} (${list.length})`);
    for (const d of [...list].sort((a, b) => a.where.localeCompare(b.where))) console.log(`  ${d.where}: ${d.msg}`);
  }
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length;
}

function tree(kb, from) {
  const print = (id, depth) => {
    const e = kb.entities.get(id);
    const shown = Object.entries(kb.typeById.get(e.type).fields).filter(([, f]) => f.kind === "enum" || f.kind === "date");
    const flags = [e.type, ...shown.map(([name]) => e.fields[name]).filter(Boolean)].join(", ");
    console.log(`${"  ".repeat(depth)}${id} [${flags}] ${e.name} — ${e.summary}`);
    for (const c of kb.graph.children.get(id)) print(c, depth + 1);
  };
  print(from, 0);
  const orphans = [...kb.entities.values()].filter((e) => e.in && !kb.entities.has(e.in));
  for (const e of orphans) console.log(`(orphan) ${e.id} [${e.type}] in missing "${e.in}"`);
}

function freshness(repos) {
  console.log("REPOS");
  for (const r of repos.values()) {
    if (!r.checked) console.log(`  ${r.alias}: linked only, not checked`);
    else if (r.problem) console.log(`  ${r.alias}: unavailable`);
    else {
      const days = r.fetchedAt ? Math.floor((Date.now() - r.fetchedAt) / 864e5) : null;
      const fetched = days === null ? "never fetched" : days === 0 ? "fetched today" : `fetched ${days} day(s) ago`;
      const at = r.own ? `HEAD (${r.branch}, contains origin/${r.spec.branch})` : r.rev;
      console.log(`  ${r.alias}: ${at} at ${r.head}, ${fetched}`);
    }
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd && !fs.existsSync(ROOT)) {
  console.error(`no kb/ folder in ${process.cwd()}: run from the project root`);
  process.exit(1);
}
const kb = cmd ? loadKb(ROOT) : null;

if (cmd === "tree") {
  const from = arg ?? kb.project?.id;
  if (!from || !kb.entities.has(from)) {
    console.error(from ? `no entity "${from}"` : "no project entity yet");
    process.exit(1);
  }
  tree(kb, from);
  const errors = kb.diagnostics.filter((d) => d.level === "error");
  if (errors.length) { console.log(""); report(errors); }
} else if (cmd === "verify") {
  const flags = process.argv.slice(3);
  const evidence = collectEvidence(kb);
  freshness(evidence.repos);
  let diagnostics = [...kb.diagnostics, ...evidence.diagnostics];
  if (flags.includes("--symbols")) diagnostics = suspectsInSymbols(diagnostics, evidence.repos);
  if (flags.includes("--since")) {
    const since = flags[flags.indexOf("--since") + 1];
    if (!since || since.startsWith("--")) { console.error("usage: verify --since <rev>"); process.exit(1); }
    const hashes = execFileSync("git", ["rev-list", `${since}..HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
    console.log(`\nsuspects caused by ${hashes.length} commit(s) in ${since}..HEAD`);
    diagnostics = suspectsSince(diagnostics, hashes);
  }
  process.exit(report(diagnostics) ? 1 : 0);
} else if (cmd === "render") {
  const evidence = collectEvidence(kb);
  if (report([...kb.diagnostics, ...evidence.diagnostics])) {
    console.error("\nrender refused: fix the errors above first");
    process.exit(1);
  }
  const html = renderHtml(buildPayload(kb, evidence, new Date().toISOString().slice(0, 10)));
  const out = path.join(ROOT, "dist", `${kb.project.id}.html`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`\nwrote ${path.relative(process.cwd(), out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
} else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
