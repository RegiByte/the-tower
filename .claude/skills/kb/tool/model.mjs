import fs from "node:fs";
import path from "node:path";

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHAPES = ["box", "round", "stadium", "cylinder", "parallelogram", "subroutine", "hexagon"];
const FIELD_KINDS = ["string", "date", "enum", "id", "ids"];
const INNER = ["project", "system", "container"];

export const CORE_TYPES = [
  { id: "project", label: "Project", parents: [], evidence: false, shape: "subroutine", fields: {} },
  { id: "system", label: "Systems", parents: ["project"], evidence: false, shape: "subroutine", fields: {} },
  { id: "actor", label: "Actors", parents: ["project", "system"], evidence: false, shape: "stadium", fields: {} },
  { id: "external", label: "External systems", parents: ["project", "system"], evidence: false, shape: "parallelogram", fields: {} },
  { id: "container", label: "Containers", parents: INNER, evidence: true, shape: "box", fields: {} },
  { id: "store", label: "Stores", parents: ["project", "system"], evidence: false, shape: "cylinder", fields: {} },
  {
    id: "flow", label: "Flows", parents: INNER, evidence: true, shape: "hexagon",
    fields: { involves: { kind: "ids", required: true } },
  },
  { id: "runbook", label: "Runbooks", parents: INNER, evidence: true, shape: "box", fields: {} },
  {
    id: "decision", label: "Decisions", parents: INNER, evidence: false, shape: "box",
    fields: {
      status: { kind: "enum", values: ["proposed", "accepted", "rejected"], required: true },
      date: { kind: "date", required: true, unknown: true },
      supersedes: { kind: "id", inverse: "superseded by" },
    },
  },
  { id: "term", label: "Glossary", parents: INNER, evidence: false, shape: "box", fields: {} },
];

const NOT_INVOLVABLE = ["project", "flow", "runbook", "decision", "term"];
const COMMON_FIELDS = ["type", "name", "summary", "in", "reviewed", "refs", "links"];

const isDate = (v) => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function diagnostics() {
  const list = [];
  return {
    list,
    error: (where, msg) => list.push({ level: "error", where, msg }),
    warn: (where, msg) => list.push({ level: "warn", where, msg }),
  };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : d.name.endsWith(".md") ? [p] : [];
  });
}

function parseFrontmatter(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("file must start with JSON frontmatter between --- lines");
  const meta = JSON.parse(m[1]);
  if (!isPlainObject(meta)) throw new Error("frontmatter must be a JSON object");
  return { meta, body: m[2].trim() };
}

function validateConfig(raw, d) {
  const repos = {};
  if (!isPlainObject(raw)) {
    d.error("kb.config.json", "must be a JSON object");
    return { repos, types: [] };
  }
  for (const k of Object.keys(raw)) if (!["repos", "types"].includes(k)) d.error("kb.config.json", `unknown key "${k}"`);
  for (const [alias, spec] of Object.entries(raw.repos ?? {})) {
    const where = `kb.config.json repos.${alias}`;
    if (!ID_RE.test(alias)) d.error(where, "alias must be kebab-case");
    if (!isPlainObject(spec)) { d.error(where, "must be an object"); continue; }
    for (const k of Object.keys(spec)) if (!["github", "branch", "checkout"].includes(k)) d.error(where, `unknown key "${k}"`);
    if (!/^[\w.-]+\/[\w.-]+$/.test(spec.github ?? "")) d.error(where, `"github" must be "owner/name"`);
    if (!isText(spec.branch)) d.error(where, `"branch" is required`);
    if ("checkout" in spec && spec.checkout !== false) d.error(where, `"checkout" can only be false (omit it for checked repos)`);
    repos[alias] = spec;
  }
  return { repos, types: Array.isArray(raw.types) ? raw.types : (d.error("kb.config.json", `"types" must be an array`), []) };
}

function validateTypes(custom, d) {
  const types = [...CORE_TYPES];
  for (const t of custom) {
    const where = `kb.config.json type ${t?.id ?? "?"}`;
    if (!isPlainObject(t) || !ID_RE.test(t.id ?? "")) { d.error(where, "type needs a kebab-case id"); continue; }
    if (types.some((x) => x.id === t.id)) { d.error(where, "duplicate type id"); continue; }
    for (const k of Object.keys(t)) if (!["id", "label", "parents", "evidence", "shape", "fields"].includes(k)) d.error(where, `unknown key "${k}"`);
    if (!isText(t.label)) d.error(where, `"label" is required`);
    if (!Array.isArray(t.parents) || t.parents.length === 0) d.error(where, `"parents" must be a non-empty array`);
    if (typeof t.evidence !== "boolean") d.error(where, `"evidence" must be true or false`);
    if (!SHAPES.includes(t.shape)) d.error(where, `"shape" must be one of ${SHAPES.join(", ")}`);
    const fields = t.fields ?? {};
    for (const [name, f] of Object.entries(fields)) {
      if (COMMON_FIELDS.includes(name)) d.error(where, `field "${name}" is a common field`);
      if (!FIELD_KINDS.includes(f?.kind)) d.error(where, `field "${name}" kind must be one of ${FIELD_KINDS.join(", ")}`);
      if (f?.kind === "enum" && !(Array.isArray(f.values) && f.values.length)) d.error(where, `enum field "${name}" needs "values"`);
    }
    types.push({ ...t, parents: t.parents ?? [], fields });
  }
  const ids = new Set(types.map((t) => t.id));
  for (const t of types) for (const p of t.parents) if (!ids.has(p)) d.error(`kb.config.json type ${t.id}`, `unknown parent type "${p}"`);
  return types;
}

function scanFences(body) {
  const segments = [];
  const lines = body.split("\n");
  let text = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/);
    if (!open) { text.push(lines[i]); continue; }
    const marker = open[1];
    const close = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    if (text.length) segments.push({ kind: "text", text: text.join("\n") });
    text = [];
    segments.push({ kind: "code", lang: open[2], raw: lines.slice(i, j + 1).join("\n"), content: lines.slice(i + 1, j).join("\n") });
    i = j;
  }
  if (text.length) segments.push({ kind: "text", text: text.join("\n") });
  return segments;
}

export const WIKI_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
export const REF_LINK_RE = /\]\(ref:([^)\s]+)\)/g;
const INLINE_CODE_RE = /(`+)[^`][\s\S]*?\1(?!`)/g;

export function mapProse(text, fn) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE_CODE_RE)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(text.slice(last));
}

export const QUERY_FENCES = ["kb-list", "kb-lineage"];

function parseBody(body, where, d) {
  const segments = scanFences(body);
  const wikilinks = [];
  const refs = [];
  const collectWikilinks = (text) => {
    for (const m of text.matchAll(WIKI_RE)) {
      if (!ID_RE.test(m[1])) d.error(where, `invalid wiki link [[${m[1]}]]`);
      else wikilinks.push(m[1]);
    }
  };
  for (const s of segments) {
    if (s.kind === "text") {
      mapProse(s.text, (prose) => {
        collectWikilinks(prose);
        for (const m of prose.matchAll(REF_LINK_RE)) refs.push(m[1]);
        return prose;
      });
    } else if (s.lang === "mermaid") {
      collectWikilinks(s.content);
    } else if (QUERY_FENCES.includes(s.lang)) {
      try {
        s.query = JSON.parse(s.content);
        if (!isPlainObject(s.query)) throw new Error("must be a JSON object");
      } catch (e) {
        d.error(where, `${s.lang} query: ${e.message}`);
        s.query = null;
      }
    }
  }
  return { segments, wikilinks, refs };
}

function validateValue(spec, value) {
  switch (spec.kind) {
    case "string": return isText(value) || "must be a non-empty string";
    case "date": return isDate(value) || (spec.unknown && value === "unknown") || `must be a YYYY-MM-DD date${spec.unknown ? ' or "unknown"' : ""}`;
    case "enum": return spec.values.includes(value) || `must be one of ${spec.values.join(", ")}`;
    case "id": return (typeof value === "string" && ID_RE.test(value)) || "must be an entity id";
    case "ids": return (Array.isArray(value) && value.every((v) => typeof v === "string" && ID_RE.test(v))) || "must be an array of entity ids";
  }
}

function readEntity(file, root, typeById, d) {
  const id = path.basename(file, ".md");
  const where = path.relative(root, file);
  if (!ID_RE.test(id)) { d.error(where, "file name must be a kebab-case id"); return null; }
  let parsed;
  try { parsed = parseFrontmatter(fs.readFileSync(file, "utf8")); }
  catch (e) { d.error(where, e.message); return null; }
  const { meta, body } = parsed;
  const type = typeById.get(meta.type);
  if (!type) { d.error(where, `unknown type "${meta.type}"`); return null; }

  const allowed = [...COMMON_FIELDS, ...Object.keys(type.fields)];
  for (const k of Object.keys(meta)) if (!allowed.includes(k)) d.error(where, `unknown field "${k}" for type ${type.id}`);
  if (!isText(meta.name)) d.error(where, `"name" is required`);
  if (!isText(meta.summary)) d.error(where, `"summary" is required`);
  if (!isDate(meta.reviewed)) d.error(where, `"reviewed" must be a YYYY-MM-DD date`);
  if (type.id === "project" && "in" in meta) d.error(where, `a project has no "in"`);
  if (type.id !== "project" && !(typeof meta.in === "string" && ID_RE.test(meta.in))) d.error(where, `"in" must be a parent entity id`);

  const refs = meta.refs ?? [];
  if (!Array.isArray(refs) || !refs.every(isText)) d.error(where, `"refs" must be an array of ref strings`);
  const links = meta.links ?? [];
  if (!Array.isArray(links)) d.error(where, `"links" must be an array`);
  const cleanLinks = (Array.isArray(links) ? links : []).filter((l, i) => {
    const bad = !isPlainObject(l) || Object.keys(l).some((k) => !["to", "verb", "carries"].includes(k))
      || !ID_RE.test(l.to ?? "") || !isText(l.verb) || !isText(l.carries);
    if (bad) d.error(where, `links[${i}] must be { "to": id, "verb": text, "carries": text }`);
    return !bad;
  });

  const fields = {};
  for (const [name, spec] of Object.entries(type.fields)) {
    if (!(name in meta)) { if (spec.required) d.error(where, `"${name}" is required for type ${type.id}`); continue; }
    const ok = validateValue(spec, meta[name]);
    if (ok !== true) d.error(where, `"${name}" ${ok}`);
    else fields[name] = meta[name];
  }

  const parsedBody = parseBody(body, where, d);
  return {
    id, file: where, type: type.id, name: meta.name, summary: meta.summary, in: meta.in ?? null,
    reviewed: meta.reviewed, fields, links: cleanLinks, body,
    metaRefs: Array.isArray(refs) ? refs.filter(isText) : [],
    ...parsedBody,
  };
}

function readView(file, root, d) {
  const id = path.basename(file, ".md");
  const where = path.relative(root, file);
  if (!ID_RE.test(id)) { d.error(where, "file name must be a kebab-case id"); return null; }
  let parsed;
  try { parsed = parseFrontmatter(fs.readFileSync(file, "utf8")); }
  catch (e) { d.error(where, e.message); return null; }
  const { meta, body } = parsed;
  for (const k of Object.keys(meta)) if (!["title", "order"].includes(k)) d.error(where, `unknown field "${k}"`);
  if (!isText(meta.title)) d.error(where, `"title" is required`);
  if (typeof meta.order !== "number") d.error(where, `"order" must be a number`);
  return { id, file: where, title: meta.title, order: meta.order, body, ...parseBody(body, where, d) };
}

function ancestorsOf(entities, e, d) {
  const chain = [];
  const seen = new Set([e.id]);
  let cur = e.in;
  while (cur) {
    if (seen.has(cur)) { d.error(e.file, `"in" forms a cycle through ${cur}`); return chain; }
    const p = entities.get(cur);
    if (!p) return chain;
    seen.add(cur);
    chain.push(cur);
    cur = p.in;
  }
  return chain;
}

function checkReferences(kb, d) {
  const { entities, typeById } = kb;
  const projects = [...entities.values()].filter((e) => e.type === "project");
  if (projects.length !== 1) d.error("entities/", `exactly one project entity is required, found ${projects.length}`);

  const exists = (id, where, what) => entities.has(id) || (d.error(where, `${what} "${id}" does not exist`), false);
  for (const e of entities.values()) {
    if (e.in && exists(e.in, e.file, "parent")) {
      const pt = entities.get(e.in).type;
      if (!typeById.get(e.type).parents.includes(pt)) d.error(e.file, `a ${e.type} cannot live in a ${pt}`);
    }
    for (const l of e.links) {
      exists(l.to, e.file, "link target");
      if (l.to === e.id) d.error(e.file, "an entity cannot link to itself");
    }
    for (const w of e.wikilinks) exists(w, e.file, "wiki link");
    for (const [name, v] of Object.entries(e.fields)) {
      const kind = typeById.get(e.type).fields[name].kind;
      if (kind === "id") exists(v, e.file, `"${name}"`);
      if (kind === "ids") v.forEach((x) => exists(x, e.file, `"${name}"`));
    }
  }
  for (const v of kb.views) for (const w of v.wikilinks) exists(w, v.file, "wiki link");
  for (const e of entities.values()) {
    if (e.type !== "flow" || !e.fields.involves) continue;
    const seen = new Set();
    for (const id of e.fields.involves) {
      if (seen.has(id)) d.error(e.file, `"involves" lists "${id}" twice`);
      seen.add(id);
      const t = entities.get(id)?.type;
      if (NOT_INVOLVABLE.includes(t)) d.error(e.file, `"involves" cannot name a ${t} ("${id}")`);
    }
  }
}

function checkLineage(kb, doc, query, d) {
  for (const k of Object.keys(query)) if (k !== "system") d.error(doc.file, `kb-lineage: unknown key "${k}"`);
  const system = kb.entities.get(query.system);
  if (system?.type !== "system") d.error(doc.file, `kb-lineage: "system" must name a system ("${query.system}")`);
}

function checkQueries(kb, d) {
  for (const doc of [...kb.entities.values(), ...kb.views]) {
    for (const s of doc.segments) {
      if (!s.query) continue;
      if (s.lang === "kb-lineage") { checkLineage(kb, doc, s.query, d); continue; }
      const type = s.query.type && kb.typeById.get(s.query.type);
      if (s.query.type && !type) d.error(doc.file, `kb-list: unknown type "${s.query.type}"`);
      if (s.query.under && !kb.entities.has(s.query.under)) d.error(doc.file, `kb-list: "under" entity "${s.query.under}" does not exist`);
      for (const [k, v] of Object.entries(s.query)) {
        if (typeof v !== "string") d.error(doc.file, `kb-list: "${k}" must be a string`);
        const known = ["type", "under", "in", "name"].includes(k) || (type && k in type.fields);
        if (!known) d.error(doc.file, `kb-list: unknown key "${k}"${type ? "" : " (field filters need a type)"}`);
      }
    }
  }
}

export function queryEntities(kb, query) {
  const fieldOf = (e, k) => (k in e.fields ? e.fields[k] : e[k]);
  return [...kb.entities.values()].filter((e) =>
    Object.entries(query).every(([k, v]) =>
      k === "under" ? kb.graph.ancestors.get(e.id).includes(v) : fieldOf(e, k) === v));
}

export function sortEntities(kb, list) {
  const dateField = (e) => Object.entries(kb.typeById.get(e.type).fields).find(([, f]) => f.kind === "date")?.[0];
  return [...list].sort((a, b) => {
    const known = (e) => { const v = dateField(e) && e.fields[dateField(e)]; return v && v !== "unknown" ? v : null; };
    const [da, db] = [known(a), known(b)];
    if (da && db && da !== db) return db.localeCompare(da);
    return a.name.localeCompare(b.name);
  });
}

function deriveGraph(kb, d) {
  const { entities, typeById } = kb;
  const ancestors = new Map();
  const children = new Map([...entities.keys()].map((id) => [id, []]));
  const incoming = new Map([...entities.keys()].map((id) => [id, []]));
  const mentionedBy = new Map([...entities.keys()].map((id) => [id, new Set()]));
  const inverse = new Map([...entities.keys()].map((id) => [id, []]));
  const flowsOf = new Map([...entities.keys()].map((id) => [id, []]));

  for (const e of entities.values()) {
    ancestors.set(e.id, ancestorsOf(entities, e, d));
    if (e.in && children.has(e.in)) children.get(e.in).push(e.id);
    for (const l of e.links) incoming.get(l.to)?.push({ from: e.id, verb: l.verb, carries: l.carries });
    for (const w of e.wikilinks) if (w !== e.id) mentionedBy.get(w)?.add(e.id);
    if (e.type === "flow") for (const id of e.fields.involves ?? []) flowsOf.get(id)?.push(e.id);
    for (const [name, v] of Object.entries(e.fields)) {
      const spec = typeById.get(e.type).fields[name];
      if (!spec.inverse) continue;
      for (const target of spec.kind === "ids" ? v : [v]) inverse.get(target)?.push({ label: spec.inverse, from: e.id });
    }
  }
  return {
    ancestors, children, incoming, inverse, flowsOf,
    mentionedBy: new Map([...mentionedBy].map(([k, v]) => [k, [...v]])),
  };
}

export function systemOf(kb, id) {
  return [id, ...kb.graph.ancestors.get(id)].find((x) => kb.entities.get(x).type === "system") ?? null;
}

export function systemUses(kb, system) {
  const uses = new Map();
  const add = (id, touch) => (uses.get(id) ?? uses.set(id, []).get(id)).push(touch);
  const outside = (id) => systemOf(kb, id) === null && kb.entities.get(id).type !== "project";
  for (const e of kb.entities.values()) {
    const inside = systemOf(kb, e.id) === system;
    for (const l of e.links) {
      if (inside && outside(l.to)) add(l.to, { from: e.id, verb: l.verb, to: l.to });
      if (outside(e.id) && systemOf(kb, l.to) === system) add(e.id, { from: e.id, verb: l.verb, to: l.to });
    }
    if (inside && e.type === "flow") for (const id of e.fields.involves) if (outside(id)) add(id, { flow: e.id });
  }
  return uses;
}

function warnContainersInNoFlow(kb, d) {
  const involved = [...kb.graph.flowsOf].filter(([, flows]) => flows.length).map(([id]) => id);
  const covered = new Set(involved.flatMap((id) => [id, ...kb.graph.ancestors.get(id)]));
  for (const e of kb.entities.values()) {
    if (e.type !== "container" || covered.has(e.id)) continue;
    if (kb.graph.ancestors.get(e.id).some((a) => involved.includes(a))) continue;
    d.warn(e.file, "container in no flow: name it in the \"involves\" of the flow it takes part in");
  }
}

export function heldInStore(kb, id) {
  return kb.graph.ancestors.get(id).some((a) => kb.entities.get(a).type === "store");
}

function warnUnlinkedData(kb, d) {
  for (const e of kb.entities.values()) {
    if (!heldInStore(kb, e.id) || e.links.length || kb.graph.incoming.get(e.id).length) continue;
    d.warn(e.file, "nothing reads or writes it: add the links of whatever reads or writes it");
  }
}

export function loadKb(root) {
  const d = diagnostics();
  const configPath = path.join(root, "kb.config.json");
  let rawConfig = {};
  try { rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8")); }
  catch (e) { d.error("kb.config.json", e.message); }
  const config = validateConfig(rawConfig, d);
  const types = validateTypes(config.types, d);
  const typeById = new Map(types.map((t) => [t.id, t]));

  const entities = new Map();
  for (const file of walk(path.join(root, "entities"))) {
    const e = readEntity(file, root, typeById, d);
    if (!e) continue;
    if (entities.has(e.id)) d.error(e.file, `duplicate id "${e.id}" (also ${entities.get(e.id).file})`);
    else entities.set(e.id, e);
  }
  const views = walk(path.join(root, "views")).map((f) => readView(f, root, d)).filter(Boolean)
    .sort((a, b) => a.order - b.order);

  const kb = { root, config, types, typeById, entities, views };
  checkReferences(kb, d);
  checkQueries(kb, d);
  kb.graph = deriveGraph(kb, d);
  warnContainersInNoFlow(kb, d);
  warnUnlinkedData(kb, d);
  kb.project = [...entities.values()].find((e) => e.type === "project") ?? null;
  kb.diagnostics = d.list;
  return kb;
}
