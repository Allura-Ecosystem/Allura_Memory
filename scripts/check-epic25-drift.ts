#!/usr/bin/env bun
/**
 * Epic 25 dependency drift checker (Story 25.1, AC-3).
 *
 * Three artifacts independently declare Epic 25 story metadata:
 *
 *   1. `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` -- the "## Stories"
 *      table (Key / Title / Status / Blocked by).
 *   2. `_bmad/bmm/stories/25-*.md` -- each story header (`**Status:**`, `**Depends on:**`,
 *      `**Blocks:**`).
 *   3. `_bmad/bmm/stories/sprint-status.yaml` -- the `epic_25:` block (key/status/depends_on).
 *
 * Nothing kept them in agreement. This script parses all three and exits non-zero on any
 * disagreement in membership, status, Depends-on, or Blocks.
 *
 * This is deliberately NOT one of the three pre-existing drift scripts:
 *   - `scripts/drift-check.sh`      -- .opencode vs .claude SKILL.md content drift
 *   - `scripts/run-drift-audit.sh`  -- Story 21.3 DB/retrieval drift
 *   - `scripts/drift-detection.ts`  -- agent-registry drift (wired as `registry:drift`)
 * None of them reads story dependency metadata.
 *
 * Usage:  bun run epic25:drift
 * Exit:   0 = no drift, 1 = drift found, 2 = a required artifact could not be parsed.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(process.env.EPIC25_DRIFT_ROOT ?? resolve(import.meta.dir, ".."));
const EPIC_DOC = join(
  REPO_ROOT,
  "_bmad/bmm/planning/epic-25-governed-curator-review-console.md",
);
const STORIES_DIR = join(REPO_ROOT, "_bmad/bmm/stories");
const SPRINT_STATUS = join(STORIES_DIR, "sprint-status.yaml");

/** A story key such as `25.1`, `25.2a`, `24.11`. */
type StoryKey = string;

interface EpicRow {
  key: StoryKey;
  title: string;
  status: string;
  blockedBy: StoryKey[];
}

interface StoryFile {
  key: StoryKey;
  path: string;
  status: string;
  dependsOn: StoryKey[];
  blocksRaw: string;
  blocks: StoryKey[];
  unknownRefs: string[];
}

interface SprintRow {
  key: StoryKey;
  title: string;
  status: string;
  dependsOn: StoryKey[];
}

interface Finding {
  key: StoryKey;
  field: string;
  detail: string;
}

const findings: Finding[] = [];

function report(key: StoryKey, field: string, detail: string): void {
  findings.push({ key, field, detail });
}

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

const KEY_TOKEN = /\b(\d{2}\.\d{1,2}[a-z]?)\b/g;
/** en dash, em dash, or hyphen used as a range separator between two keys. */
const RANGE_TOKEN = /\b(\d{2}\.\d{1,2}[a-z]?)\s*[\u2013\u2014-]\s*(\d{2}\.\d{1,2}[a-z]?)\b/g;

/** Sort keys as (epic, story, suffix) so `25.2a` < `25.2b` < `25.3` < `25.11`. */
function keyOrder(key: StoryKey): [number, number, string] {
  const m = /^(\d+)\.(\d+)([a-z]?)$/.exec(key);
  if (!m) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, key];
  return [Number(m[1]), Number(m[2]), m[3] ?? ""];
}

function compareKeys(a: StoryKey, b: StoryKey): number {
  const [ae, as, ax] = keyOrder(a);
  const [be, bs, bx] = keyOrder(b);
  if (ae !== be) return ae - be;
  if (as !== bs) return as - bs;
  return ax.localeCompare(bx);
}

function sortKeys(keys: Iterable<StoryKey>): StoryKey[] {
  return [...new Set(keys)].sort(compareKeys);
}

/**
 * Extract story keys from free prose. Ranges (`25.3-25.6`) are expanded over
 * `knownKeys`; a range endpoint that is not a known key is returned via `unknown`.
 */
function extractKeys(
  text: string,
  knownKeys: StoryKey[],
): { keys: StoryKey[]; unknown: string[] } {
  const keys = new Set<StoryKey>();
  const unknown = new Set<string>();
  const ordered = [...knownKeys].sort(compareKeys);

  let remaining = text;
  for (const m of text.matchAll(RANGE_TOKEN)) {
    const [whole, lo, hi] = m;
    if (lo === undefined || hi === undefined) continue;
    const loIdx = ordered.indexOf(lo);
    const hiIdx = ordered.indexOf(hi);
    if (loIdx === -1) unknown.add(lo);
    if (hiIdx === -1) unknown.add(hi);
    if (loIdx !== -1 && hiIdx !== -1 && loIdx <= hiIdx) {
      for (let i = loIdx; i <= hiIdx; i += 1) {
        const k = ordered[i];
        if (k !== undefined) keys.add(k);
      }
    }
    remaining = remaining.replace(whole, " ");
  }

  for (const m of remaining.matchAll(KEY_TOKEN)) {
    const k = m[1];
    if (k === undefined) continue;
    keys.add(k);
  }

  // Any 25.x reference outside the canonical story set is a dangling reference.
  for (const k of keys) {
    if (k.startsWith("25.") && !ordered.includes(k)) unknown.add(k);
  }

  return { keys: sortKeys(keys), unknown: [...unknown].sort(compareKeys) };
}

/**
 * Collapse the three vocabularies onto one token so that "Planned /
 * dependency-blocked" and "merged, dependency-blocked" are recognised as the same
 * claim, while "changes-requested" stays distinct from "blocked".
 */
function normaliseStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (s.includes("dependency-blocked") || s.includes("dependency blocked")) {
    return "dependency-blocked";
  }
  if (s.includes("changes-requested") || s.includes("changes requested")) {
    return "changes-requested";
  }
  if (s.includes("ready-for-dev") || s.includes("ready for dev")) return "ready-for-dev";
  if (s.includes("in-progress") || s.includes("in progress")) return "in-progress";
  if (s.includes("blocked")) return "blocked";
  if (s.includes("done")) return "done";
  if (s.includes("planned")) return "planned";
  return s;
}

// ---------------------------------------------------------------------------
// 1. Epic planning document -- "## Stories" table
// ---------------------------------------------------------------------------

function parseEpicDoc(): EpicRow[] {
  const lines = readFileSync(EPIC_DOC, "utf8").split("\n");
  const start = lines.findIndex((l) => /^##\s+Stories\s*$/.test(l));
  if (start === -1) {
    console.error(`FATAL: no "## Stories" heading in ${EPIC_DOC}`);
    process.exit(2);
  }

  const rows: EpicRow[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const key = cells[0] ?? "";
    if (!/^\d{2}\.\d{1,2}[a-z]?$/.test(key)) continue; // skips header + separator rows
    rows.push({
      key,
      title: cells[1] ?? "",
      status: cells[2] ?? "",
      blockedBy: [],
    });
    // blockedBy is filled after the full key set is known (ranges need it).
    (rows[rows.length - 1] as EpicRow & { _rawBlockedBy?: string })._rawBlockedBy =
      cells[3] ?? "";
  }

  if (rows.length === 0) {
    console.error(`FATAL: "## Stories" table in ${EPIC_DOC} produced no rows`);
    process.exit(2);
  }

  const known = rows.map((r) => r.key);
  for (const row of rows) {
    const raw = (row as EpicRow & { _rawBlockedBy?: string })._rawBlockedBy ?? "";
    const { keys, unknown } = extractKeys(raw, known);
    row.blockedBy = keys;
    for (const u of unknown) {
      report(
        row.key,
        "epic-doc Blocked-by",
        `references story "${u}", which has no story file in _bmad/bmm/stories/`,
      );
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 2. Story files -- _bmad/bmm/stories/25-*.md
// ---------------------------------------------------------------------------

function keyFromFilename(name: string): StoryKey | null {
  const m = /^(\d+)-(\d+[a-z]?)-/.exec(name);
  if (!m) return null;
  return `${m[1]}.${m[2]}`;
}

function headerField(body: string, label: string): string | null {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`, "m");
  const m = re.exec(body);
  return m ? (m[1] ?? "").trim() : null;
}

function parseStoryFiles(known: StoryKey[]): StoryFile[] {
  const names = readdirSync(STORIES_DIR)
    .filter((n) => /^25-\d+[a-z]?-.*\.md$/.test(n))
    .sort();

  const out: StoryFile[] = [];
  for (const name of names) {
    const key = keyFromFilename(name);
    if (key === null) continue;
    const path = join(STORIES_DIR, name);
    const body = readFileSync(path, "utf8");

    const status = headerField(body, "Status");
    const dependsRaw = headerField(body, "Depends on");
    const blocksRaw = headerField(body, "Blocks");

    if (status === null || dependsRaw === null || blocksRaw === null) {
      report(
        key,
        "story-file header",
        `missing one of **Status:** / **Depends on:** / **Blocks:** in ${name}`,
      );
    }

    const depends = extractKeys(dependsRaw ?? "", known);
    const blocks = extractKeys(blocksRaw ?? "", known);

    out.push({
      key,
      path,
      status: status ?? "",
      dependsOn: depends.keys,
      blocksRaw: blocksRaw ?? "",
      blocks: blocks.keys,
      unknownRefs: sortKeys([...depends.unknown, ...blocks.unknown]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. sprint-status.yaml -- epic_25 block
// ---------------------------------------------------------------------------

function parseSprintStatus(known: StoryKey[]): SprintRow[] {
  const lines = readFileSync(SPRINT_STATUS, "utf8").split("\n");
  const start = lines.findIndex((l) => /^epic_25:\s*$/.test(l));
  if (start === -1) {
    console.error(`FATAL: no "epic_25:" block in ${SPRINT_STATUS}`);
    process.exit(2);
  }

  const rows: SprintRow[] = [];
  let current: Partial<SprintRow> | null = null;

  const flush = (): void => {
    if (current && typeof current.key === "string") {
      rows.push({
        key: current.key,
        title: current.title ?? "",
        status: current.status ?? "",
        dependsOn: current.dependsOn ?? [],
      });
    }
    current = null;
  };

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^\S/.test(line) && line.trim() !== "") break; // next top-level key
    const trimmed = line.trim();

    const keyMatch = /^-\s*key:\s*"?([^"\s]+)"?\s*$/.exec(trimmed);
    if (keyMatch) {
      flush();
      current = { key: keyMatch[1] ?? "" };
      continue;
    }
    if (current === null) continue;

    const titleMatch = /^title:\s*"?(.*?)"?\s*$/.exec(trimmed);
    if (titleMatch) {
      current.title = titleMatch[1] ?? "";
      continue;
    }
    const statusMatch = /^status:\s*"?(.*?)"?\s*$/.exec(trimmed);
    if (statusMatch) {
      current.status = statusMatch[1] ?? "";
      continue;
    }
    const dependsMatch = /^depends_on:\s*(\[.*\])\s*$/.exec(trimmed);
    if (dependsMatch) {
      current.dependsOn = extractKeys(dependsMatch[1] ?? "", known).keys;
      continue;
    }
  }
  flush();

  if (rows.length === 0) {
    console.error(`FATAL: "epic_25:" block in ${SPRINT_STATUS} produced no stories`);
    process.exit(2);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function setsEqual(a: StoryKey[], b: StoryKey[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function fmt(keys: StoryKey[]): string {
  return keys.length === 0 ? "(none)" : keys.join(", ");
}

/**
 * Derive, for each Epic 25 story, the transitive set of Epic 25 stories it blocks --
 * the reverse closure of the dependency graph. Story files declare Blocks
 * transitively (25.1 lists 25.3..25.7, not just its direct dependents), so the
 * closure is the correct comparison target.
 */
function derivedBlocks(edges: Map<StoryKey, StoryKey[]>, epicKeys: StoryKey[]): Map<StoryKey, StoryKey[]> {
  const reverse = new Map<StoryKey, StoryKey[]>();
  for (const k of epicKeys) reverse.set(k, []);
  for (const [child, parents] of edges) {
    if (!epicKeys.includes(child)) continue;
    for (const p of parents) {
      if (!epicKeys.includes(p)) continue; // cross-epic parents are not Epic 25 blocks
      reverse.get(p)?.push(child);
    }
  }

  const closure = new Map<StoryKey, StoryKey[]>();
  for (const k of epicKeys) {
    const seen = new Set<StoryKey>();
    const stack = [...(reverse.get(k) ?? [])];
    while (stack.length > 0) {
      const n = stack.pop();
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      stack.push(...(reverse.get(n) ?? []));
    }
    closure.set(k, sortKeys(seen));
  }
  return closure;
}

function main(): void {
  const epicRows = parseEpicDoc();
  const known = epicRows.map((r) => r.key);
  const storyFiles = parseStoryFiles(known);
  const sprintRows = parseSprintStatus(known);

  const epicByKey = new Map(epicRows.map((r) => [r.key, r]));
  const storyByKey = new Map(storyFiles.map((r) => [r.key, r]));
  const sprintByKey = new Map(sprintRows.map((r) => [r.key, r]));

  // --- membership ---------------------------------------------------------
  const allKeys = sortKeys([...epicByKey.keys(), ...storyByKey.keys(), ...sprintByKey.keys()]);
  for (const key of allKeys) {
    const missing: string[] = [];
    if (!epicByKey.has(key)) missing.push("epic planning doc Stories table");
    if (!storyByKey.has(key)) missing.push("story file _bmad/bmm/stories/");
    if (!sprintByKey.has(key)) missing.push("sprint-status.yaml epic_25");
    if (missing.length > 0) {
      report(key, "membership", `absent from: ${missing.join("; ")}`);
    }
  }

  const epicKeys = sortKeys(known);

  // --- dangling references ------------------------------------------------
  for (const sf of storyFiles) {
    for (const u of sf.unknownRefs) {
      report(
        sf.key,
        "story-file reference",
        `references story "${u}", which is not one of the Epic 25 stories (${fmt(epicKeys)})`,
      );
    }
  }

  for (const key of epicKeys) {
    const epic = epicByKey.get(key);
    const story = storyByKey.get(key);
    const sprint = sprintByKey.get(key);
    if (!epic || !story || !sprint) continue; // already reported under membership

    // --- status ----------------------------------------------------------
    const sE = normaliseStatus(epic.status);
    const sS = normaliseStatus(story.status);
    const sY = normaliseStatus(sprint.status);
    if (!(sE === sS && sS === sY)) {
      report(
        key,
        "status",
        `epic-doc="${epic.status}" (${sE}) | story-file="${story.status}" (${sS}) | ` +
          `sprint-status="${sprint.status}" (${sY})`,
      );
    }

    // --- depends on ------------------------------------------------------
    if (!setsEqual(epic.blockedBy, story.dependsOn)) {
      report(
        key,
        "Depends-on",
        `epic-doc Blocked-by=[${fmt(epic.blockedBy)}] != story-file Depends-on=[${fmt(story.dependsOn)}]`,
      );
    }
    if (!setsEqual(sprint.dependsOn, story.dependsOn)) {
      report(
        key,
        "Depends-on",
        `sprint-status depends_on=[${fmt(sprint.dependsOn)}] != story-file Depends-on=[${fmt(story.dependsOn)}]`,
      );
    }
    if (!setsEqual(epic.blockedBy, sprint.dependsOn)) {
      report(
        key,
        "Depends-on",
        `epic-doc Blocked-by=[${fmt(epic.blockedBy)}] != sprint-status depends_on=[${fmt(sprint.dependsOn)}]`,
      );
    }
  }

  // --- blocks (derived from the dependency graph) --------------------------
  const edges = new Map<StoryKey, StoryKey[]>();
  for (const sf of storyFiles) edges.set(sf.key, sf.dependsOn);
  const closure = derivedBlocks(edges, epicKeys);

  for (const key of epicKeys) {
    const story = storyByKey.get(key);
    if (!story) continue;
    const declared = story.blocks.filter((k) => epicKeys.includes(k));
    const derived = closure.get(key) ?? [];
    if (!setsEqual(declared, derived)) {
      report(
        key,
        "Blocks",
        `story-file Blocks=[${fmt(declared)}] != graph-derived transitive blocks=[${fmt(derived)}] ` +
          `(derived from the Depends-on edges of all Epic 25 stories)`,
      );
    }
  }

  // --- output -------------------------------------------------------------
  console.log("Epic 25 dependency drift check");
  console.log(`  epic planning doc : ${epicRows.length} stories`);
  console.log(`  story files       : ${storyFiles.length} stories`);
  console.log(`  sprint-status.yaml: ${sprintRows.length} stories`);
  console.log("");

  if (findings.length === 0) {
    console.log("PASS - no drift. All three sources agree on status, Depends-on, and Blocks.");
    process.exit(0);
  }

  console.error(`FAIL - ${findings.length} drift finding(s):`);
  console.error("");
  for (const f of findings.sort(
    (a, b) => compareKeys(a.key, b.key) || a.field.localeCompare(b.field),
  )) {
    console.error(`  [${f.key}] ${f.field}`);
    console.error(`      ${f.detail}`);
  }
  console.error("");
  console.error(
    "Fix the disagreeing source. The epic planning doc, the story file header, and " +
      "sprint-status.yaml must all carry the same status and dependency edges.",
  );
  process.exit(1);
}

main();
