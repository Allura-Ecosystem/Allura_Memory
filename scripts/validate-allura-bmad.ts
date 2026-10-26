#!/usr/bin/env bun
/**
 * Repository-local acceptance gate for the AI Guidelines -> Allura BMAD
 * workflow-authority migration. This validates the integration contract and
 * repository-local overrides; it neither installs nor invokes BMAD.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const failures: string[] = [];
let assertions = 0;

function check(condition: boolean, message: string): void {
  assertions += 1;
  if (!condition) failures.push(message);
}

function text(path: string): string {
  const absolute = join(root, path);
  check(existsSync(absolute), `missing required file: ${path}`);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

const contractPath = "guidelines/ALLURA-BMAD.md";
const archivePath = "docs/archive/ai-guidelines-legacy/AI-GUIDELINES.md";
const provenancePath = "docs/archive/ai-guidelines-legacy/README.md";
const legacySha256 = "0f2a0a55528c34e3cd1d1cdb49cda8fec2a48f0e67b08aab9531c641b3343f0b";

const contract = text(contractPath);
const requiredContractLanguage = [
  "BMAD owns methodology",
  "Allura governance boundaries persist",
  "Operational routing is owner-approved",
  "Allura owns work status",
  "Notion holds planning documents",
  "Allura Brain owns continuity",
  "No local sprint-status file",
  "AI-assisted",
  "independent review",
  "Registered repository-local installation: BMAD 6.12.4",
  "Owner-approved sparse workflow overrides are installed",
  "no native Allura BMAD tracking adapter",
  "_bmad/custom/<skill-id>.toml",
  "guidelines/ALLURA-BMAD.md",
];
for (const phrase of requiredContractLanguage) {
  check(contract.includes(phrase), `contract missing required language: ${phrase}`);
}

const canonicalDocs = [
  "BLUEPRINT.md",
  "SOLUTION-ARCHITECTURE.md",
  "DESIGN-ALLURA.md",
  "REQUIREMENTS-MATRIX.md",
  "RISKS-AND-DECISIONS.md",
  "DATA-DICTIONARY.md",
];
for (const filename of canonicalDocs) {
  check(
    contract.includes(`docs/allura/${filename}`),
    `contract does not name canonical document: ${filename}`,
  );
  check(existsSync(join(root, "docs/allura", filename)), `canonical document missing: ${filename}`);
}

const customizedSkills = [
  "bmad-product-brief",
  "bmad-prd",
  "bmad-architecture",
  "bmad-create-epics-and-stories",
  "bmad-build",
  "bmad-code-review",
  "bmad-review",
  "bmad-sprint-planning",
  "bmad-project-context",
];
for (const skill of customizedSkills) {
  const override = text(`_bmad/custom/${skill}.toml`);
  for (const filename of canonicalDocs) {
    check(
      override.includes(`file:{project-root}/docs/allura/${filename}`),
      `${skill} override does not load canonical document: ${filename}`,
    );
  }
  check(
    override.includes("file:{project-root}/guidelines/ALLURA-BMAD.md"),
    `${skill} override does not load the active Allura BMAD contract`,
  );
  check(
    override.includes("file:{project-root}/.agents/TEAM-RAM-RUNTIME.md"),
    `${skill} override does not load the Team RAM runtime contract`,
  );
  check(
    override.includes("Allura owns work status") &&
      override.includes("Notion holds planning documents") &&
      override.includes("Allura Brain provides governed continuity"),
    `${skill} override does not preserve the approved authority split`,
  );
  check(
    override.includes("no native Allura work-status adapter"),
    `${skill} override does not disclose the missing native Allura status adapter`,
  );
  check(
    override.includes("group_id=allura-system") && override.includes("decisions, blockers, and outcomes"),
    `${skill} override does not require scoped Brain retrieval`,
  );
  check(
    override.includes("governed Allura Brain episodic outcome write") &&
      override.includes("outcome persistence is unconfirmed"),
    `${skill} override does not require honest governed outcome persistence`,
  );
}
check(
  !contract.includes("docs/allura/SPRINT-STATUS"),
  "contract creates a forbidden local sprint-status authority",
);

check(existsSync(join(root, archivePath)), `legacy archive missing: ${archivePath}`);
if (existsSync(join(root, archivePath))) {
  check(
    sha256(archivePath) === legacySha256,
    `legacy archive hash changed: expected ${legacySha256}, got ${sha256(archivePath)}`,
  );
}
const provenance = text(provenancePath);
check(provenance.includes(legacySha256), "archive provenance does not record the preserved SHA-256");
check(
  provenance.includes("11a0daa984816befa51613be288e2e80cbc4d9a3"),
  "archive provenance does not record the source commit",
);
check(provenance.includes("superseded"), "archive provenance does not state superseded authority");

const compatibilityPointers = [
  "guidelines/AI-GUIDELINES.md",
  ".opencode/AI-GUIDELINES.md",
  ".opencode/guidelines/AI-GUIDELINES.md",
  ".opencode/rules/AI-GUIDELINES.md",
  ".opencode/context/development/principles/AI-GUIDELINES.md",
  ".claude/rules/AI-GUIDELINES.md",
];
for (const path of compatibilityPointers) {
  const pointer = text(path);
  check(pointer.includes("ALLURA-BMAD.md"), `compatibility pointer does not route to the contract: ${path}`);
  check(pointer.includes("not an authority"), `compatibility pointer does not disclaim authority: ${path}`);
  check(Buffer.byteLength(pointer) <= 1200, `stale policy copy remains oversized: ${path}`);
}

const storySkills = [
  ".opencode/skills/allura-dev-story/SKILL.md",
  ".claude/skills/allura-dev-story/SKILL.md",
];
for (const path of storySkills) {
  const skill = text(path);
  check(
    !skill.includes("Continue with local sprint-status artifacts only") &&
      !skill.includes("Continue with local sprint status"),
    `disconnected-mode local status authority remains in ${path}`,
  );
  check(
    skill.includes("Allura status capability unavailable"),
    `Allura status-unavailability instruction missing from ${path}`,
  );
  check(
    !skill.includes("pending Notion update") && !skill.includes("Check Notion board for story status"),
    `stale Notion status-authority instruction remains in ${path}`,
  );
  check(
    skill.includes("Continue bounded independent work"),
    `bounded independent-work permission was lost from ${path}`,
  );
}

const requiredActiveSurfaces = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  ".github/copilot-instructions.md",
  ".opencode/DEVELOPMENT-READINESS.md",
  ".opencode/agent/core/brooks.md",
  ".claude/agents/brooks.md",
  ".codex/agents/brooks.toml",
  ".opencode/contracts/harness-v1.md",
  ".claude/contracts/harness-v1.md",
  ".opencode/skills/allura-memory-skill/SKILL.md",
  "docs/allura/BLUEPRINT.md",
  "docs/allura/REQUIREMENTS-MATRIX.md",
  "docs/allura/RISKS-AND-DECISIONS.md",
  "scripts/check-team-ram-runtime.ts",
  "scripts/sync.sh",
];
let activeContractReferences = 0;
for (const path of requiredActiveSurfaces) {
  const content = text(path);
  if (content.includes("ALLURA-BMAD.md")) activeContractReferences += 1;
  check(content.includes("ALLURA-BMAD.md"), `active surface does not reference the Allura BMAD contract: ${path}`);
}
check(
  activeContractReferences === requiredActiveSurfaces.length,
  `expected ${requiredActiveSurfaces.length} active contract references, found ${activeContractReferences}`,
);

const scanExtensions = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".sh", ".yml", ".yaml", ".json", ".toml"]);
const skippedPrefixes = [
  ".git/",
  ".next/",
  "node_modules/",
  "artifacts/",
  "docs/archive/",
  "docs/reference/development-readiness-",
  ".opencode/work-items/",
];
const allowedLegacyContent = new Set([
  ...compatibilityPointers,
  contractPath,
  "scripts/validate-allura-bmad.ts",
]);
const staleActiveReferences: string[] = [];

function walk(directory: string): void {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (skippedPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))) continue;
    if (!existsSync(absolute)) continue;
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      walk(absolute);
      continue;
    }
    const extension = path.slice(path.lastIndexOf("."));
    if (!scanExtensions.has(extension) || allowedLegacyContent.has(path)) continue;
    const content = readFileSync(absolute, "utf8");
    if (content.includes("AI-GUIDELINES.md")) staleActiveReferences.push(path);
  }
}
walk(root);
check(
  staleActiveReferences.length === 0,
  `stale active AI-GUIDELINES.md references remain: ${staleActiveReferences.join(", ")}`,
);

check(assertions >= 60, `validator executed too few assertions: ${assertions}`);

if (failures.length > 0) {
  console.error(`Allura BMAD migration validation FAILED (${failures.length}/${assertions} checks):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Allura BMAD migration validation passed (${assertions} checks).`);
console.log(`Legacy archive SHA-256: ${legacySha256}`);
console.log(`Active contract references checked: ${activeContractReferences}`);
