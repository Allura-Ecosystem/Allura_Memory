#!/usr/bin/env bun
/**
 * CI validation: Git-Exec Choke Point Integrity (GIT-EXEC-001)
 *
 * Scans src/ and scripts/ for bare git invocations that bypass the
 * single enforcement boundary in src/lib/git/exec.ts.
 *
 * Detected bypass patterns:
 *   - execSync( ... "git ..."   (child_process)
 *   - spawnSync("git", ...)     (child_process)
 *   - spawn("git", ...)         (child_process)
 *   - exec("git", ...)          (child_process)
 *   - Bun.$`...git ...`         (Bun shell)
 *   - shell strings starting with `git ` inside string literals
 *
 * Allowlist:
 *   - src/lib/git/exec.ts        (the choke point itself)
 *
 * Usage:
 *   bun scripts/validate-git-exec-choke-point.ts
 *   # Exit 0 = clean. Exit 1 = bypasses found.
 *
 * Registered as: "validate:git-exec" in package.json.
 * Does NOT require PostgreSQL or Neo4j — purely static analysis.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// ── Configuration ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = join(__dirname, "..");

/** Directories to scan recursively. */
const SCAN_DIRS = [
  join(PROJECT_ROOT, "src"),
  join(PROJECT_ROOT, "scripts"),
];

/** File extensions to inspect. */
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

/**
 * Files allowed to contain bare git invocations.
 * Relative to PROJECT_ROOT.
 */
const ALLOWLIST = new Set([
  "src/lib/git/exec.ts",
  // The scanner's own doc-comment examples are not real invocations.
  "scripts/validate-git-exec-choke-point.ts",
  // Isolated test fixture: creates a temporary repository so the docs guard can
  // validate internal-link behavior. gitExec intentionally rejects this before
  // a worktree exists, so this setup-only call cannot route through the wrapper.
  "src/__tests__/docs-backend-residue-guard.test.ts",
]);

// ── Bypass Patterns ───────────────────────────────────────────────────────────

/**
 * Each pattern is applied per-line.  A match is a bypass if the file is
 * not on the allowlist.
 *
 * Patterns cover the four ways to shell out to git in TypeScript / JS:
 *   1. execSync("git ...", ...)
 *   2. spawnSync("git", ...) / spawn("git", ...) / exec("git", ...)
 *   3. Bun.$`...git ...`
 *   4. Shell string starting with "git " passed to any exec-like
 */
const BYPASS_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  // execSync with a git command string (single or double quotes, template literal)
  {
    label: "execSync with git command string",
    regex: /execSync\s*\(\s*[`'"](git\s|.*\bgit\s)/,
  },
  // spawnSync / spawn / exec called with "git" as first positional arg
  {
    label: "spawnSync/spawn/exec with 'git' as first arg",
    regex: /(?:spawnSync|spawn|exec)\s*\(\s*['"`]git['"`]/,
  },
  // Bun shell template literal containing a git invocation
  {
    label: "Bun.$ template literal with git",
    regex: /Bun\.\$`[^`]*\bgit\s/,
  },
  // execFileSync("git", ...) — this is reserved for src/lib/git/exec.ts itself
  {
    label: "execFileSync with 'git' as first arg",
    regex: /execFileSync\s*\(\s*['"`]git['"`]/,
  },
];

// ── Scanner ───────────────────────────────────────────────────────────────────

interface BypassHit {
  file: string;       // relative to PROJECT_ROOT
  line: number;       // 1-based
  col: number;        // 1-based
  label: string;
  snippet: string;    // trimmed line content
}

function scanFile(absPath: string): BypassHit[] {
  const relPath = relative(PROJECT_ROOT, absPath);

  // Skip allowlisted files — the wrapper is the one place bare git is allowed.
  if (ALLOWLIST.has(relPath)) return [];

  const content = readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const hits: BypassHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { label, regex } of BYPASS_PATTERNS) {
      const match = regex.exec(line);
      if (match) {
        hits.push({
          file: relPath,
          line: i + 1,
          col: match.index + 1,
          label,
          snippet: line.trim(),
        });
        break; // one hit per line is enough
      }
    }
  }

  return hits;
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir) as string[];
  } catch {
    return files; // directory doesn't exist — skip silently
  }

  for (const name of entries) {
    const fullPath = join(dir, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      // Skip node_modules, .next, .git, dist
      if (["node_modules", ".next", ".git", "dist", ".opencode"].includes(name)) continue;
      files.push(...walkDir(fullPath));
    } else if (stat.isFile()) {
      const dotIdx = name.lastIndexOf(".");
      if (dotIdx !== -1 && SCAN_EXTENSIONS.has(name.slice(dotIdx))) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    if (statSync(dir, { throwIfNoEntry: false })) {
      allFiles.push(...walkDir(dir));
    }
  }

  const allHits: BypassHit[] = [];
  for (const file of allFiles) {
    allHits.push(...scanFile(file));
  }

  console.log(`\nGit-Exec Choke Point Scanner (GIT-EXEC-001)\n`);
  console.log(`Files scanned:  ${allFiles.length}`);
  console.log(`Allowlist:      ${[...ALLOWLIST].join(", ")}`);
  console.log(`Bypasses found: ${allHits.length}`);

  if (allHits.length === 0) {
    console.log(`\nAll git invocations route through src/lib/git/exec.ts.`);
    process.exit(0);
  }

  console.log(`\nBYPASS VIOLATIONS — bare git calls outside the choke point:\n`);
  for (const hit of allHits) {
    console.log(`  ${hit.file}:${hit.line}:${hit.col}  [${hit.label}]`);
    console.log(`    ${hit.snippet}`);
    console.log();
  }

  console.log(
    `Route all git invocations through gitExec() from src/lib/git/exec.ts.\n` +
    `If a file legitimately needs direct git access, add it to ALLOWLIST in this script.`,
  );

  process.exit(1);
}

main();
