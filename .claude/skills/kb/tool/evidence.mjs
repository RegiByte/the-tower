import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REF_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([^#\s]+?)\/?(?:#([^\s)]+))?$/;
const LINES_RE = /^L(\d+)(?:-L(\d+))?$/;

export function parseRef(text) {
  const m = text.match(REF_RE);
  return m && { text, alias: m[1], path: m[2], anchor: m[3] ?? null };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LISP_RE = /\.(clj|cljs|cljc|bb|edn)$/;

// Lisp symbols may contain - ! ? * < > =, so a symbol ends at whitespace or a closing bracket.
// A symbol anchor is any (def… form, past metadata (^:private, ^{…}). A keyword anchor is a
// defmethod dispatch value, else a map key opening its line (EDN config).
function lispDefinitions(anchor) {
  const sym = escapeRe(anchor);
  const end = "(?=[\\s)\\]}]|$)";
  return anchor.startsWith(":")
    ? [new RegExp(`\\(defmethod\\s+\\S+\\s+${sym}${end}`), new RegExp(`^[\\s{\\[]*${sym}${end}`)]
    : [new RegExp(`\\((?:[\\w.-]+/)?def[\\w-]*\\s+(?:\\^(?:\\{[^}]*\\}|\\S+)\\s+)*${sym}${end}`)];
}

const anyCase = (words) => words.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const KEYWORDS = anyCase("def|class|function|const|let|var|type|interface|enum|struct|fn|func|defn|table|view|procedure");
const IF_NOT_EXISTS = ["if", "not", "exists"].map(anyCase).join("\\s+");
// Keywords match in any case (SQL); the name in its own case, unless flags say otherwise.
const definitionRe = (name, flags = "") => new RegExp(
  `(?:^|[^\\w])(?:${KEYWORDS})\\s+(?:${IF_NOT_EXISTS}\\s+)?["'\`]?${name}(?![\\w])`
  + `|^\\s*(?:export\\s+)?${name}\\s*(?::[^=]*)?=`, flags);

// A name is found in its own case first, so ICON is `const ICON` past an earlier `const icon`; in any case only
// where it has no definition in its own (SQL names).
export function locateAnchor(lines, anchor, file) {
  const range = anchor.match(LINES_RE);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2] ?? range[1])];
    return a >= 1 && b >= a && b <= lines.length ? { from: a, to: range[2] ? b : null } : null;
  }
  if (LISP_RE.test(file)) {
    const idx = lispDefinitions(anchor)
      .map((re) => lines.findIndex((l) => re.test(l)))
      .find((i) => i >= 0);
    return idx === undefined ? null : { from: idx + 1, to: null };
  }
  const sym = escapeRe(anchor);
  const idx = ["", "i"].map((flags) => lines.findIndex((l) => definitionRe(sym, flags).test(l))).find((i) => i >= 0);
  return idx === undefined ? null : { from: idx + 1, to: null };
}

const run = (dir, args) => execFileSync("git", ["-C", dir, ...args], {
  encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"],
});

const githubName = (url) => url.trim().replace(/\.git$/, "").split(/[/:]/).slice(-2).join("/").toLowerCase();

// The other repos sit next to the main checkout of the repo holding kb/. A linked worktree lives elsewhere
// (often inside that checkout), so the main checkout is found as the parent of the git dir every worktree shares.
export function hostRepo(kbRoot) {
  const top = run(kbRoot, ["rev-parse", "--show-toplevel"]).trim();
  const commonDir = path.resolve(kbRoot, run(kbRoot, ["rev-parse", "--git-common-dir"]).trim());
  let github = null;
  try { github = githubName(run(top, ["remote", "get-url", "origin"])); } catch { /* a repo without origin hosts no alias */ }
  return { top, parent: path.dirname(path.dirname(commonDir)), github };
}

// The repo holding kb/ is read at HEAD, so a branch that changes code and its entities verifies as one unit;
// HEAD must contain origin/<branch>, or a stale branch would be checked instead of the described code.
function locateRepo(spec, host) {
  const own = host.github === spec.github.toLowerCase();
  const dir = own ? host.top : path.join(host.parent, spec.github.split("/")[1]);
  return { own, dir, rev: own ? "HEAD" : `origin/${spec.branch}` };
}

function openRepo(alias, spec, host) {
  const base = { alias, spec, checked: spec.checkout !== false };
  if (!base.checked) return base;
  const { own, dir, rev } = locateRepo(spec, host);
  const upstream = `origin/${spec.branch}`;
  const git = (...args) => run(dir, args);
  if (!fs.existsSync(dir)) return { ...base, problem: `no checkout at ${dir}: clone ${spec.github} next to the main checkout of the repo that holds kb/` };
  try { git("rev-parse", "--verify", "--quiet", `${upstream}^{commit}`); }
  catch { return { ...base, problem: `${upstream} not found in ${dir}: run git -C ${dir} fetch origin ${spec.branch}` }; }
  if (own) {
    try { git("merge-base", "--is-ancestor", upstream, "HEAD"); }
    catch { return { ...base, problem: `HEAD of ${dir} does not contain ${upstream}: rebase on it (or check out ${spec.branch} and pull) before verifying` }; }
  }

  const fetchHeads = [git("rev-parse", "--git-path", "FETCH_HEAD"), path.join(git("rev-parse", "--git-common-dir").trim(), "FETCH_HEAD")]
    .map((p) => path.resolve(dir, p.trim())).filter((p) => fs.existsSync(p));
  const fetchedAt = fetchHeads.length ? new Date(Math.max(...fetchHeads.map((p) => fs.statSync(p).mtimeMs))) : null;
  const entries = new Map();
  for (const rec of git("ls-tree", "-r", "-t", "-z", rev).split("\0").filter(Boolean)) {
    const [info, p] = rec.split("\t");
    entries.set(p, info.split(" ")[1]);
  }
  const content = new Map();
  return {
    ...base, own, dir, rev, git, fetchedAt,
    head: git("log", "-1", "--format=%h %cs", rev).trim(),
    branch: own ? git("rev-parse", "--abbrev-ref", "HEAD").trim() : spec.branch,
    kind: (p) => entries.get(p) ?? null,
    lines: (p) => {
      if (!content.has(p)) content.set(p, git("show", `${rev}:${p}`).split("\n"));
      return content.get(p);
    },
    commitsAfter: (p, day) => git("log", "--format=%h%x09%cs%x09%s", `--since=${day}`, rev, "--", p)
      .split("\n").filter(Boolean).map((l) => l.split("\t"))
      .filter(([, date]) => date > day)
      .map(([hash, date, subject]) => ({ hash, date, subject })),
    commitsTouching: (p) => new Set(git("log", "--format=%h", rev, "--", p).split("\n").filter(Boolean)),
  };
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
export const githubUrl = (spec, kind, p, loc) =>
  `https://github.com/${spec.github}/${kind === "tree" ? "tree" : "blob"}/${spec.branch}/${encodePath(p)}`
  + (loc ? `#L${loc.from}${loc.to ? `-L${loc.to}` : ""}` : "");
export const commitUrl = (spec, hash) => `https://github.com/${spec.github}/commit/${hash}`;

function resolveRef(ref, repo) {
  if (!repo.checked) {
    const range = ref.anchor?.match(LINES_RE);
    const loc = range ? { from: Number(range[1]), to: range[2] ? Number(range[2]) : null } : null;
    return { url: githubUrl(repo.spec, "blob", ref.path, loc), checked: false };
  }
  const kind = repo.kind(ref.path);
  if (!kind) return { problem: `${ref.text}: ${ref.path} does not exist on ${repo.rev}` };
  if (kind === "tree") {
    return ref.anchor
      ? { problem: `${ref.text}: a directory cannot have an anchor` }
      : { url: githubUrl(repo.spec, "tree", ref.path), checked: true };
  }
  if (!ref.anchor) return { url: githubUrl(repo.spec, "blob", ref.path), checked: true };
  const loc = locateAnchor(repo.lines(ref.path), ref.anchor, ref.path);
  return loc
    ? { url: githubUrl(repo.spec, "blob", ref.path, loc), checked: true }
    : { problem: `${ref.text}: anchor "${ref.anchor}" not found in ${ref.path} on ${repo.rev}` };
}

// A suspect warning keeps its ref and commits, so a report can narrow it to some of them (suspectsSince).
export function suspectWarning(where, reviewed, ref, commits) {
  const list = commits.slice(0, 5).map((c) => `      ${c.hash} ${c.date} ${c.subject}`).join("\n");
  const more = commits.length > 5 ? `\n      … ${commits.length - 5} more` : "";
  const msg = `suspect: ${ref} changed after reviewed ${reviewed} (${commits.length} commit${commits.length > 1 ? "s" : ""})\n${list}${more}`;
  return { level: "warn", where, msg, suspect: { reviewed, ref, commits } };
}

// The diagnostics with each suspect narrowed to the commits in `hashes` (full hashes), and dropped when none is:
// what a branch's own commits made suspect. Every other diagnostic stays.
export function suspectsSince(diagnostics, hashes) {
  return diagnostics.flatMap((d) => {
    if (!d.suspect) return [d];
    const commits = d.suspect.commits.filter((c) => hashes.some((h) => h.startsWith(c.hash)));
    return commits.length ? [suspectWarning(d.where, d.suspect.reviewed, d.suspect.ref, commits)] : [];
  });
}

export function collectEvidence(kb) {
  const diagnostics = [];
  const error = (where, msg) => diagnostics.push({ level: "error", where, msg });
  const warn = (where, msg) => diagnostics.push({ level: "warn", where, msg });

  let host;
  try { host = hostRepo(kb.root); }
  catch { error("kb/", "kb/ must live inside a git repository; checkouts are found next to it"); }
  const repos = new Map(Object.entries(kb.config.repos).map(([a, s]) => [a, host
    ? openRepo(a, s, host)
    : { alias: a, spec: s, checked: s.checkout !== false, problem: "no checkouts directory" }]));
  for (const r of repos.values()) if (r.problem) error(`repo ${r.alias}`, r.problem);

  const urls = new Map();
  const resolve = (text, where) => {
    const ref = parseRef(text);
    if (!ref) { error(where, `malformed ref "${text}" (expected alias/path#anchor)`); return null; }
    const repo = repos.get(ref.alias);
    if (!repo) { error(where, `ref "${text}": unknown repo alias "${ref.alias}"`); return null; }
    if (repo.problem) return null;
    const r = resolveRef(ref, repo);
    if (r.problem) { error(where, r.problem); return null; }
    urls.set(text, r.url);
    return { ...ref, ...r };
  };

  const byEntity = new Map();
  for (const e of kb.entities.values()) {
    const refs = [...new Set([...e.metaRefs, ...e.refs])].map((t) => resolve(t, e.file)).filter(Boolean);
    const paths = new Map(refs.filter((r) => r.checked).map((r) => [`${r.alias}/${r.path}`, r]));
    const suspect = [...paths.values()].flatMap((r) => {
      const repo = repos.get(r.alias);
      const reviewedWith = repo.own ? repo.commitsTouching(path.relative(host.top, path.join(kb.root, e.file))) : new Set();
      const commits = repo.commitsAfter(r.path, e.reviewed)
        .filter((c) => !reviewedWith.has(c.hash))
        .map((c) => ({ ...c, url: commitUrl(repo.spec, c.hash) }));
      return commits.length ? [{ ref: `${r.alias}/${r.path}`, commits }] : [];
    });
    for (const s of suspect) diagnostics.push(suspectWarning(e.file, e.reviewed, s.ref, s.commits));
    if (kb.typeById.get(e.type).evidence && e.metaRefs.length + e.refs.length === 0) {
      warn(e.file, `unanchored: a ${e.type} should have at least one ref`);
    }
    byEntity.set(e.id, { refs: [...new Set(e.metaRefs)].map((t) => refs.find((r) => r.text === t)).filter(Boolean), suspect });
  }
  for (const v of kb.views) for (const t of v.refs) resolve(t, v.file);

  return { byEntity, urls, repos, diagnostics };
}
