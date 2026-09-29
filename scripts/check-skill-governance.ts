#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GovernanceReport {
  repoRoot: string;
  skillCountOnDisk: number;
  skillsWithSkillMd: number;
  ownedSkills: string[];
  orphanSkills: string[];
  deadSkills: string[];
  utilitySkills: string[];
  routedSkills: string[];
  missingOwnedSkills: string[];
  missingAgentRoutes: string[];
  triggerOverlapHotspots: string[];
  skillLocations: Record<string, string[]>;
  status: "clean" | "drifted";
}

interface CliOptions {
  repoRoot?: string;
  strict?: boolean;
}

// Discriminating trigger words — only words that meaningfully differentiate skill intent.
// Generic words like "design", "review", "ui", "page", "component" removed because they
// appear in nearly every skill description and produce false-positive overlap hotspots.
// Infrastructure words like "mcp", "docker", "deployment" removed because they appear in
// every skill that touches MCP tools (which is most of them).
const SIGNATURE_WORDS = new Set([
  "prototype",
  "mockup",
  "audit",
  "polish",
  "harden",
  "animation",
  "figma",
  "ruvector",
  "postgres",
  "oauth",
  "refactor",
  "debugging",
  "embedding",
  "promotion",
  "brainstorm",
  "varlock",
  "shadcn",
]);

const STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "when",
  "you",
  "need",
  "need",
  "use",
  "this",
  "that",
  "into",
  "from",
  "your",
  "what",
  "how",
  "about",
  "are",
  "can",
  "will",
  "build",
  "create",
  "make",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "be",
  "or",
  "if",
  "then",
  "not",
  "all",
  "any",
  "page",
]);

// Utility skills are universal or dynamically routed — they don't need a dedicated
// agent route. Routed skills require a specific agent to own them.
const UTILITY_SKILLS = new Set([
  // Core infrastructure
  "allura-memory-skill",
  "allura-memory-core",
  "mcp-docker",
  "mcp-harness",
  "mcp-docker-ops",
  "multi-search",
  "context7",
  "code-review",
  "varlock",
  "bun-security",
  "systematic-debugging-memory",
  "quick-update",
  "readme-memory",
  "security-bluebook-builder",
  "task-creator",
  "task-management",
  "skill-creator",
  "github",
  "agent-browser",
  "harness",
  "perplexica-mcp",
  "perplexica-search",
  "secret-scanning",
  // VS Code Copilot extensions (auto-routed by VS Code)
  "suggest-awesome-github-copilot-agents",
  "suggest-awesome-github-copilot-instructions",
  "suggest-awesome-github-copilot-skills",
  "copilot-sdk",
  "salesforce-apex-quality",
  "salesforce-component-standards",
  "salesforce-flow-design",
  "spark-app-template",
  "workiq",
  "get-search-view-results",
  "agent-customization",
  // External engines (routed by allura-design membrane)
  "huashu-design",
  "shadcn",
  // Menu / navigation
  "allura-menu",
  // Party mode (routed by Brooks command)
  "party-mode",
  "roundtable",
  // Plugin creation (routed dynamically)
  "plugin-creator",
]);

function isUtilitySkill(skillName: string): boolean {
  return UTILITY_SKILLS.has(skillName);
}

function normalizeSkillName(name: string): string {
  return name.trim().replace(/^\*\*|\*\*$/g, "").replace(/`/g, "");
}

function readText(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf-8");
}

function parseOwnershipSkills(ownershipPath: string): string[] {
  const content = readText(ownershipPath);
  const skills = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes("---") || trimmed.includes("Skill |")) {
      continue;
    }

    const columns = trimmed
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (columns.length === 0) {
      continue;
    }

    const skillName = normalizeSkillName(columns[0]);
    if (skillName && skillName.toLowerCase() !== "skill") {
      skills.add(skillName);
    }
  }

  return [...skills].sort((a, b) => a.localeCompare(b));
}

function listSkillDirectories(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Collect skill names from all harness directories (opencode, claude, agents). */
function listAllSkillDirectories(repoRoot: string): string[] {
  const harnessDirs = [
    join(repoRoot, ".opencode", "skills"),
    join(repoRoot, ".claude", "skills"),
    join(repoRoot, ".agents", "skills"),
  ];
  const allSkills = new Set<string>();
  for (const dir of harnessDirs) {
    for (const skill of listSkillDirectories(dir)) {
      allSkills.add(skill);
    }
  }
  return [...allSkills].sort((a, b) => a.localeCompare(b));
}

/** Find which harness directories contain a given skill. */
function findSkillLocations(skillName: string, repoRoot: string): string[] {
  const locations: string[] = [];
  const harnessDirs = [
    { name: "opencode", path: join(repoRoot, ".opencode", "skills", skillName) },
    { name: "claude", path: join(repoRoot, ".claude", "skills", skillName) },
    { name: "agents", path: join(repoRoot, ".agents", "skills", skillName) },
  ];
  for (const { name, path } of harnessDirs) {
    if (existsSync(path)) {
      locations.push(name);
    }
  }
  return locations;
}

function listAgentFiles(agentDir: string): string[] {
  if (!existsSync(agentDir)) {
    return [];
  }

  return readdirSync(agentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(agentDir, entry.name));
}

function listCommandFiles(commandDir: string): string[] {
  if (!existsSync(commandDir)) {
    return [];
  }

  return readdirSync(commandDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(commandDir, entry.name));
}

function getAllHarnessReferences(repoRoot: string): string {
  const refs: string[] = [];

  // Scan all harness directories for agent files, command files, and skill SKILL.md
  const harnessRoots = [
    join(repoRoot, ".opencode"),
    join(repoRoot, ".claude"),
    join(repoRoot, ".agents"),
  ];

  for (const harnessRoot of harnessRoots) {
    if (!existsSync(harnessRoot)) continue;

    const agentFiles = listAgentFiles(join(harnessRoot, "agent"));
    const commandFiles = listCommandFiles(join(harnessRoot, "command"));
    const skillRoot = join(harnessRoot, "skills");
    const skillDirs = existsSync(skillRoot) ? readdirSync(skillRoot, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];

    for (const file of [...agentFiles, ...commandFiles]) {
      refs.push(readText(file).toLowerCase());
    }

    for (const dir of skillDirs) {
      const skillMd = join(skillRoot, dir.name, "SKILL.md");
      if (existsSync(skillMd)) {
        refs.push(readText(skillMd).toLowerCase());
      }
    }
  }

  return refs.join("\n");
}

function getAllHarnessReferencesExcludingSkills(repoRoot: string, excludeSkills: string[]): string {
  const refs: string[] = [];

  const harnessRoots = [
    join(repoRoot, ".opencode"),
    join(repoRoot, ".claude"),
    join(repoRoot, ".agents"),
  ];

  for (const harnessRoot of harnessRoots) {
    if (!existsSync(harnessRoot)) continue;

    const agentFiles = listAgentFiles(join(harnessRoot, "agent"));
    const commandFiles = listCommandFiles(join(harnessRoot, "command"));

    for (const file of [...agentFiles, ...commandFiles]) {
      refs.push(readText(file).toLowerCase());
    }

    const skillRoot = join(harnessRoot, "skills");
    const skillDirs = existsSync(skillRoot) ? readdirSync(skillRoot, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];

    for (const dir of skillDirs) {
      if (excludeSkills.includes(dir.name)) continue;
      const skillMd = join(skillRoot, dir.name, "SKILL.md");
      if (existsSync(skillMd)) {
        refs.push(readText(skillMd).toLowerCase());
      }
    }
  }

  return refs.join("\n");
}

function detectDeadSkills(orphanSkills: string[], repoRoot: string): string[] {
  const allRefs = getAllHarnessReferencesExcludingSkills(repoRoot, orphanSkills);
  return orphanSkills.filter((skill) => !allRefs.includes(skill.toLowerCase()));
}

function extractSignatureWords(content: string): Set<string> {
  const words = new Set<string>();
  const tokens = content.toLowerCase().match(/[a-z][a-z-]+/g) ?? [];

  for (const token of tokens) {
    const normalized = token.replace(/-/g, "");
    if (STOPWORDS.has(normalized)) {
      continue;
    }
    if (SIGNATURE_WORDS.has(normalized)) {
      words.add(normalized);
    }
  }

  return words;
}

function getSkillSignatureWords(skillPath: string): Set<string> {
  return extractSignatureWords(readText(skillPath));
}

// Overlap threshold: require 2+ discriminating signature words to flag a hotspot.
// Single-word overlaps are almost always false positives (e.g., both skills mention
// "audit" but for completely different purposes).
const OVERLAP_THRESHOLD = 2;

function detectOverlapHotspots(skillRoot: string, skillNames: string[]): string[] {
  const signatures = new Map<string, Set<string>>();
  for (const skillName of skillNames) {
    signatures.set(skillName, getSkillSignatureWords(join(skillRoot, skillName, "SKILL.md")));
  }

  const hotspots = new Set<string>();
  for (let i = 0; i < skillNames.length; i += 1) {
    for (let j = i + 1; j < skillNames.length; j += 1) {
      const left = skillNames[i];
      const right = skillNames[j];
      const leftWords = signatures.get(left) ?? new Set();
      const rightWords = signatures.get(right) ?? new Set();
      const overlap = [...leftWords].filter((word) => rightWords.has(word));

      if (overlap.length >= OVERLAP_THRESHOLD) {
        hotspots.add(`${left} ↔ ${right} [${overlap.join(", ")}]`);
      }
    }
  }

  return [...hotspots].sort((a, b) => a.localeCompare(b));
}

function printReport(report: GovernanceReport): void {
  console.log("═".repeat(72));
  console.log(`Skill Governance Report — ${report.status.toUpperCase()}`);
  console.log("═".repeat(72));
  console.log(`Repo root: ${report.repoRoot}`);
  console.log(`Skills on disk: ${report.skillCountOnDisk}`);
  console.log(`Skills with SKILL.md: ${report.skillsWithSkillMd}`);
  console.log(`Owned skills: ${report.ownedSkills.length}`);
  console.log(`Orphan skills: ${report.orphanSkills.length}`);
  console.log(`  └─ Dead (zero refs): ${report.deadSkills.length}`);
  console.log(`  └─ Live orphans: ${report.orphanSkills.length - report.deadSkills.length}`);
  console.log(`Utility skills: ${report.utilitySkills.length}`);
  console.log(`Routed skills: ${report.routedSkills.length}`);
  console.log(`Missing owned skills: ${report.missingOwnedSkills.length}`);
  console.log(`Missing agent routes: ${report.missingAgentRoutes.length}`);
  console.log(`Overlap hotspots: ${report.triggerOverlapHotspots.length}`);

  if (Object.keys(report.skillLocations).length > 0) {
    console.log("\nSkill locations (harness directories):");
    for (const [skill, locations] of Object.entries(report.skillLocations).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`- ${skill}: ${locations.join(", ")}`);
    }
  }

  if (report.orphanSkills.length > 0) {
    console.log("\nOrphan skills:");
    for (const skill of report.orphanSkills) {
      const deadMarker = report.deadSkills.includes(skill) ? " [DEAD]" : "";
      console.log(`- ${skill}${deadMarker}`);
    }
  }

  if (report.missingOwnedSkills.length > 0) {
    console.log("\nMissing owned skills:");
    for (const skill of report.missingOwnedSkills) {
      console.log(`- ${skill}`);
    }
  }

  if (report.missingAgentRoutes.length > 0) {
    console.log("\nMissing agent routes (routed skills only):");
    for (const skill of report.missingAgentRoutes) {
      console.log(`- ${skill}`);
    }
  }

  if (report.triggerOverlapHotspots.length > 0) {
    console.log("\nTrigger overlap hotspots:");
    for (const hotspot of report.triggerOverlapHotspots) {
      console.log(`- ${hotspot}`);
    }
  }

  console.log("\nJSON summary:");
  console.log(JSON.stringify(report, null, 2));
  console.log("═".repeat(72));
}

export async function analyzeSkillGovernance(options: CliOptions = {}): Promise<GovernanceReport> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const opencodeRoot = join(repoRoot, ".opencode");
  const ownershipPath = join(opencodeRoot, "SKILL-OWNERSHIP.md");

  const ownedSkills = parseOwnershipSkills(ownershipPath);
  // Scan all harness directories for a complete skill inventory
  const skillDirectories = listAllSkillDirectories(repoRoot);
  const skillCountOnDisk = skillDirectories.length;

  // Count skills with SKILL.md across all harness directories
  const harnessSkillDirs = [
    join(repoRoot, ".opencode", "skills"),
    join(repoRoot, ".claude", "skills"),
    join(repoRoot, ".agents", "skills"),
  ];
  const skillsWithSkillMd = skillDirectories.filter((skill) => {
    return harnessSkillDirs.some((dir) => existsSync(join(dir, skill, "SKILL.md")));
  }).length;

  const orphanSkills = skillDirectories.filter((skill) => !ownedSkills.includes(skill));
  const missingOwnedSkills = ownedSkills.filter((skill) => !skillDirectories.includes(skill));

  const deadSkills = detectDeadSkills(orphanSkills, repoRoot);
  const utilitySkills = skillDirectories.filter((skill) => isUtilitySkill(skill));
  const routedSkills = skillDirectories.filter((skill) => !isUtilitySkill(skill));

  // Scan agent files across all harness directories for route references
  // Also check SKILL-OWNERSHIP.md — if a skill is owned in the matrix, it's routed
  const allAgentContent: string[] = [];
  for (const harnessRoot of [join(repoRoot, ".opencode"), join(repoRoot, ".claude"), join(repoRoot, ".agents")]) {
    if (!existsSync(harnessRoot)) continue;
    const agentFiles = listAgentFiles(join(harnessRoot, "agent"));
    for (const file of agentFiles) {
      allAgentContent.push(readText(file).toLowerCase());
    }
  }
  const agentContent = allAgentContent.join("\n");
  const ownershipContent = readText(ownershipPath).toLowerCase();
  const missingAgentRoutes = ownedSkills
    .filter((skill) => !isUtilitySkill(skill))
    .filter((skill) => {
      const skillLower = skill.toLowerCase();
      // A skill is considered routed if it appears in either agent files or the ownership matrix
      return !agentContent.includes(skillLower) && !ownershipContent.includes(skillLower);
    });

  // Use .opencode/skills as the primary skill root for overlap detection
  // (it's the canonical harness; other harnesses may have duplicates)
  const primarySkillRoot = join(opencodeRoot, "skills");
  const triggerOverlapHotspots = detectOverlapHotspots(primarySkillRoot, skillDirectories.filter((s) => existsSync(join(primarySkillRoot, s, "SKILL.md"))));

  // Build skill location map (which harness directories each skill lives in)
  const skillLocations: Record<string, string[]> = {};
  for (const skill of skillDirectories) {
    skillLocations[skill] = findSkillLocations(skill, repoRoot);
  }

  const status: GovernanceReport["status"] =
    orphanSkills.length === 0 && missingOwnedSkills.length === 0 && missingAgentRoutes.length === 0 && triggerOverlapHotspots.length === 0
      ? "clean"
      : "drifted";

  return {
    repoRoot,
    skillCountOnDisk,
    skillsWithSkillMd,
    ownedSkills,
    orphanSkills,
    deadSkills,
    utilitySkills,
    routedSkills,
    missingOwnedSkills,
    missingAgentRoutes,
    triggerOverlapHotspots,
    skillLocations,
    status,
  };
}

export async function runSkillGovernanceCli(argv: string[] = process.argv.slice(2)): Promise<GovernanceReport> {
  const repoFlagIndex = argv.indexOf("--repo");
  const strict = argv.includes("--strict");
  const repoRoot = repoFlagIndex >= 0 ? argv[repoFlagIndex + 1] : undefined;

  const report = await analyzeSkillGovernance({ repoRoot, strict });
  printReport(report);

  if (strict && report.status === "drifted") {
    throw new Error("Skill governance drift detected in strict mode");
  }

  return report;
}

if (import.meta.main) {
  runSkillGovernanceCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
