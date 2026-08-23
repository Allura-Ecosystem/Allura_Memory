#!/usr/bin/env bun
/**
 * CA-24-02 story status guard (Story 24.11a, final acceptance criterion).
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-23 a story in this repository was found marked `done` in
 * `_bmad/bmm/stories/sprint-status.yaml` while its own acceptance criteria were
 * unchecked, and its story-file header claimed an "independent Pike/Fowler review
 * approved" when both reviewers had returned CHANGES-REQUESTED and no re-review was
 * ever run. A test had been written pinning that false claim, so a green suite was
 * defending a fabrication. A human reading the file caught it; no automation did.
 *
 * The Epic 24 retrospective named the pathology: "Throughput replaced the Definition
 * of Done" and "the same agent implemented, interpreted CI, merged, and marked the
 * work complete." This guard is corrective action CA-24-02: it fails when a story's
 * DECLARED status outruns its EVIDENCE.
 *
 * WHAT IT CHECKS
 * --------------
 * The declaration of record is `sprint-status.yaml`. For every story whose status
 * there normalises to `done`:
 *
 *   1. `unchecked-acceptance-criterion` - the story file's `## Acceptance Criteria`
 *      section still contains an unchecked `- [ ]` item.
 *   2. `missing-acceptance-criteria`    - the story file has no acceptance criteria
 *      section at all, so "done" is unfalsifiable.
 *   3. `incompleteness-marker`          - the story file says, in its own words, that
 *      something is NOT COMPLETE / not satisfied / remains incomplete.
 *   4. `missing-dev-agent-record`       - no Dev Agent Record and no Completion Notes
 *      section exists.
 *   5. `missing-story-file`             - no story file exists for the key at all.
 *   6. `ambiguous-story-file`           - more than one file plausibly IS the story.
 *      The guard refuses to pick one arbitrarily; an arbitrary pick is how a guard
 *      starts silently checking the wrong document.
 *
 * And for EVERY story that has a story file, regardless of status:
 *
 *   7. `unverified-review-claim` - the story-file header claims a review verdict
 *      (approved / sign-off / APPROVE / gate PASS) and no review evidence artifact
 *      named in that header resolves to a file that actually exists on disk.
 *
 * HONEST DESIGN OF CHECK 7
 * ------------------------
 * This guard cannot verify that a review happened. It can only verify that a claim
 * of one points at something. So the check is deliberately biased toward flagging:
 * an unevidenced claim FAILS the build and asks a human to either produce the
 * evidence artifact or delete the claim. It does not try to guess.
 *
 * Two classes of header text are reported but NOT counted as violations, because
 * neither is an assertion that a review passed:
 *   - negated or retracted claims ("neither reviewer approved", "that claim was
 *     false and is retracted", "independent review not yet passed");
 *   - claims that name an existing review-evidence path.
 * Both classes are printed under "Notes" so a human still sees every claim the
 * guard found. Nothing is dropped on the floor.
 *
 * DELIBERATE NON-GOAL
 * -------------------
 * `status_evidence:` prose inside `sprint-status.yaml` also carries review-verdict
 * claims (many of them). This guard does not scan it. The acceptance criterion
 * scopes check 7 to the story-file header, and widening it here would bury the
 * checks that matter under dozens of legacy prose findings. That surface is
 * unguarded and is called out as such rather than pretended away.
 *
 * Usage:  bun run scripts/check-story-status-guard.ts
 *         STORY_STATUS_GUARD_ROOT=<dir> bun run scripts/check-story-status-guard.ts
 * Exit:   0 = clean, 1 = violations found, 2 = malformed input it cannot parse.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(
  process.env.STORY_STATUS_GUARD_ROOT ?? resolve(import.meta.dir, ".."),
);
const STORIES_DIR = join(REPO_ROOT, "_bmad/bmm/stories");
const SPRINT_STATUS = join(STORIES_DIR, "sprint-status.yaml");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SprintStory {
  epic: string;
  key: string;
  title: string;
  rawStatus: string;
  status: string;
}

interface StoryFileCandidate {
  name: string;
  path: string;
  declaresStatusField: boolean;
}

interface Finding {
  key: string;
  check: string;
  detail: string;
}

interface Note {
  key: string;
  check: string;
  detail: string;
}

const violations: Finding[] = [];
const notes: Note[] = [];

function violation(key: string, check: string, detail: string): void {
  violations.push({ key, check, detail });
}

function note(key: string, check: string, detail: string): void {
  notes.push({ key, check, detail });
}

/** Malformed input the guard cannot parse. Always exit 2, never 1 and never 0. */
function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * Collapse the status vocabulary onto one token. Order matters: `review` and
 * `changes-requested` and `superseded` are all tested BEFORE `done`, so a
 * descriptive status such as "review - 7 of 8 acceptance criteria met" or
 * "superseded, work folded into 24.11a (done elsewhere)" is not read as done.
 */
function normaliseStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (s.includes("superseded")) return "superseded";
  if (s.includes("deferred")) return "deferred";
  if (s.includes("changes-requested") || s.includes("changes requested")) {
    return "changes-requested";
  }
  if (s.includes("dependency-blocked") || s.includes("dependency blocked")) {
    return "dependency-blocked";
  }
  if (s.includes("ready-for-dev") || s.includes("ready for dev")) return "ready-for-dev";
  if (s.includes("in-progress") || s.includes("in progress")) return "in-progress";
  if (s.includes("review")) return "review";
  if (s.includes("blocked")) return "blocked";
  if (s.includes("done") || s.includes("complete")) return "done";
  if (s.includes("planned")) return "planned";
  return s;
}

// ---------------------------------------------------------------------------
// 1. sprint-status.yaml - the declaration of record
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSprintStatus(): SprintStory[] {
  if (!existsSync(SPRINT_STATUS)) {
    fatal(`sprint-status.yaml not found at ${SPRINT_STATUS}`);
  }

  let raw: string;
  try {
    raw = readFileSync(SPRINT_STATUS, "utf8");
  } catch (error: unknown) {
    fatal(`cannot read ${SPRINT_STATUS}: ${String(error)}`);
  }

  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (error: unknown) {
    fatal(`${SPRINT_STATUS} is not valid YAML: ${String(error)}`);
  }

  if (!isRecord(doc)) {
    fatal(`${SPRINT_STATUS} did not parse to a mapping of epic blocks`);
  }

  const epicNames = Object.keys(doc).filter((k) => /^epic_\d+$/.test(k));
  if (epicNames.length === 0) {
    fatal(`${SPRINT_STATUS} contains no "epic_NN:" blocks`);
  }

  const out: SprintStory[] = [];
  for (const epic of epicNames) {
    const block = doc[epic];
    if (!isRecord(block)) {
      fatal(`${SPRINT_STATUS}: "${epic}" is not a mapping`);
    }
    const stories = block["stories"];
    if (stories === undefined) continue; // an epic block may legitimately carry no stories
    if (!Array.isArray(stories)) {
      fatal(`${SPRINT_STATUS}: "${epic}.stories" is not a list`);
    }
    for (let i = 0; i < stories.length; i += 1) {
      const entry: unknown = stories[i];
      if (!isRecord(entry)) {
        fatal(`${SPRINT_STATUS}: "${epic}.stories[${i}]" is not a mapping`);
      }
      const key = entry["key"];
      if (typeof key !== "string" || key.trim() === "") {
        fatal(`${SPRINT_STATUS}: "${epic}.stories[${i}]" has no string "key"`);
      }
      const status = entry["status"];
      if (typeof status !== "string" || status.trim() === "") {
        // A status guard cannot proceed past a story with no status. This is
        // malformed input (exit 2), not a policy violation (exit 1).
        fatal(
          `${SPRINT_STATUS}: story "${key}" in "${epic}" has no string "status" field`,
        );
      }
      const title = entry["title"];
      out.push({
        epic,
        key: key.trim(),
        title: typeof title === "string" ? title : "",
        rawStatus: status.trim(),
        status: normaliseStatus(status),
      });
    }
  }

  if (out.length === 0) {
    fatal(`${SPRINT_STATUS} produced no stories from its "epic_NN:" blocks`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Story files
// ---------------------------------------------------------------------------

const STORY_FILE_NAME = /^(\d+)-(\d+[a-z]?)-.+\.md$/;

function indexStoryFiles(): Map<string, StoryFileCandidate[]> {
  let names: string[];
  try {
    names = readdirSync(STORIES_DIR);
  } catch (error: unknown) {
    fatal(`cannot read stories directory ${STORIES_DIR}: ${String(error)}`);
  }

  const index = new Map<string, StoryFileCandidate[]>();
  for (const name of names.sort()) {
    const m = STORY_FILE_NAME.exec(name);
    if (m === null) continue;
    const key = `${m[1]}.${m[2]}`;
    const path = join(STORIES_DIR, name);
    let body: string;
    try {
      body = readFileSync(path, "utf8");
    } catch (error: unknown) {
      fatal(`cannot read story file ${path}: ${String(error)}`);
    }
    const candidate: StoryFileCandidate = {
      name,
      path,
      declaresStatusField: /^\*\*Status:\*\*/m.test(body),
    };
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [candidate]);
    else bucket.push(candidate);
  }
  return index;
}

/**
 * Pick the one file that IS the story for `key`.
 *
 * `24.1` matches both `24-1-ci-benchmarks.md` (the story) and `24-1-code-review.md`
 * (a review record that happens to share the numbering). The discriminator is the
 * `**Status:**` header field, which a story file declares and an adjacent document
 * does not. If that rule still leaves more than one candidate the guard reports the
 * ambiguity rather than choosing.
 */
function resolveStoryFile(
  candidates: StoryFileCandidate[],
): { file: StoryFileCandidate } | { ambiguous: StoryFileCandidate[] } | null {
  if (candidates.length === 0) return null;
  const declared = candidates.filter((c) => c.declaresStatusField);
  const pool = declared.length > 0 ? declared : candidates;
  const only = pool[0];
  if (pool.length === 1 && only !== undefined) return { file: only };
  return { ambiguous: pool };
}

// ---------------------------------------------------------------------------
// 3. Markdown helpers
// ---------------------------------------------------------------------------

/**
 * Everything above the first level-2 heading: the title, any admonition block, and
 * the `**Status:** / **Owner:** / **Depends on:**` metadata fields. This is the
 * "story file header" that check 7 is scoped to.
 */
function headerRegion(body: string): string[] {
  const lines = body.split("\n");
  const end = lines.findIndex((l) => /^##\s/.test(l));
  return end === -1 ? lines : lines.slice(0, end);
}

/** Body of the first section whose heading text matches `matcher`, or null. */
function findSection(body: string, matcher: RegExp): string[] | null {
  const lines = body.split("\n");
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i] ?? "");
    if (m === null) continue;
    if (matcher.test(m[2] ?? "")) {
      startIdx = i;
      level = (m[1] ?? "#").length;
      break;
    }
  }
  if (startIdx === -1) return null;

  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const m = /^(#{1,6})\s/.exec(line);
    if (m !== null && (m[1] ?? "").length <= level) break;
    out.push(line);
  }
  return out;
}

function incompleteDevAgentRecordFields(body: string): string[] {
  const record = findSection(body, DEV_RECORD_HEADING);
  if (record === null) return ["Dev Agent Record"];
  const text = record.join("\n");
  const required: Array<[string, RegExp]> = [
    ["agent", /\bagent\s*:/i],
    ["date", /\bdate\s*:/i],
    ["files changed", /\bfiles? changed\s*:/i],
    ["commands/evidence with exit code", /\b(commands?|evidence)\s*:[^\n]*(?:exit\s*(?:code)?\s*[:=]?\s*\d+|->\s*exit\s*\d+)/i],
    ["remaining gaps", /\bremaining gaps?\s*:\s*(?:none|[^\n]+)/i],
  ];
  return required.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

function hasHeading(body: string, matcher: RegExp): boolean {
  return body
    .split("\n")
    .some((l) => {
      const m = /^(#{1,6})\s+(.*)$/.exec(l);
      return m !== null && matcher.test(m[2] ?? "");
    });
}

const UNCHECKED_BOX = /^\s*[-*]\s+\[ \]/;
const AC_HEADING = /acceptance criteri/i;
const DEV_RECORD_HEADING = /dev agent record|completion notes/i;

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 3)}...`;
}

// ---------------------------------------------------------------------------
// 4. Incompleteness markers
// ---------------------------------------------------------------------------

/**
 * Phrases that are a story saying, in its own voice, that something is unfinished.
 * Kept deliberately tight. Generic words ("not implemented", "not done") are
 * excluded because they appear legitimately in out-of-scope and defect-description
 * prose; every match here quotes its line so a human can judge in one glance.
 */
const INCOMPLETENESS_MARKERS: readonly RegExp[] = [
  /\bnot[\s-]complete\b/i,
  /\bnot\s+satisfied\b/i,
  /\bunsatisfied\b/i,
  /\bnot\s+yet\s+satisfied\b/i,
  /\bdoes\s+not\s+satisfy\b/i,
  /\bremains?\s+incomplete\b/i,
  /\b(is|are|was|were)\s+incomplete\b/i,
  /\bpartially\s+satisfied\b/i,
];

// ---------------------------------------------------------------------------
// 5. Review-verdict claims
// ---------------------------------------------------------------------------

/** A word that asserts a favourable verdict. */
const VERDICT_TOKEN =
  /\b(approved|approval|approves?|sign-?off|signed[\s-]off|accepted|pass|passed)\b/i;

/** Context that makes the verdict a REVIEW verdict rather than, say, a test pass. */
const REVIEW_CONTEXT = /\b(review|reviewer|reviewed|sign-?off|gate|verdict)\b/i;

/**
 * Anything that turns the sentence into a denial, a retraction, or a pending state.
 * A line carrying one of these is not an assertion that a review passed.
 */
const CLAIM_NEGATION =
  /\b(not|never|no|neither|none|without|un-?approved|denied|rejected|refused|changes-?requested|changes\s+requested|pending|awaiting|retract\w*|false|previously|incorrect\w*|corrected|claim(?:ed|s)?\s+to)\b/i;

/** A relative path token that looks like it names an artifact on disk. */
const PATH_TOKEN = /((?:[\w.@-]+\/)+[\w.@-]+\.(?:md|txt|json|ya?ml|log|html|csv))/g;

/** Only a review-ish artifact counts as evidence for a review claim. */
const EVIDENCE_PATH_HINT = /verdict|review|approval|sign-?off|gate|evidence|receipt/i;

function findReviewEvidence(headerLines: string[]): string | null {
  for (const line of headerLines) {
    for (const m of line.matchAll(PATH_TOKEN)) {
      const candidate = m[1];
      if (candidate === undefined) continue;
      if (!EVIDENCE_PATH_HINT.test(candidate)) continue;
      const absolute = resolve(REPO_ROOT, candidate);
      if (!existsSync(absolute)) continue;
      try {
        if (statSync(absolute).isFile()) return candidate;
      } catch {
        // unreadable path is not evidence
      }
    }
  }
  return null;
}

function checkReviewClaims(key: string, body: string, fileName: string): void {
  const headerLines = headerRegion(body);
  const claims: string[] = [];
  const negated: string[] = [];

  for (const line of headerLines) {
    if (line.trim() === "") continue;
    if (!VERDICT_TOKEN.test(line)) continue;
    if (!REVIEW_CONTEXT.test(line)) continue;
    if (CLAIM_NEGATION.test(line)) {
      negated.push(line);
      continue;
    }
    claims.push(line);
  }

  for (const line of negated) {
    note(
      key,
      "retracted-or-negated-review-claim",
      `${fileName} header mentions a review verdict in a negated or retracted form ` +
        `(not counted as a claim): "${truncate(line, 140)}"`,
    );
  }

  if (claims.length === 0) return;

  const evidence = findReviewEvidence(headerLines);
  for (const line of claims) {
    if (evidence !== null) {
      note(
        key,
        "evidenced-review-claim",
        `${fileName} header claims a review verdict and names an existing evidence ` +
          `artifact "${evidence}". The guard confirms the artifact EXISTS; it does ` +
          `not and cannot confirm what the artifact says. Claim: "${truncate(line, 140)}"`,
      );
      continue;
    }
    violation(
      key,
      "unverified-review-claim",
      `${fileName} header claims a review verdict but names no review evidence ` +
        `artifact that exists on disk. Claim: "${truncate(line, 160)}". ` +
        `Resolve by adding a path to the recorded verdict (for example ` +
        `scratchpad/<reviewer>-<story>-verdict.md) in the header, or by deleting the ` +
        `claim. This guard cannot confirm a review occurred and will not pretend to.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const sprintStories = parseSprintStatus();
  const fileIndex = indexStoryFiles();

  const doneStories = sprintStories.filter((s) => s.status === "done");
  const checkedFiles = new Set<string>();

  for (const story of sprintStories) {
    const candidates = fileIndex.get(story.key) ?? [];
    const resolved = resolveStoryFile(candidates);

    if (resolved === null) {
      if (story.status === "done") {
        violation(
          story.key,
          "missing-story-file",
          `marked "${story.rawStatus}" in sprint-status.yaml (${story.epic}) but no ` +
            `story file matching ${story.key.replace(".", "-")}-*.md exists in ` +
            `_bmad/bmm/stories/. A done status with no story file has no evidence at all.`,
        );
      }
      continue;
    }

    if ("ambiguous" in resolved) {
      violation(
        story.key,
        "ambiguous-story-file",
        `${resolved.ambiguous.length} files could be this story ` +
          `(${resolved.ambiguous.map((c) => c.name).join(", ")}). The guard refuses to ` +
          `guess which one carries the acceptance criteria. Give exactly one of them a ` +
          `"**Status:**" header field, or rename the others.`,
      );
      continue;
    }

    const file = resolved.file;
    if (checkedFiles.has(file.path)) continue;
    checkedFiles.add(file.path);

    let body: string;
    try {
      body = readFileSync(file.path, "utf8");
    } catch (error: unknown) {
      fatal(`cannot read story file ${file.path}: ${String(error)}`);
    }

    // Check 7 applies to every story that has a file, done or not: a false review
    // claim is a false claim whatever the status line says.
    checkReviewClaims(story.key, body, file.name);

    if (story.status !== "done") continue;

    // --- Check 1 / 2: acceptance criteria -------------------------------
    const acSection = findSection(body, AC_HEADING);
    if (acSection === null) {
      violation(
        story.key,
        "missing-acceptance-criteria",
        `marked "${story.rawStatus}" but ${file.name} has no acceptance criteria ` +
          `section. "Done" against no criteria is unfalsifiable.`,
      );
    } else {
      const unchecked = acSection.filter((l) => UNCHECKED_BOX.test(l));
      if (unchecked.length > 0) {
        const sample = unchecked
          .slice(0, 3)
          .map((l) => `"${truncate(l, 110)}"`)
          .join("; ");
        violation(
          story.key,
          "unchecked-acceptance-criterion",
          `marked "${story.rawStatus}" in sprint-status.yaml (${story.epic}) but ` +
            `${file.name} still has ${unchecked.length} unchecked acceptance ` +
            `criterion/criteria: ${sample}` +
            (unchecked.length > 3 ? ` (+${unchecked.length - 3} more)` : ""),
        );
      }
    }

    // --- Check 3: explicit incompleteness marker ------------------------
    const lines = body.split("\n");
    const markerHits: string[] = [];
    for (const line of lines) {
      if (INCOMPLETENESS_MARKERS.some((re) => re.test(line))) markerHits.push(line);
    }
    if (markerHits.length > 0) {
      const sample = markerHits
        .slice(0, 3)
        .map((l) => `"${truncate(l, 110)}"`)
        .join("; ");
      violation(
        story.key,
        "incompleteness-marker",
        `marked "${story.rawStatus}" but ${file.name} states its own incompleteness ` +
          `on ${markerHits.length} line(s): ${sample}` +
          (markerHits.length > 3 ? ` (+${markerHits.length - 3} more)` : ""),
      );
    }

    // --- Check 4: machine-checkable Dev Agent Record ---------------------
    const recordFields = incompleteDevAgentRecordFields(body);
    if (recordFields[0] === "Dev Agent Record") {
      violation(
        story.key,
        "missing-dev-agent-record",
        `marked "${story.rawStatus}" but ${file.name} has no "Dev Agent Record" and no ` +
          `"Completion Notes" section. Nothing records what was actually built.`,
      );
    } else if (recordFields.length > 0) {
      violation(
        story.key,
        "incomplete-dev-agent-record",
        `marked "${story.rawStatus}" but ${file.name}'s Dev Agent Record is missing: ` +
          `${recordFields.join(", ")}.`,
      );
    }
  }

  // --- output -------------------------------------------------------------
  const epicCount = new Set(sprintStories.map((s) => s.epic)).size;
  console.log("CA-24-02 story status guard");
  console.log(
    `  sprint-status.yaml : ${sprintStories.length} stories across ${epicCount} epic block(s)`,
  );
  console.log(`  story files matched: ${checkedFiles.size}`);
  console.log(`  marked done        : ${doneStories.length}`);
  console.log("");

  if (notes.length > 0) {
    console.log(`Notes (${notes.length}) - reported, not counted as violations:`);
    for (const n of notes) {
      console.log(`  [${n.key}] ${n.check}`);
      console.log(`      ${n.detail}`);
    }
    console.log("");
  }

  if (violations.length === 0) {
    console.log(
      "PASS - no story declares a status its own file does not support.",
    );
    process.exit(0);
  }

  console.error(`FAIL - ${violations.length} status/evidence violation(s):`);
  console.error("");
  for (const v of violations) {
    console.error(`  [${v.key}] ${v.check}`);
    console.error(`      ${v.detail}`);
  }
  console.error("");
  console.error(
    "A story is done when its evidence says so, not when its status line does. " +
      "Either produce the missing evidence or move the status back.",
  );
  process.exit(1);
}

main();
