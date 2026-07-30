#!/usr/bin/env bun
/**
 * Agent: Scout (Recon & Discovery)
 * Manifest ID: scout
 * CI Route: none (always manual or sub-agent)
 * See: src/lib/agents/agent-manifest.ts
 *
 * Fast repo scanning, file path finding, pattern grep.
 * Routes from manual invocation or sub-agent delegation → Scout (Recon)
 *
 * Sub-commands:
 *   scan [path]     List directory structure, identify key files
 *   grep <pattern>  Search for patterns across the codebase
 *   paths           Find and report key paths (configs, entry points, docs, tests)
 *   risks           Scan for architectural risks (missing files, contradictory patterns, drift)
 *   report          Full Scout Report combining all of the above
 *   <query>         Default: search for query across codebase
 *
 * Gracefully handles missing DB connections (for CI environments)
 * When no DB, does real filesystem work and prints results.
 * When DB available, logs real findings to PostgreSQL and Neo4j.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoutFinding {
  category: string;
  message: string;
  path?: string;
  severity?: "info" | "warn" | "error";
}

interface ScoutReport {
  timestamp: string;
  rootDir: string;
  scan: ScanResult;
  paths: PathsResult;
  risks: RiskResult;
}

interface ScanResult {
  topLevelDirs: string[];
  topLevelFiles: string[];
  keyFiles: Array<{ path: string; role: string }>;
  fileCountByExt: Record<string, number>;
}

interface PathsResult {
  configs: string[];
  entryPoints: string[];
  docs: string[];
  tests: string[];
  scripts: string[];
  schemas: string[];
}

interface RiskResult {
  risks: ScoutFinding[];
  riskCount: number;
}

interface GrepResult {
  pattern: string;
  matches: Array<{ file: string; line: number; content: string }>;
  matchCount: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "scout";

const SUBCOMMANDS = ["scan", "grep", "paths", "risks", "report"] as const;
type SubCommand = (typeof SUBCOMMANDS)[number];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".cache",
  "__pycache__",
  ".tox",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "tsconfig.tsbuildinfo",
]);

const CONFIG_FILENAMES = new Set([
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
  "package.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".eslintrc.cjs",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.mjs",
  ".env",
  ".env.example",
  ".env.local",
  ".sops.yaml",
  ".gitignore",
]);

const TEST_DIR_NAMES = new Set(["__tests__", "test", "tests", "spec"]);
const TEST_FILE_PATTERNS = [".test.", ".spec.", "_test.", "_spec."];

// ── Arg Parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { subCommand: SubCommand | null; args: string[] } {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    return { subCommand: null, args: [] };
  }

  const first = argv[0];
  if (SUBCOMMANDS.includes(first as SubCommand)) {
    return { subCommand: first as SubCommand, args: argv.slice(1) };
  }

  // No known sub-command → treat as default search query
  return { subCommand: null, args: argv };
}

// ── Utility: Walk the directory tree ──────────────────────────────────────────

function walkDir(
  dir: string,
  maxDepth: number = 5,
  currentDepth: number = 0,
): string[] {
  const results: string[] = [];

  if (currentDepth > maxDepth) return results;
  if (IGNORED_DIRS.has(basename(dir))) return results;

  let entries: Array<{ name: string; isDir: boolean }>;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
    }));
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (IGNORED_FILES.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDir) {
      results.push(...walkDir(fullPath, maxDepth, currentDepth + 1));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function isTestFile(filePath: string): boolean {
  const base = basename(filePath);
  return TEST_FILE_PATTERNS.some((p) => base.includes(p));
}

function isConfigFile(filePath: string): boolean {
  return CONFIG_FILENAMES.has(basename(filePath));
}

function isDocFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".md" || ext === ".mdx" || ext === ".rst" || ext === ".txt";
}

function isScriptFile(filePath: string): boolean {
  return filePath.includes("scripts/") && (filePath.endsWith(".ts") || filePath.endsWith(".js") || filePath.endsWith(".sh"));
}

function isSchemaFile(filePath: string): boolean {
  return filePath.includes("schema") || filePath.includes("migration") || filePath.endsWith(".prisma");
}

function isInTestDir(filePath: string): boolean {
  return filePath.split("/").some((segment) => TEST_DIR_NAMES.has(segment));
}

// ── Sub-command: scan ────────────────────────────────────────────────────────

function cmdScan(targetPath?: string): ScanResult {
  const scanDir = targetPath ? join(ROOT_DIR, targetPath) : ROOT_DIR;

  let topEntries: Array<{ name: string; isDir: boolean }>;
  try {
    topEntries = readdirSync(scanDir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
    }));
  } catch {
    console.error(`[scout] Cannot scan directory: ${scanDir}`);
    return { topLevelDirs: [], topLevelFiles: [], keyFiles: [], fileCountByExt: {} };
  }

  const topLevelDirs = topEntries
    .filter((e) => e.isDir && !IGNORED_DIRS.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name);
  const topLevelFiles = topEntries
    .filter((e) => !e.isDir)
    .map((e) => e.name);

  // Walk deeper to find key files and count by extension
  const allFiles = walkDir(scanDir, 6);
  const fileCountByExt: Record<string, number> = {};
  const keyFiles: Array<{ path: string; role: string }> = [];

  for (const fp of allFiles) {
    const ext = extname(fp);
    fileCountByExt[ext] = (fileCountByExt[ext] || 0) + 1;

    const rel = relative(ROOT_DIR, fp);

    if (isConfigFile(fp)) {
      keyFiles.push({ path: rel, role: "config" });
    }

    // Entry points: page.tsx, layout.tsx, route.ts, main entry files
    const base = basename(fp);
    if (base === "page.tsx" || base === "page.ts") {
      keyFiles.push({ path: rel, role: "next-page" });
    } else if (base === "layout.tsx" || base === "layout.ts") {
      keyFiles.push({ path: rel, role: "next-layout" });
    } else if (base === "route.ts" || base === "route.tsx") {
      keyFiles.push({ path: rel, role: "next-route" });
    }
  }

  return { topLevelDirs, topLevelFiles, keyFiles, fileCountByExt };
}

// ── Sub-command: grep ─────────────────────────────────────────────────────────

function cmdGrep(pattern: string): GrepResult {
  const regex = new RegExp(pattern, "i");
  const allFiles = walkDir(ROOT_DIR, 8);
  const matches: Array<{ file: string; line: number; content: string }> = [];

  let checked = 0;
  const MAX_FILES = 500;
  const MAX_MATCHES = 100;

  for (const fp of allFiles) {
    if (checked >= MAX_FILES) break;
    if (matches.length >= MAX_MATCHES) break;

    const ext = extname(fp);
    // Skip binary-like and large files
    if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".lock", ".map"].includes(ext)) {
      continue;
    }

    checked++;

    let content: string;
    try {
      content = readFileSync(fp, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= MAX_MATCHES) break;
      if (regex.test(lines[i])) {
        matches.push({
          file: relative(ROOT_DIR, fp),
          line: i + 1,
          content: lines[i].trim().substring(0, 120),
        });
      }
    }
  }

  return { pattern, matches, matchCount: matches.length };
}

// ── Sub-command: paths ────────────────────────────────────────────────────────

function cmdPaths(): PathsResult {
  const allFiles = walkDir(ROOT_DIR, 8);
  const rels = allFiles.map((fp) => relative(ROOT_DIR, fp));

  const configs: string[] = [];
  const entryPoints: string[] = [];
  const docs: string[] = [];
  const tests: string[] = [];
  const scripts: string[] = [];
  const schemas: string[] = [];

  for (const rel of rels) {
    if (isConfigFile(join(ROOT_DIR, rel))) {
      configs.push(rel);
    }
    if (rel.endsWith("page.tsx") || rel.endsWith("layout.tsx") || rel.endsWith("route.ts")) {
      entryPoints.push(rel);
    }
    if (isDocFile(rel)) {
      docs.push(rel);
    }
    if (isTestFile(rel) || isInTestDir(rel)) {
      tests.push(rel);
    }
    if (isScriptFile(rel)) {
      scripts.push(rel);
    }
    if (isSchemaFile(rel)) {
      schemas.push(rel);
    }
  }

  return { configs, entryPoints, docs, tests, scripts, schemas };
}

// ── Sub-command: risks ────────────────────────────────────────────────────────

function cmdRisks(): RiskResult {
  const risks: ScoutFinding[] = [];

  // 1. Missing critical files
  const criticalFiles = [
    { path: "package.json", label: "Package manifest" },
    { path: "tsconfig.json", label: "TypeScript config" },
    { path: ".gitignore", label: "Git ignore" },
    { path: "README.md", label: "Project readme" },
    { path: "AGENTS.md", label: "Agent operating handbook" },
    { path: ".env.example", label: "Env template" },
    { path: "vitest.config.ts", label: "Test config" },
  ];

  for (const { path, label } of criticalFiles) {
    if (!existsSync(join(ROOT_DIR, path))) {
      risks.push({
        category: "missing-file",
        message: `${label} missing: ${path}`,
        severity: "warn",
      });
    }
  }

  // 2. Check for contradictory patterns — .env files tracked in git
  const envFiles = [".env", ".env.local", ".env.production", ".env.staging"];
  const gitignorePath = join(ROOT_DIR, ".gitignore");
  let gitignoreContent = "";
  try {
    gitignoreContent = readFileSync(gitignorePath, "utf-8");
  } catch {
    // No gitignore — that's already flagged above
  }

  for (const envFile of envFiles) {
    if (existsSync(join(ROOT_DIR, envFile))) {
      const envIgnored = gitignoreContent.includes(envFile) || gitignoreContent.includes(".env*") || gitignoreContent.includes(".env");
      if (!envIgnored) {
        risks.push({
          category: "security",
          message: `${envFile} exists but may not be in .gitignore`,
          path: envFile,
          severity: "error",
        });
      }
    }
  }

  // 3. Architectural drift: check for deprecated patterns
  const deprecatedPatterns = [
    {
      pattern: "roninclaw-",
      message: "Legacy 'roninclaw-*' naming found (use 'allura-*')",
      severity: "warn" as const,
    },
    {
      pattern: "localhost:5432",
      message: "Hardcoded PostgreSQL port (use env var)",
      severity: "warn" as const,
    },
    {
      pattern: "localhost:7687",
      message: "Hardcoded Neo4j port (use env var)",
      severity: "warn" as const,
    },
  ];

  // Only scan source files for drift patterns (not node_modules, already excluded by walkDir)
  const srcFiles = walkDir(join(ROOT_DIR, "src"), 6);
  for (const p of deprecatedPatterns) {
    const regex = new RegExp(p.pattern, "i");
    let found = false;
    for (const fp of srcFiles.slice(0, 200)) {
      if (found) break;
      try {
        const content = readFileSync(fp, "utf-8");
        if (regex.test(content)) {
          risks.push({
            category: "drift",
            message: p.message,
            path: relative(ROOT_DIR, fp),
            severity: p.severity,
          });
          found = true;
        }
      } catch {
        // skip unreadable
      }
    }
  }

  // 4. Test coverage gaps: no tests next to source files
  const srcDir = join(ROOT_DIR, "src");
  const libFiles = walkDir(srcDir, 6).filter(
    (fp) => (fp.endsWith(".ts") || fp.endsWith(".tsx")) && !isTestFile(fp) && !isInTestDir(fp) && !fp.includes("node_modules"),
  );

  let filesWithoutTests = 0;
  const totalLibFiles = libFiles.length;
  for (const libFile of libFiles) {
    const base = basename(libFile, extname(libFile));
    const dir = join(libFile, "..");
    // Check if a co-located test exists
    const possibleTests = [
      join(dir, `${base}.test.${extname(libFile).slice(1)}`),
      join(dir, `${base}.spec.${extname(libFile).slice(1)}`),
    ];
    const hasCoLocatedTest = possibleTests.some((p) => existsSync(p));
    const isInTestDirectory = isInTestDir(libFile);

    if (!hasCoLocatedTest && !isInTestDirectory) {
      filesWithoutTests++;
    }
  }

  if (totalLibFiles > 0) {
    const testGapPct = Math.round((filesWithoutTests / totalLibFiles) * 100);
    if (testGapPct > 50) {
      risks.push({
        category: "test-coverage",
        message: `${testGapPct}% of source files lack co-located tests (${filesWithoutTests}/${totalLibFiles})`,
        severity: "warn",
      });
    } else {
      risks.push({
        category: "test-coverage",
        message: `${testGapPct}% of source files lack co-located tests (${filesWithoutTests}/${totalLibFiles})`,
        severity: "info",
      });
    }
  }

  // 5. Config conflicts: multiple docker-compose files without clear primary
  const composeFiles = walkDir(ROOT_DIR, 1).filter(
    (fp) => basename(fp).startsWith("docker-compose"),
  );
  if (composeFiles.length > 2) {
    risks.push({
      category: "config-drift",
      message: `${composeFiles.length} docker-compose files — clarify which is primary`,
      severity: "info",
    });
  }

  // 6. Dependencies: check for both package-lock.json and bun.lock (conflicting lockfiles)
  const hasPackageLock = existsSync(join(ROOT_DIR, "package-lock.json"));
  const hasBunLock = existsSync(join(ROOT_DIR, "bun.lock"));
  if (hasPackageLock && hasBunLock) {
    risks.push({
      category: "dependency",
      message: "Both package-lock.json and bun.lock present — pick one package manager",
      severity: "warn",
    });
  }

  return { risks, riskCount: risks.length };
}

// ── Sub-command: report ──────────────────────────────────────────────────────

function cmdReport(): ScoutReport {
  const scan = cmdScan();
  const paths = cmdPaths();
  const risks = cmdRisks();

  return {
    timestamp: new Date().toISOString(),
    rootDir: ROOT_DIR,
    scan,
    paths,
    risks,
  };
}

// ── Default: search query ────────────────────────────────────────────────────

function cmdSearch(query: string): GrepResult {
  return cmdGrep(query);
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatScan(result: ScanResult): string {
  const lines: string[] = [];
  lines.push("[scout] ══ SCAN RESULTS ══════════════════════════════════");
  lines.push("");
  lines.push(`Top-level directories (${result.topLevelDirs.length}):`);
  for (const d of result.topLevelDirs) {
    lines.push(`  📁 ${d}/`);
  }
  lines.push("");
  lines.push(`Top-level files (${result.topLevelFiles.length}):`);
  for (const f of result.topLevelFiles.slice(0, 20)) {
    lines.push(`  📄 ${f}`);
  }
  if (result.topLevelFiles.length > 20) {
    lines.push(`  ... and ${result.topLevelFiles.length - 20} more`);
  }
  lines.push("");
  lines.push(`Key files (${result.keyFiles.length}):`);
  for (const kf of result.keyFiles) {
    lines.push(`  🔑 [${kf.role}] ${kf.path}`);
  }
  lines.push("");
  lines.push("File counts by extension:");
  const sorted = Object.entries(result.fileCountByExt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [ext, count] of sorted) {
    lines.push(`  ${ext || "(none)"}: ${count}`);
  }
  return lines.join("\n");
}

function formatGrep(result: GrepResult): string {
  const lines: string[] = [];
  lines.push(`[scout] ══ GREP: "${result.pattern}" ══════════════════════`);
  lines.push(`Found ${result.matchCount} matches:`);
  lines.push("");
  for (const m of result.matches) {
    lines.push(`  ${m.file}:${m.line}: ${m.content}`);
  }
  if (result.matchCount === 0) {
    lines.push("  (no matches)");
  }
  return lines.join("\n");
}

function formatPaths(result: PathsResult): string {
  const lines: string[] = [];
  lines.push("[scout] ══ KEY PATHS ════════════════════════════════════");
  lines.push("");

  const sections: Array<{ label: string; emoji: string; items: string[] }> = [
    { label: "Configs", emoji: "⚙️", items: result.configs },
    { label: "Entry Points", emoji: "🚀", items: result.entryPoints },
    { label: "Docs", emoji: "📖", items: result.docs },
    { label: "Tests", emoji: "🧪", items: result.tests },
    { label: "Scripts", emoji: "📜", items: result.scripts },
    { label: "Schemas", emoji: "📐", items: result.schemas },
  ];

  for (const section of sections) {
    lines.push(`${section.emoji} ${section.label} (${section.items.length}):`);
    if (section.items.length === 0) {
      lines.push("  (none found)");
    } else {
      for (const item of section.items.slice(0, 30)) {
        lines.push(`  ${item}`);
      }
      if (section.items.length > 30) {
        lines.push(`  ... and ${section.items.length - 30} more`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatRisks(result: RiskResult): string {
  const lines: string[] = [];
  lines.push("[scout] ══ RISK SCAN ════════════════════════════════════");
  lines.push(`Total risks: ${result.riskCount}`);
  lines.push("");

  if (result.riskCount === 0) {
    lines.push("✅ No risks detected");
    return lines.join("\n");
  }

  // Group by severity
  const errors = result.risks.filter((r) => r.severity === "error");
  const warns = result.risks.filter((r) => r.severity === "warn");
  const infos = result.risks.filter((r) => r.severity === "info");

  if (errors.length > 0) {
    lines.push(`🔴 Errors (${errors.length}):`);
    for (const r of errors) {
      lines.push(`  [${r.category}] ${r.message}${r.path ? ` → ${r.path}` : ""}`);
    }
    lines.push("");
  }

  if (warns.length > 0) {
    lines.push(`🟡 Warnings (${warns.length}):`);
    for (const r of warns) {
      lines.push(`  [${r.category}] ${r.message}${r.path ? ` → ${r.path}` : ""}`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push(`ℹ️  Info (${infos.length}):`);
    for (const r of infos) {
      lines.push(`  [${r.category}] ${r.message}${r.path ? ` → ${r.path}` : ""}`);
    }
  }
  return lines.join("\n");
}

function formatReport(report: ScoutReport): string {
  const lines: string[] = [];
  lines.push("[scout] ═══════════════════════════════════════════════════");
  lines.push("[scout]       SCOUT REPORT — FULL RECON");
  lines.push("[scout] ═══════════════════════════════════════════════════");
  lines.push(`Timestamp : ${report.timestamp}`);
  lines.push(`Root      : ${report.rootDir}`);
  lines.push("");

  lines.push(formatScan(report.scan));
  lines.push("");
  lines.push(formatPaths(report.paths));
  lines.push(formatRisks(report.risks));
  lines.push("");
  lines.push("[scout] ═══════════════════════════════════════════════════");
  lines.push("[scout]       END SCOUT REPORT");
  lines.push("[scout] ═══════════════════════════════════════════════════");
  return lines.join("\n");
}

// ── DB Logging ────────────────────────────────────────────────────────────────

interface DbConnections {
  pgPool: { query: (sql: string, params: unknown[]) => Promise<unknown> };
  neo4jSession: {
    run: (cypher: string, params: Record<string, unknown>) => Promise<unknown>;
    close: () => Promise<void>;
  };
  closeDriver: () => Promise<void>;
  closePool: () => Promise<void>;
}

async function getDbConnections(): Promise<DbConnections | null> {
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const neo4jUri = null; // Neo4j sunset

  if (!postgresUrl) {
    return null;
  }

  const { getPool, closePool } = await import("../../src/lib/postgres/connection");
  const closeDriver = async () => {};

  const pgPool = getPool();
  // Neo4j sunset — PostgreSQL only
  const session = null as unknown as { run: () => Promise<never[]>; close: () => Promise<void> };

  return {
    pgPool,
    neo4jSession: session,
    closeDriver,
    closePool,
  };
}

async function logToPostgres(
  db: DbConnections,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.pgPool.query(
    `INSERT INTO events (group_id, event_type, agent_id, metadata, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      GROUP_ID,
      eventType,
      AGENT_ID,
      JSON.stringify(metadata),
      "completed",
    ],
  );
}

async function createInsight(
  db: DbConnections,
  summary: string,
  confidence: number,
  sourceType: string,
): Promise<void> {
  await db.neo4jSession.run(
    `CREATE (i:Insight {
      insight_id: 'ins_recon_' + randomUUID(),
      summary: $summary,
      confidence: $confidence,
      status: 'active',
      group_id: $groupId,
      created_at: datetime(),
      source_type: $sourceType
    })
    RETURN i`,
    {
      summary,
      confidence,
      groupId: GROUP_ID,
      sourceType,
    },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { subCommand, args } = parseArgs();

  // No args at all → print usage
  if (!subCommand && args.length === 0) {
    console.log("[scout] Scout — Recon & Discovery Agent");
    console.log("");
    console.log("Usage:");
    console.log("  bun scripts/agents/scout-recon.ts scan [path]   List directory structure, identify key files");
    console.log("  bun scripts/agents/scout-recon.ts grep <pattern> Search for patterns across codebase");
    console.log("  bun scripts/agents/scout-recon.ts paths          Find key paths (configs, entry points, docs, tests)");
    console.log("  bun scripts/agents/scout-recon.ts risks          Scan for architectural risks");
    console.log("  bun scripts/agents/scout-recon.ts report         Full Scout Report");
    console.log("  bun scripts/agents/scout-recon.ts <query>        Default: search for query across codebase");
    process.exit(0);
  }

  console.log(`[scout] Starting recon...`);
  console.log(`[scout] Root: ${ROOT_DIR}`);
  console.log(`[scout] Command: ${subCommand || "search"}`);
  if (args.length > 0) {
    console.log(`[scout] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Execute the sub-command — always real filesystem work
  let output: string;
  let findingsForDb: Record<string, unknown>;

  if (subCommand === "scan") {
    const result = cmdScan(args[0]);
    output = formatScan(result);
    findingsForDb = {
      subCommand: "scan",
      topDirs: result.topLevelDirs.length,
      topFiles: result.topLevelFiles.length,
      keyFilesCount: result.keyFiles.length,
      extCount: Object.keys(result.fileCountByExt).length,
    };
  } else if (subCommand === "grep") {
    if (args.length === 0) {
      console.error("[scout] grep requires a pattern argument");
      process.exit(1);
    }
    const result = cmdGrep(args[0]);
    output = formatGrep(result);
    findingsForDb = {
      subCommand: "grep",
      pattern: result.pattern,
      matchCount: result.matchCount,
    };
  } else if (subCommand === "paths") {
    const result = cmdPaths();
    output = formatPaths(result);
    findingsForDb = {
      subCommand: "paths",
      configs: result.configs.length,
      entryPoints: result.entryPoints.length,
      docs: result.docs.length,
      tests: result.tests.length,
      scripts: result.scripts.length,
      schemas: result.schemas.length,
    };
  } else if (subCommand === "risks") {
    const result = cmdRisks();
    output = formatRisks(result);
    findingsForDb = {
      subCommand: "risks",
      riskCount: result.riskCount,
      errors: result.risks.filter((r) => r.severity === "error").length,
      warns: result.risks.filter((r) => r.severity === "warn").length,
      infos: result.risks.filter((r) => r.severity === "info").length,
    };
  } else if (subCommand === "report") {
    const result = cmdReport();
    output = formatReport(result);
    findingsForDb = {
      subCommand: "report",
      topDirs: result.scan.topLevelDirs.length,
      keyFilesCount: result.scan.keyFiles.length,
      configs: result.paths.configs.length,
      tests: result.paths.tests.length,
      riskCount: result.risks.riskCount,
    };
  } else {
    // Default: search query
    const query = args.join(" ");
    const result = cmdSearch(query);
    output = formatGrep(result);
    findingsForDb = {
      subCommand: "search",
      query,
      matchCount: result.matchCount,
    };
  }

  // Always print real output
  console.log(output);

  // Try DB logging if available
  const db = await getDbConnections();

  if (!db) {
    console.log("\n[scout] ⚠️  Database connections not configured");
    console.log("[scout] Recon complete — results shown above (no DB logging)");
    console.log("[scout] Set POSTGRES_URL and NEO4J_URI to log findings");
    process.exit(0);
  }

  try {
    // Log recon start
    await logToPostgres(db, "recon_started", {
      ...findingsForDb,
      agent: AGENT_ID,
    });

    // Create insight in Neo4j
    const confidence = subCommand === "risks" ? 0.85 : 0.75;
    const summary = `Scout recon (${subCommand || "search"}): ${JSON.stringify(findingsForDb)}`;
    await createInsight(db, summary, confidence, "agent_recon");

    // Log recon completion
    await logToPostgres(db, "recon_completed", {
      ...findingsForDb,
      confidence,
    });

    console.log("\n[scout] ✅ Recon logged to PostgreSQL and Neo4j");
  } catch (error) {
    console.error("\n[scout] DB logging failed:", error);
    // Don't exit with error — the recon output is still valid
  } finally {
    await db.neo4jSession.close();
    await db.closeDriver();
    await db.closePool();
  }
}

main();
