#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalRoot = join(repoRoot, ".opencode", "skills");
const adapterRoots = [
  join(repoRoot, ".claude", "skills"),
  join(repoRoot, ".agents", "skills"),
];
const allowedFrontmatter = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function rel(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${rel(path)} is not valid JSON: ${String(error)}`);
    return {};
  }
}

function listEntries(path: string): string[] {
  if (!existsSync(path)) {
    fail(`missing directory: ${rel(path)}`);
    return [];
  }
  return readdirSync(path).sort((a, b) => a.localeCompare(b));
}

function findSkillFiles(path: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSkillFiles(child));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(child);
    }
  }
  return found;
}

const canonicalNames = listEntries(canonicalRoot).filter((name) => {
  const skillPath = join(canonicalRoot, name);
  const stat = lstatSync(skillPath);
  if (stat.isSymbolicLink()) {
    fail(`canonical skill must not be a symlink: ${rel(skillPath)}`);
    return false;
  }
  if (!stat.isDirectory()) {
    fail(`unexpected file in canonical skill root: ${rel(skillPath)}`);
    return false;
  }
  return true;
});

const canonicalSet = new Set(canonicalNames);
const trackedSkillFiles = new Set(
  execFileSync("git", ["ls-files", "--", ".opencode/skills/*/SKILL.md"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean),
);
const trackedAdapterPaths = new Set(
  execFileSync("git", ["ls-files", "--", ".claude/skills/*", ".agents/skills/*"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean),
);

for (const name of canonicalNames) {
  const skillDir = join(canonicalRoot, name);
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) {
    fail(`canonical skill is missing SKILL.md: ${rel(skillDir)}`);
    continue;
  }
  if (!trackedSkillFiles.has(rel(skillFile))) {
    fail(`active canonical skill is not tracked by git: ${rel(skillFile)}`);
  }

  const source = readFileSync(skillFile, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    fail(`missing or malformed YAML frontmatter: ${rel(skillFile)}`);
    continue;
  }

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = YAML.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("frontmatter must be an object");
    }
    frontmatter = parsed as Record<string, unknown>;
  } catch (error) {
    fail(`invalid YAML frontmatter in ${rel(skillFile)}: ${String(error)}`);
    continue;
  }

  if (frontmatter.name !== name) {
    fail(`${rel(skillFile)} name must equal directory id '${name}'`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    fail(`invalid canonical skill id: ${name}`);
  }
  if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
    fail(`${rel(skillFile)} requires a non-empty string description`);
  }
  for (const key of Object.keys(frontmatter)) {
    if (!allowedFrontmatter.has(key)) {
      fail(`${rel(skillFile)} uses non-portable frontmatter key '${key}'`);
    }
  }
  if (/\[TODO:[^\]]*\]/.test(source)) {
    fail(`${rel(skillFile)} contains an unfinished TODO scaffold`);
  }
}

for (const skillFile of findSkillFiles(canonicalRoot)) {
  const skillDirectory = dirname(skillFile);
  if (dirname(skillDirectory) !== canonicalRoot) {
    fail(`nested skill entrypoint is not allowed: ${rel(skillFile)}`);
  }
}

for (const adapterRoot of adapterRoots) {
  const adapterNames = listEntries(adapterRoot);
  const missing = canonicalNames.filter((name) => !adapterNames.includes(name));
  const extra = adapterNames.filter((name) => !canonicalSet.has(name));
  for (const name of missing) fail(`${rel(adapterRoot)} is missing adapter '${name}'`);
  for (const name of extra) fail(`${rel(adapterRoot)} contains non-canonical adapter '${name}'`);

  for (const name of adapterNames.filter((candidate) => canonicalSet.has(candidate))) {
    const adapterPath = join(adapterRoot, name);
    if (!lstatSync(adapterPath).isSymbolicLink()) {
      fail(`${rel(adapterPath)} must be a symlink adapter`);
      continue;
    }
    if (!trackedAdapterPaths.has(rel(adapterPath))) {
      fail(`${rel(adapterPath)} must be tracked by git`);
    }
    const expected = realpathSync(join(canonicalRoot, name));
    let actual: string;
    try {
      actual = realpathSync(adapterPath);
    } catch {
      fail(`${rel(adapterPath)} is a broken symlink adapter`);
      continue;
    }
    if (actual !== expected) {
      fail(`${rel(adapterPath)} points outside the canonical Team RAM catalog`);
    }
  }
}

const opencode = readJson(join(repoRoot, "opencode.json")) as {
  skills?: { paths?: unknown; urls?: unknown };
};
if (
  !opencode.skills ||
  !Array.isArray(opencode.skills.paths) ||
  opencode.skills.paths.length !== 1 ||
  opencode.skills.paths[0] !== ".opencode/skills" ||
  opencode.skills.urls !== undefined
) {
  fail("opencode.json must set skills.paths to only ['.opencode/skills']");
}
const launcher = join(repoRoot, "scripts", "team-ram-opencode.sh");
if (
  !existsSync(launcher) ||
  !readFileSync(launcher, "utf8").includes("OPENCODE_PURE=1") ||
  !readFileSync(launcher, "utf8").includes("OPENCODE_DISABLE_EXTERNAL_SKILLS=1")
) {
  fail("Team RAM OpenCode launcher must isolate plugin and external skill injection");
}
if (existsSync(join(repoRoot, ".opencode", "config.json"))) {
  fail("remove inert .opencode/config.json; root opencode.json is the only runtime config");
}

const claudeManifest = readJson(join(repoRoot, ".claude", "manifest.json")) as {
  authority?: unknown;
  skill_catalog?: unknown;
  adapter_root?: unknown;
};
if (
  claudeManifest.authority !== ".opencode/manifest.json" ||
  claudeManifest.skill_catalog !== ".opencode/skills" ||
  claudeManifest.adapter_root !== ".claude/skills"
) {
  fail(".claude/manifest.json must declare the canonical Team RAM adapter contract");
}

const agentSkills = readJson(join(repoRoot, ".opencode", "config", "agent-skills.json")) as {
  skills?: Record<string, unknown>;
};
for (const [agent, value] of Object.entries(agentSkills.skills ?? {})) {
  if (!Array.isArray(value)) {
    fail(`agent-skills.json entry '${agent}' must be an array`);
    continue;
  }
  for (const skill of value) {
    if (typeof skill !== "string" || !canonicalSet.has(skill)) {
      fail(`agent-skills.json '${agent}' references missing skill '${String(skill)}'`);
    }
  }
}

const agentMetadata = readJson(join(repoRoot, ".opencode", "config", "agent-metadata.json")) as {
  agents?: Record<string, { dependencies?: unknown }>;
};
for (const [agent, metadata] of Object.entries(agentMetadata.agents ?? {})) {
  if (!Array.isArray(metadata.dependencies)) continue;
  for (const dependency of metadata.dependencies) {
    if (typeof dependency !== "string" || !dependency.startsWith("skill:")) continue;
    const skill = dependency.slice("skill:".length);
    if (!canonicalSet.has(skill)) {
      fail(`agent-metadata.json '${agent}' references missing skill '${skill}'`);
    }
  }
}

const manifest = readJson(join(repoRoot, ".opencode", "manifest.json")) as {
  core?: unknown;
  overlay?: unknown;
  runtime?: unknown;
};
for (const section of ["core", "overlay", "runtime"] as const) {
  const paths = manifest[section];
  if (!Array.isArray(paths)) {
    fail(`manifest.json '${section}' must be an array`);
    continue;
  }
  for (const manifestPath of paths) {
    if (typeof manifestPath !== "string") {
      fail(`manifest.json '${section}' contains a non-string path`);
      continue;
    }
    if (!existsSync(join(repoRoot, manifestPath))) {
      fail(`manifest.json '${section}' references missing path '${manifestPath}'`);
    }
  }
}

for (const root of [canonicalRoot, ...adapterRoots]) {
  for (const name of listEntries(root)) {
    if (name.startsWith("bmad-")) {
      fail(`BMAD skill remains active: ${rel(join(root, name))}`);
    }
  }
}

if (!canonicalSet.has("ai-guidelines")) {
  fail("canonical ai-guidelines skill is missing");
}
if (!canonicalSet.has("allura-team-ram") || !canonicalSet.has("team-ram-cowork")) {
  fail("Team RAM harness skills are missing");
}

if (failures.length > 0) {
  console.error(`Team RAM skill harness: FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Team RAM skill harness: OK (${canonicalNames.length} canonical skills; ${adapterRoots.length} runtime adapters)`,
);
