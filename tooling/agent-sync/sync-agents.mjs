#!/usr/bin/env node
/**
 * Agent sync for allura-memory — ported from allura-team-ram, adapted to this
 * repo's mirror contract.
 *
 * SOURCE OF TRUTH:  .opencode/agent/** /<name>.md   (author here — full body)
 * GENERATED PART OF MIRROR:  .claude/agents/<name>.md
 *   - BODY  = source body + Claude Bridge trailer   (regenerated, never hand-edit)
 *   - MODEL = tier's claude alias                   (set from models.map.json)
 *   - all OTHER mirror frontmatter (tools, skills, mode, ...) is runtime-owned
 *     and preserved verbatim — Claude Code needs fields opencode doesn't.
 *
 * The .opencode source's `model:` is also aligned to the tier's opencode model.
 * bahari is excluded (canon: plugins/allura-agents/agents/bahari.md).
 *
 * Usage:
 *   node sync-agents.mjs            # dry run — report, write nothing
 *   node sync-agents.mjs --apply    # write source models + mirrors
 *   node sync-agents.mjs --check    # CI gate: exit 1 on drift, no writes
 *
 * Zero dependencies (Node >= 18, ESM).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const MAP = JSON.parse(readFileSync(join(__dirname, "models.map.json"), "utf8"));

const APPLY = process.argv.includes("--apply");
const CI = process.argv.includes("--check");

const BRIDGE = (srcRel) =>
  `## Claude Bridge\n\nThis agent is mirrored from ${srcRel}. Use the listed skills at startup when the task matches this agent. For Allura project work, follow .agents/TEAM-RAM-RUNTIME.md: Scout hydrates context and Allura Brain before build or status answers, then outcomes are logged to Allura Brain.\n`;

let drift = 0;
const log = (...a) => console.log(...a);

function split(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("no frontmatter");
  return { fm: m[1], body: m[2] };
}
const fmSet = (fm, k, v) =>
  new RegExp(`^${k}:`, "m").test(fm)
    ? fm.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${v}`)
    : `${fm}\n${k}: ${v}`;

function writeOrCheck(path, next, label) {
  const cur = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (cur === next) { log(`  ✓ ${label}`); return; }
  drift++;
  if (!APPLY) { log(`  ${CI ? "✗ DRIFT" : "~ would write"}: ${label}`); return; }
  writeFileSync(path, next);
  log(`  → wrote ${label}`);
}

log(`agent-sync (allura-memory): ${Object.keys(MAP.agents).length} agents\n`);

for (const [name, spec] of Object.entries(MAP.agents)) {
  const tier = MAP.tiers[spec.tier];
  if (!tier) { log(`! ${name}: unknown tier "${spec.tier}" — skipping`); continue; }
  const srcPath = join(ROOT, spec.source);
  const mirPath = join(ROOT, ".claude", "agents", `${name}.md`);
  if (!existsSync(srcPath)) { log(`! ${name}: missing source ${spec.source}`); drift++; continue; }
  if (!existsSync(mirPath)) { log(`! ${name}: missing mirror .claude/agents/${name}.md — create its runtime frontmatter by hand once`); drift++; continue; }
  log(`• ${name} [${spec.tier}]`);

  // 1) SOURCE — align model to tier (rest of source frontmatter untouched).
  const src = split(readFileSync(srcPath, "utf8"));
  const srcFm = fmSet(src.fm, "model", tier.opencode);
  writeOrCheck(srcPath, `---\n${srcFm}\n---\n${src.body}`, spec.source);

  // 2) MIRROR — keep runtime frontmatter, set model, regenerate body + bridge.
  const mir = split(readFileSync(mirPath, "utf8"));
  const mirFm = fmSet(mir.fm, "model", tier.claude);
  const body = src.body.replace(/\s*$/, "\n");
  writeOrCheck(mirPath, `---\n${mirFm}\n---\n${body}\n${BRIDGE(spec.source)}`, `.claude/agents/${name}.md`);
}

const verb = APPLY ? "updated" : (CI ? "out of sync" : "would change");
log(`\n${drift === 0 ? "✓ opencode and claude in sync" : `${drift} file(s) ${verb}`}`);
if (!APPLY && !CI) log("Dry run — re-run with --apply to write.");
process.exit(CI && drift > 0 ? 1 : 0);
