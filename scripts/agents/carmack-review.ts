#!/usr/bin/env bun
/**
 * ⚠️ DEPRECATED: This agent is now "Carmack" (John Carmack) in Team RAM.
 * Manifest ID: carmack (was: dijkstra)
 * CI Route: pull_request → carmack-review (was: dijkstra-review)
 * See: src/lib/agents/agent-manifest.ts
 *
 * This file is preserved for backward compatibility during migration.
 * The canonical agent name is "carmack". All new references should use
 * Team RAM naming. See .claude/rules/agent-routing.md for the routing table.
 *
 * Performs structured code review on pull requests and source files.
 * Routes from GitHub webhook → Carmack (Performance Specialist / Review)
 *
 * Sub-commands:
 *   review <pr_number>  Code review of a PR via git diff (default)
 *   check <path>        Standalone file review with per-function scoring
 *   surface <dir>       API surface analysis of a directory
 *   contracts           Check canonical memory operation contracts
 *   <pr_number>         Default: review (backward compatible)
 *
 * Gracefully handles missing DB connections (for CI environments)
 * When no DB, produces real analysis — the analysis is the value, DB is just logging.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { gitExec } from "../../src/lib/git/exec";

// ── Types ────────────────────────────────────────────────────────────────────

type Severity = "pass" | "warn" | "fail";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
  location: string; // file:line
}

interface ExportInfo {
  name: string;
  kind: "function" | "const" | "interface" | "type" | "class";
  line: number;
  hasJSDoc: boolean;
  hasExplicitReturnType: boolean;
  paramCount: number;
  hasAnyType: boolean;
  returnsPromise: boolean;
  hasErrorHandling: boolean;
}

interface FileReview {
  path: string;
  totalLines: number;
  exports: ExportInfo[];
  findings: Finding[];
}

interface DiffFileChange {
  path: string;
  additions: number;
  deletions: number;
  diffContent: string;
  addedLines: string[];
}

interface ReviewResult {
  files: FileReview[];
  diffStats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  findings: Finding[];
  summary: {
    totalFiles: number;
    totalExports: number;
    byCategory: Record<string, number>;
    bySeverity: Record<Severity, number>;
  };
  verdict: Severity;
}

interface FunctionScore {
  name: string;
  line: number;
  issues: Finding[];
  score: "🟢" | "🟡" | "🔴";
}

interface SurfaceModule {
  path: string;
  exports: ExportInfo[];
  totalCount: number;
  undocumentedCount: number;
  anyTypeCount: number;
  findings: Finding[];
}

interface ContractCheck {
  operation: string;
  exists: boolean;
  hasTypes: boolean;
  hasMeta: boolean;
  findings: Finding[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "carmack";

const SUBCOMMANDS = ["review", "check", "surface", "contracts"] as const;
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
  ".opencode",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "tsconfig.tsbuildinfo",
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".map",
]);

// Thresholds
const MAX_NEW_EXPORTS = 5;
const MAX_PARAM_COUNT = 4;
const MAX_SURFACE_EXPORTS = 20;

// Canonical memory operations
const CANONICAL_OPS = [
  "memory_add",
  "memory_search",
  "memory_get",
  "memory_list",
  "memory_delete",
] as const;

// ── Formatting helpers ───────────────────────────────────────────────────────

const SEV_ICON: Record<Severity, string> = {
  pass: "🟢",
  warn: "🟡",
  fail: "🔴",
};

function sevIcon(s: Severity): string {
  return SEV_ICON[s];
}

function relPath(absPath: string): string {
  return relative(ROOT_DIR, absPath);
}

function fmtLocation(file: string, line: number): string {
  return `${file}:${line}`;
}

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

  // Backward compatible: bare PR number → review
  return { subCommand: null, args: argv };
}

// ── Utility: Walk directory tree ─────────────────────────────────────────────

function walkDir(
  dir: string,
  maxDepth: number = 8,
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

function isSourceFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx";
}

function isAnalyzableFile(filePath: string): boolean {
  const ext = extname(filePath);
  if (BINARY_EXTS.has(ext)) return false;
  if (IGNORED_FILES.has(basename(filePath))) return false;
  return ext === ".ts" || ext === ".tsx";
}

/**
 * Check if a line is a comment (not real code that should be flagged).
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed === ""
  );
}

/**
 * Strip inline comments from a line for more accurate pattern detection.
 */
function stripInlineComment(line: string): string {
  let inString: string | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === inString && line[i - 1] !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") {
      return line.substring(0, i);
    }
  }
  return line;
}

// ── Export Detection ──────────────────────────────────────────────────────────

/**
 * Detect all exports in a file with their properties.
 */
function detectExports(filePath: string): ExportInfo[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const exports: ExportInfo[] = [];

  // Track JSDoc block positions: a JSDoc immediately before an export qualifies
  const jsdocLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.endsWith("*/")) {
      // Walk backwards to find the matching /**
      let foundOpen = false;
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        if (lines[j].trim().startsWith("/**") || lines[j].trim() === "/**") {
          // Mark all lines from j..i as JSDoc
          for (let k = j; k <= i; k++) jsdocLines.add(k);
          foundOpen = true;
          break;
        }
        if (lines[j].trim() === "*/" && j !== i) break; // different block
      }
    }
  }

  // Regex patterns for different export kinds
  const patterns: Array<{
    re: RegExp;
    kind: ExportInfo["kind"];
  }> = [
    { re: /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { re: /^(\s*)export\s+(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { re: /^(\s*)export\s+(?:const|let|var)\s+(\w+)/, kind: "const" },
    { re: /^(\s*)export\s+interface\s+(\w+)/, kind: "interface" },
    { re: /^(\s*)export\s+type\s+(\w+)/, kind: "type" },
    { re: /^(\s*)export\s+class\s+(\w+)/, kind: "class" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only process lines that have 'export' keyword
    if (!/\bexport\b/.test(line)) continue;
    if (isCommentLine(line)) continue;

    for (const { re, kind } of patterns) {
      const match = line.match(re);
      if (!match) continue;

      const name = match[2];
      if (!name) continue;

      const exportLine = i + 1; // 1-indexed

      // Check for JSDoc: look within 5 lines above for a JSDoc that ends right before this line
      let hasJSDoc = false;
      for (let back = 1; back <= 5; back++) {
        const checkLine = i - back;
        if (checkLine < 0) break;
        if (jsdocLines.has(checkLine) && checkLine === i - 1) {
          // JSDoc ends on the line immediately before the export
          hasJSDoc = true;
          break;
        }
        // Also check if the line right above is the closing */
        if (lines[checkLine].trim() === "*/" && checkLine === i - 1) {
          hasJSDoc = true;
          break;
        }
      }

      // Check for explicit return type on function exports
      let hasExplicitReturnType = false;
      let paramCount = 0;
      let hasAnyType = false;
      let returnsPromise = false;
      let hasErrorHandling = false;

      if (kind === "function" || kind === "const") {
        // Return type: function name(...): Type
        hasExplicitReturnType = /:\s*\w+[^=]*$/.test(line) && !/:\s*any\b/.test(line);

        // Also check multi-line signatures
        if (!hasExplicitReturnType) {
          for (let ahead = 1; ahead <= 5; ahead++) {
            if (i + ahead >= lines.length) break;
            const aheadLine = lines[i + ahead];
            if (aheadLine.includes("):")) {
              const returnPart = aheadLine.substring(aheadLine.indexOf("):"));
              if (/\):\s*\w+/.test(returnPart) && !/\):\s*any/.test(returnPart)) {
                hasExplicitReturnType = true;
              }
              break;
            }
            if (aheadLine.includes("{")) break;
          }
        }

        // Count parameters
        const fullDecl = lines.slice(i, Math.min(i + 10, lines.length)).join(" ");
        const paramMatch = fullDecl.match(/\(([^)]*)\)/);
        if (paramMatch) {
          paramCount = countParams(paramMatch[1]);
        }

        // Detect Promise return
        returnsPromise = /:\s*(?:Promise|PromiseLike)</.test(fullDecl) ||
                         /async\s+function/.test(line);

        // Detect any type in the signature
        hasAnyType = /:\s*any\b|as\s+any\b|<any>|Record<string,\s*any>/.test(fullDecl);

        // Detect error handling: look for try/catch or .catch in the function body
        if (returnsPromise || kind === "function") {
          hasErrorHandling = detectErrorHandling(content, i);
        }
      }

      // For type/interface/class exports, check for any in their block
      if (kind === "interface" || kind === "type" || kind === "class") {
        // Look at the block following the export
        const blockContent = extractBlockContent(lines, i);
        hasAnyType = /:\s*any\b|as\s+any\b|<any>|Record<string,\s*any>/.test(blockContent);
      }

      exports.push({
        name,
        kind,
        line: exportLine,
        hasJSDoc,
        hasExplicitReturnType,
        paramCount,
        hasAnyType,
        returnsPromise,
        hasErrorHandling,
      });

      break; // matched one pattern, no need to try others
    }
  }

  return exports;
}

/**
 * Count parameters in a comma-separated parameter string,
 * respecting nested brackets/braces.
 */
function countParams(paramStr: string): number {
  if (!paramStr.trim()) return 0;

  let depth = 0;
  let count = 1;
  let inString: string | null = null;

  for (const ch of paramStr) {
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
    } else if (ch === "," && depth === 0) {
      count++;
    }
  }

  return count;
}

/**
 * Detect error handling (try/catch or .catch()) in the function body
 * starting from the line index of the declaration.
 */
function detectErrorHandling(content: string, declLineIndex: number): boolean {
  const lines = content.split("\n");

  // Find the opening brace from declaration line
  let braceStart = -1;
  for (let i = declLineIndex; i < Math.min(declLineIndex + 5, lines.length); i++) {
    if (lines[i].includes("{")) {
      braceStart = i;
      break;
    }
  }

  if (braceStart === -1) return false;

  // Walk forward counting braces to find the function body
  let depth = 0;
  let started = false;

  for (let i = braceStart; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          // End of function — no error handling found
          return false;
        }
      }
    }

    // Check for error handling patterns within the body
    const codePortion = stripInlineComment(line);
    if (/\btry\s*\{/.test(codePortion) || /\.catch\s*\(/.test(codePortion)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the content block (between opening and closing brace/keyword)
 * starting from a line index. Used for interface/type/class bodies.
 */
function extractBlockContent(lines: string[], startLineIndex: number): string {
  const blockLines: string[] = [];
  let depth = 0;
  let started = false;

  for (let i = startLineIndex; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          return blockLines.join("\n");
        }
      }
    }
    if (started) {
      blockLines.push(line);
      if (depth === 0 && !line.includes("{")) {
        // Single-line declaration without braces (e.g., `export type X = ...;`)
        blockLines.push(line);
        return blockLines.join("\n");
      }
    }
  }

  return blockLines.join("\n");
}

// ── Any-type Detection in Diff ────────────────────────────────────────────────

function detectAnyInLine(line: string): boolean {
  if (isCommentLine(line)) return false;
  const codePortion = stripInlineComment(line);
  return /:\s*any\b|as\s+any\b|<any>|Record<[^,]+,\s*any>/.test(codePortion);
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: review — Code review of a PR
// ══════════════════════════════════════════════════════════════════════════════

function getBaseBranch(): string {
  // Try common base branches
  for (const branch of ["main", "new-main", "master"]) {
    try {
      gitExec(["rev-parse", "--verify", branch], { cwd: ROOT_DIR });
      return branch;
    } catch {
      continue;
    }
  }
  return "main";
}

function getPrDiff(prRef: string): DiffFileChange[] {
  const baseBranch = getBaseBranch();
  let diffOutput: string;
  try {
    diffOutput = gitExec(
      ["diff", `${baseBranch}...HEAD`, "--src-prefix=", "--dst-prefix="],
      { cwd: ROOT_DIR, maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    // Fallback: try diff against HEAD~1 or just staged changes
    try {
      diffOutput = gitExec(
        ["diff", "HEAD~1...HEAD", "--src-prefix=", "--dst-prefix="],
        { cwd: ROOT_DIR, maxBuffer: 50 * 1024 * 1024 },
      );
    } catch {
      console.error(`[carmack] Cannot get diff for PR ref ${prRef}`);
      process.exit(1);
    }
  }

  return parseDiffOutput(diffOutput);
}

function parseDiffOutput(diffOutput: string): DiffFileChange[] {
  const files: DiffFileChange[] = [];
  const lines = diffOutput.split("\n");

  let currentFile: DiffFileChange | null = null;
  let additions = 0;
  let deletions = 0;
  let diffContent: string[] = [];
  let addedLines: string[] = [];

  for (const line of lines) {
    // New file header
    if (line.startsWith("diff --git ")) {
      // Save previous file
      if (currentFile) {
        currentFile.additions = additions;
        currentFile.deletions = deletions;
        currentFile.diffContent = diffContent.join("\n");
        currentFile.addedLines = [...addedLines];
        files.push(currentFile);
      }

      // Parse filename from diff --git a/foo b/foo
      const fileMatch = line.match(/diff --git (?:a\/.+?\s)b\/(.+)$/);
      const path = fileMatch ? fileMatch[1] : "unknown";

      currentFile = { path, additions: 0, deletions: 0, diffContent: "", addedLines: [] };
      additions = 0;
      deletions = 0;
      diffContent = [];
      addedLines = [];
      continue;
    }

    if (!currentFile) continue;

    diffContent.push(line);

    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
      addedLines.push(line.substring(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  // Don't forget the last file
  if (currentFile) {
    currentFile.additions = additions;
    currentFile.deletions = deletions;
    currentFile.diffContent = diffContent.join("\n");
    currentFile.addedLines = [...addedLines];
    files.push(currentFile);
  }

  return files;
}

function cmdReview(prRef: string): ReviewResult {
  const diffFiles = getPrDiff(prRef);
  const findings: Finding[] = [];
  const fileReviews: FileReview[] = [];

  let totalExports = 0;
  let totalNewExports = 0;

  for (const diffFile of diffFiles) {
    // Skip non-source and non-analyzable files
    if (!isAnalyzableFile(diffFile.path)) continue;

    const absPath = join(ROOT_DIR, diffFile.path);
    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, "utf-8");
    const totalLines = content.split("\n").length;
    const exports = detectExports(absPath);
    const fileFindings: Finding[] = [];

    // Count new exports (added or changed in diff)
    let newExportCount = 0;
    for (const exp of exports) {
      const exportInDiff = diffFile.addedLines.some(
        (addedLine) => addedLine.includes(exp.name) && /\bexport\b/.test(addedLine),
      );
      // Also check if the export line itself was in the diff
      const exportLineInDiff = diffFile.addedLines.some((al) =>
        al.includes(`export`) && al.includes(exp.name)
      );

      if (exportInDiff || exportLineInDiff) {
        newExportCount++;
      }
    }

    totalExports += exports.length;
    totalNewExports += newExportCount;

    // ── Surface area inflation ──
    if (newExportCount > MAX_NEW_EXPORTS) {
      fileFindings.push({
        severity: "fail",
        category: "surface-inflation",
        message: `${newExportCount} new exports added (threshold: ${MAX_NEW_EXPORTS}) — surface-area inflation`,
        location: fmtLocation(diffFile.path, 1),
      });
    } else if (newExportCount > 0) {
      fileFindings.push({
        severity: "pass",
        category: "surface-inflation",
        message: `${newExportCount} new exports added — within threshold`,
        location: fmtLocation(diffFile.path, 1),
      });
    }

    // ── Per-export checks ──
    for (const exp of exports) {
      // Missing error handling: async/Promise function without try/catch or .catch()
      if (exp.returnsPromise && !exp.hasErrorHandling) {
        fileFindings.push({
          severity: "warn",
          category: "missing-error-handling",
          message: `exported \`${exp.name}\` returns Promise but has no try/catch or .catch()`,
          location: fmtLocation(diffFile.path, exp.line),
        });
      }

      // Undocumented exports: no JSDoc
      if (!exp.hasJSDoc) {
        fileFindings.push({
          severity: "warn",
          category: "undocumented-export",
          message: `exported \`${exp.name}\` (${exp.kind}) has no JSDoc comment`,
          location: fmtLocation(diffFile.path, exp.line),
        });
      }

      // Parameter count: > 4 params
      if (exp.paramCount > MAX_PARAM_COUNT) {
        fileFindings.push({
          severity: exp.paramCount > MAX_PARAM_COUNT + 2 ? "fail" : "warn",
          category: "param-count",
          message: `exported \`${exp.name}\` has ${exp.paramCount} parameters (threshold: ${MAX_PARAM_COUNT})`,
          location: fmtLocation(diffFile.path, exp.line),
        });
      }

      // Return type annotation: exported function without explicit return type
      if ((exp.kind === "function" || exp.kind === "const") && !exp.hasExplicitReturnType && exp.returnsPromise) {
        fileFindings.push({
          severity: "warn",
          category: "missing-return-type",
          message: `exported \`${exp.name}\` has no explicit return type annotation`,
          location: fmtLocation(diffFile.path, exp.line),
        });
      }

      // Type safety: any types
      if (exp.hasAnyType) {
        fileFindings.push({
          severity: "fail",
          category: "any-type",
          message: `exported \`${exp.name}\` uses \`any\` type in signature`,
          location: fmtLocation(diffFile.path, exp.line),
        });
      }
    }

    // ── Check for any types in diff added lines ──
    for (let i = 0; i < diffFile.addedLines.length; i++) {
      const addedLine = diffFile.addedLines[i];
      if (detectAnyInLine(addedLine)) {
        // Only add if not already flagged via export detection (avoid duplicates)
        const alreadyFlagged = fileFindings.some(
          (f) => f.category === "any-type" && f.location.startsWith(diffFile.path),
        );
        if (!alreadyFlagged) {
          fileFindings.push({
            severity: "warn",
            category: "any-type-diff",
            message: `new \`any\` type introduced in diff: "${addedLine.trim().substring(0, 80)}"`,
            location: fmtLocation(diffFile.path, 1),
          });
        }
        break; // one per file for diff-level check
      }
    }

    findings.push(...fileFindings);
    fileReviews.push({
      path: diffFile.path,
      totalLines,
      exports,
      findings: fileFindings,
    });
  }

  // Build summary
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { pass: 0, warn: 0, fail: 0 };

  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    bySeverity[f.severity]++;
  }

  // Compute verdict
  const verdict: Severity =
    bySeverity.fail > 0 ? "fail" :
    bySeverity.warn > 0 ? "warn" : "pass";

  const totalAdditions = diffFiles.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = diffFiles.reduce((s, f) => s + f.deletions, 0);

  return {
    files: fileReviews,
    diffStats: {
      filesChanged: diffFiles.length,
      additions: totalAdditions,
      deletions: totalDeletions,
    },
    findings,
    summary: {
      totalFiles: fileReviews.length,
      totalExports,
      byCategory,
      bySeverity,
    },
    verdict,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: check — Standalone file review
// ══════════════════════════════════════════════════════════════════════════════

function cmdCheck(targetPath: string): {
  fileReview: FileReview;
  functionScores: FunctionScore[];
} {
  const absPath = join(ROOT_DIR, targetPath);

  if (!existsSync(absPath)) {
    console.error(`[carmack] Path not found: ${targetPath}`);
    process.exit(1);
  }

  if (statSync(absPath).isDirectory()) {
    console.error(`[carmack] check requires a file path, not directory. Use 'surface' for directories.`);
    process.exit(1);
  }

  const content = readFileSync(absPath, "utf-8");
  const totalLines = content.split("\n").length;
  const exports = detectExports(absPath);
  const findings: Finding[] = [];

  // Run same per-export checks as review
  for (const exp of exports) {
    if (exp.returnsPromise && !exp.hasErrorHandling) {
      findings.push({
        severity: "warn",
        category: "missing-error-handling",
        message: `\`${exp.name}\` returns Promise but has no try/catch or .catch()`,
        location: fmtLocation(targetPath, exp.line),
      });
    }

    if (!exp.hasJSDoc) {
      findings.push({
        severity: "warn",
        category: "undocumented-export",
        message: `\`${exp.name}\` (${exp.kind}) has no JSDoc comment`,
        location: fmtLocation(targetPath, exp.line),
      });
    }

    if (exp.paramCount > MAX_PARAM_COUNT) {
      findings.push({
        severity: exp.paramCount > MAX_PARAM_COUNT + 2 ? "fail" : "warn",
        category: "param-count",
        message: `\`${exp.name}\` has ${exp.paramCount} parameters (threshold: ${MAX_PARAM_COUNT})`,
        location: fmtLocation(targetPath, exp.line),
      });
    }

    if ((exp.kind === "function" || exp.kind === "const") && !exp.hasExplicitReturnType && exp.returnsPromise) {
      findings.push({
        severity: "warn",
        category: "missing-return-type",
        message: `\`${exp.name}\` has no explicit return type annotation`,
        location: fmtLocation(targetPath, exp.line),
      });
    }

    if (exp.hasAnyType) {
      findings.push({
        severity: "fail",
        category: "any-type",
        message: `\`${exp.name}\` uses \`any\` type in signature`,
        location: fmtLocation(targetPath, exp.line),
      });
    }
  }

  // Also check all lines for any types (not just exports)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (detectAnyInLine(lines[i])) {
      const alreadyFlagged = findings.some(
        (f) => f.category === "any-type" && f.location === fmtLocation(targetPath, i + 1),
      );
      if (!alreadyFlagged) {
        findings.push({
          severity: "warn",
          category: "any-type",
          message: `\`any\` type used: "${stripInlineComment(lines[i]).trim().substring(0, 80)}"`,
          location: fmtLocation(targetPath, i + 1),
        });
      }
    }
  }

  // Build per-function scores
  const functionScores: FunctionScore[] = exports.map((exp) => {
    const issues = findings.filter(
      (f) => f.location === fmtLocation(targetPath, exp.line) ||
            (f.category === "any-type" && f.location.startsWith(fmtLocation(targetPath, exp.line).split(":")[0])),
    );
    const issueCount = issues.length;

    const score: FunctionScore["score"] =
      issueCount >= 3 ? "🔴" :
      issueCount >= 1 ? "🟡" : "🟢";

    return {
      name: exp.name,
      line: exp.line,
      issues,
      score,
    };
  });

  return {
    fileReview: {
      path: targetPath,
      totalLines,
      exports,
      findings,
    },
    functionScores,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: surface — API surface analysis
// ══════════════════════════════════════════════════════════════════════════════

function cmdSurface(dirPath: string): {
  modules: SurfaceModule[];
  findings: Finding[];
  summary: {
    totalModules: number;
    totalExports: number;
    undocumentedCount: number;
    anyTypeCount: number;
    wideSurfaceCount: number;
  };
} {
  const absPath = join(ROOT_DIR, dirPath);

  if (!existsSync(absPath)) {
    console.error(`[carmack] Directory not found: ${dirPath}`);
    process.exit(1);
  }

  if (!statSync(absPath).isDirectory()) {
    console.error(`[carmack] surface requires a directory path. Use 'check' for files.`);
    process.exit(1);
  }

  const files = walkDir(absPath).filter(isAnalyzableFile);
  const modules: SurfaceModule[] = [];
  const findings: Finding[] = [];

  let totalExports = 0;
  let totalUndocumented = 0;
  let totalAnyType = 0;
  let wideSurfaceCount = 0;

  for (const fp of files) {
    const rel = relPath(fp);
    const exports = detectExports(fp);
    const fileFindings: Finding[] = [];

    const undocumentedCount = exports.filter((e) => !e.hasJSDoc).length;
    const anyTypeCount = exports.filter((e) => e.hasAnyType).length;

    // Flag wide surface
    if (exports.length > MAX_SURFACE_EXPORTS) {
      const finding: Finding = {
        severity: "fail",
        category: "wide-surface",
        message: `${exports.length} exported symbols (threshold: ${MAX_SURFACE_EXPORTS}) — wide surface`,
        location: fmtLocation(rel, 1),
      };
      fileFindings.push(finding);
      findings.push(finding);
      wideSurfaceCount++;
    }

    // Flag undocumented exports
    for (const exp of exports) {
      if (!exp.hasJSDoc) {
        const finding: Finding = {
          severity: "warn",
          category: "undocumented-export",
          message: `\`${exp.name}\` (${exp.kind}) has no JSDoc`,
          location: fmtLocation(rel, exp.line),
        };
        fileFindings.push(finding);
        findings.push(finding);
      }
    }

    // Flag exports with any type
    for (const exp of exports) {
      if (exp.hasAnyType) {
        const finding: Finding = {
          severity: "fail",
          category: "any-type",
          message: `\`${exp.name}\` uses \`any\` in type signature`,
          location: fmtLocation(rel, exp.line),
        };
        fileFindings.push(finding);
        findings.push(finding);
      }
    }

    totalExports += exports.length;
    totalUndocumented += undocumentedCount;
    totalAnyType += anyTypeCount;

    modules.push({
      path: rel,
      exports,
      totalCount: exports.length,
      undocumentedCount,
      anyTypeCount,
      findings: fileFindings,
    });
  }

  return {
    modules,
    findings,
    summary: {
      totalModules: modules.length,
      totalExports,
      undocumentedCount: totalUndocumented,
      anyTypeCount: totalAnyType,
      wideSurfaceCount,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: contracts — Check canonical contracts
// ══════════════════════════════════════════════════════════════════════════════

function cmdContracts(): {
  checks: ContractCheck[];
  findings: Finding[];
  verdict: Severity;
} {
  const contractPath = join(ROOT_DIR, "src/lib/memory/canonical-contracts.ts");
  const findings: Finding[] = [];
  const checks: ContractCheck[] = [];

  if (!existsSync(contractPath)) {
    findings.push({
      severity: "fail",
      category: "contracts",
      message: "canonical-contracts.ts not found at src/lib/memory/",
      location: "src/lib/memory/canonical-contracts.ts:1",
    });

    return {
      checks,
      findings,
      verdict: "fail",
    };
  }

  const content = readFileSync(contractPath, "utf-8");
  const lines = content.split("\n");

  for (const op of CANONICAL_OPS) {
    const opFindings: Finding[] = [];

    // Convert operation name to interface naming pattern
    // memory_add → MemoryAdd, memory_search → MemorySearch, etc.
    const pascalOp = op
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");

    const requestName = `${pascalOp}Request`;
    const responseName = `${pascalOp}Response`;

    // 1. Check operation Request and Response interfaces exist
    let requestLine = -1;
    let responseLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`export interface ${requestName}`)) {
        requestLine = i + 1;
      }
      if (lines[i].includes(`export interface ${responseName}`)) {
        responseLine = i + 1;
      }
    }

    const hasRequest = requestLine > 0;
    const hasResponse = responseLine > 0;
    const exists = hasRequest && hasResponse;

    if (!hasRequest) {
      opFindings.push({
        severity: "fail",
        category: "contracts",
        message: `${op}: missing ${requestName} interface`,
        location: fmtLocation("src/lib/memory/canonical-contracts.ts", 1),
      });
    }

    if (!hasResponse) {
      opFindings.push({
        severity: "fail",
        category: "contracts",
        message: `${op}: missing ${responseName} interface`,
        location: fmtLocation("src/lib/memory/canonical-contracts.ts", 1),
      });
    }

    // 2. Check for proper type annotations (group_id required)
    let hasTypes = false;
    const requestContent = extractInterfaceBlock(lines, requestName);
    if (requestContent) {
      // Check that group_id is a required field (not optional with ?)
      const groupIdMatch = requestContent.match(/group_id\??\s*:\s*GroupId/);
      const hasGroupId = !!groupIdMatch;
      const isGroupIdRequired = hasGroupId && !requestContent.includes("group_id?:");

      if (isGroupIdRequired) {
        hasTypes = true;
      } else if (hasGroupId) {
        hasTypes = true;
        opFindings.push({
          severity: "warn",
          category: "contracts",
          message: `${op}: group_id should be required (not optional)`,
          location: fmtLocation("src/lib/memory/canonical-contracts.ts", requestLine),
        });
      } else {
        opFindings.push({
          severity: "fail",
          category: "contracts",
          message: `${op}: missing group_id: GroupId in ${requestName}`,
          location: fmtLocation("src/lib/memory/canonical-contracts.ts", requestLine || 1),
        });
      }

      // Also check for any type usage in the request
      if (/:\s*any\b|<any>/.test(requestContent)) {
        opFindings.push({
          severity: "warn",
          category: "contracts",
          message: `${op}: \`any\` type in ${requestName}`,
          location: fmtLocation("src/lib/memory/canonical-contracts.ts", requestLine),
        });
      }
    }

    // 3. Check for consistent meta structure in response
    let hasMeta = false;
    const responseContent = extractInterfaceBlock(lines, responseName);
    if (responseContent) {
      hasMeta = responseContent.includes("meta?:") || responseContent.includes("meta:") ||
                responseContent.includes("MemoryResponseMeta");
      if (!hasMeta) {
        opFindings.push({
          severity: "warn",
          category: "contracts",
          message: `${op}: ${responseName} missing meta?: MemoryResponseMeta`,
          location: fmtLocation("src/lib/memory/canonical-contracts.ts", responseLine),
        });
      }

      // Check for `id` field in response
      if (!responseContent.includes("id:") && !responseContent.includes("id?:")) {
        opFindings.push({
          severity: "warn",
          category: "contracts",
          message: `${op}: ${responseName} missing id field`,
          location: fmtLocation("src/lib/memory/canonical-contracts.ts", responseLine),
        });
      }
    }

    findings.push(...opFindings);

    checks.push({
      operation: op,
      exists,
      hasTypes,
      hasMeta,
      findings: opFindings,
    });
  }

  const verdict: Severity =
    findings.some((f) => f.severity === "fail") ? "fail" :
    findings.some((f) => f.severity === "warn") ? "warn" : "pass";

  return { checks, findings, verdict };
}

/**
 * Extract the content of an interface block by name.
 */
function extractInterfaceBlock(lines: string[], interfaceName: string): string | null {
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`export interface ${interfaceName}`) ||
        lines[i].includes(`interface ${interfaceName}`)) {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) return null;

  const blockLines: string[] = [];
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          blockLines.push(line);
          return blockLines.join("\n");
        }
      }
    }
    blockLines.push(line);
  }

  return blockLines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// Formatters
// ══════════════════════════════════════════════════════════════════════════════

function formatReview(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push("[carmack] ═══════════════════════════════════════════════════");
  lines.push("[carmack]       CODE REVIEW REPORT");
  lines.push("[carmack] ═══════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Files changed: ${result.diffStats.filesChanged}`);
  lines.push(`  +${result.diffStats.additions} / -${result.diffStats.deletions}`);
  lines.push(`Source files reviewed: ${result.summary.totalFiles}`);
  lines.push(`Exports analyzed: ${result.summary.totalExports}`);
  lines.push("");

  // Per-file breakdown
  for (const file of result.files) {
    const fileSev = file.findings.some((f) => f.severity === "fail") ? "🔴"
      : file.findings.some((f) => f.severity === "warn") ? "🟡"
      : "🟢";

    lines.push(`  ${fileSev} ${file.path} (${file.exports.length} exports, ${file.totalLines}L)`);

    // Show exports
    for (const exp of file.exports) {
      const icons: string[] = [];
      if (exp.hasJSDoc) icons.push("jsdoc");
      if (exp.hasExplicitReturnType) icons.push("ret-type");
      if (exp.hasErrorHandling) icons.push("err-hdl");
      if (exp.hasAnyType) icons.push("⚠any");
      const iconStr = icons.length > 0 ? ` [${icons.join(", ")}]` : "";
      const kindIcon = exp.kind === "function" ? "ƒ" :
                       exp.kind === "interface" ? "Ⅰ" :
                       exp.kind === "type" ? "T" :
                       exp.kind === "class" ? "C" : "◆";
      lines.push(
        `    ${kindIcon} \`${exp.name}\`${iconStr} → :${exp.line}`,
      );
    }

    // Show findings
    for (const f of file.findings) {
      lines.push(`    ${sevIcon(f.severity)} [${f.category}] ${f.message}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("Findings by Category:");
  lines.push("──────────────────────────────────────────────────────");
  for (const [category, count] of Object.entries(result.summary.byCategory).sort()) {
    lines.push(`  ${category}: ${count}`);
  }
  lines.push("");

  lines.push("Severity Breakdown:");
  lines.push("──────────────────────────────────────────────────────");
  lines.push(`  🟢 Pass: ${result.summary.bySeverity.pass}`);
  lines.push(`  🟡 Warn: ${result.summary.bySeverity.warn}`);
  lines.push(`  🔴 Fail: ${result.summary.bySeverity.fail}`);
  lines.push("");

  // Verdict
  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");
  lines.push("");

  if (result.verdict === "fail") {
    lines.push("  ❌ REVIEW FAILED — do not merge without resolving critical findings");
  } else if (result.verdict === "warn") {
    lines.push("  ⚠️  REVIEW PASSED WITH WARNINGS — address before merge");
  } else {
    lines.push("  ✅ REVIEW PASSED — clean to merge");
  }

  return lines.join("\n");
}

function formatCheck(
  result: { fileReview: FileReview; functionScores: FunctionScore[] },
): string {
  const lines: string[] = [];
  lines.push("[carmack] ══ FILE REVIEW ════════════════════════════════");
  lines.push("");
  lines.push(`File: ${result.fileReview.path}`);
  lines.push(`Total lines: ${result.fileReview.totalLines}`);
  lines.push(`Exports: ${result.fileReview.exports.length}`);
  lines.push("");

  // Per-function scoring
  if (result.functionScores.length > 0) {
    lines.push("Function Scores:");
    lines.push("──────────────────────────────────────────────────────");
    for (const score of result.functionScores) {
      const issueStr = score.issues.length > 0
        ? ` — ${score.issues.map((i) => i.category).join(", ")}`
        : "";
      lines.push(`  ${score.score} \`${score.name}\`${issueStr} → :${score.line}`);

      if (score.issues.length > 0) {
        for (const issue of score.issues) {
          lines.push(`     ${sevIcon(issue.severity)} [${issue.category}] ${issue.message}`);
        }
      }
    }
    lines.push("");
  }

  // All findings
  if (result.fileReview.findings.length > 0) {
    lines.push("All Findings:");
    lines.push("──────────────────────────────────────────────────────");
    for (const f of result.fileReview.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 No findings — file looks clean");
  }

  return lines.join("\n");
}

function formatSurface(result: {
  modules: SurfaceModule[];
  findings: Finding[];
  summary: {
    totalModules: number;
    totalExports: number;
    undocumentedCount: number;
    anyTypeCount: number;
    wideSurfaceCount: number;
  };
}): string {
  const lines: string[] = [];
  lines.push("[carmack] ══ API SURFACE ANALYSIS ═══════════════════════");
  lines.push("");
  lines.push(`Modules analyzed: ${result.summary.totalModules}`);
  lines.push(`Total exports: ${result.summary.totalExports}`);
  lines.push(`Undocumented: ${result.summary.undocumentedCount}`);
  lines.push(`Any types: ${result.summary.anyTypeCount}`);
  lines.push(`Wide surfaces: ${result.summary.wideSurfaceCount}`);
  lines.push("");

  // Per-module breakdown
  for (const mod of result.modules) {
    const modSev = mod.totalCount > MAX_SURFACE_EXPORTS ? "🔴"
      : mod.undocumentedCount > 0 || mod.anyTypeCount > 0 ? "🟡"
      : "🟢";

    lines.push(`  ${modSev} ${mod.path} — ${mod.totalCount} exports`);

    for (const exp of mod.exports) {
      const icons: string[] = [];
      if (!exp.hasJSDoc) icons.push("no-jsdoc");
      if (exp.hasAnyType) icons.push("⚠any");
      const iconStr = icons.length > 0 ? ` [${icons.join(", ")}]` : " ✓";
      lines.push(`    ${exp.kind}: \`${exp.name}\`${iconStr} → :${exp.line}`);
    }

    // Show findings
    for (const f of mod.findings) {
      lines.push(`    ${sevIcon(f.severity)} [${f.category}] ${f.message}`);
    }
    lines.push("");
  }

  if (result.findings.length > 0) {
    lines.push("All Findings:");
    lines.push("──────────────────────────────────────────────────────");
    for (const f of result.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 No surface findings — all modules within thresholds");
  }

  return lines.join("\n");
}

function formatContracts(result: {
  checks: ContractCheck[];
  findings: Finding[];
  verdict: Severity;
}): string {
  const lines: string[] = [];
  lines.push("[carmack] ══ CANONICAL CONTRACTS CHECK ═════════════════");
  lines.push("");
  lines.push("Canonical Memory Operations:");
  lines.push("──────────────────────────────────────────────────────");

  for (const check of result.checks) {
    const existsIcon = check.exists ? "🟢" : "🔴";
    const typesIcon = check.hasTypes ? "🟢" : "🔴";
    const metaIcon = check.hasMeta ? "🟢" : "🟡";

    lines.push(
      `  ${existsIcon} ${check.operation} — exists: ${check.exists}` +
      ` | types: ${check.hasTypes} | meta: ${check.hasMeta}`,
    );

    for (const f of check.findings) {
      lines.push(`    ${sevIcon(f.severity)} ${f.message}`);
    }
  }

  lines.push("");

  if (result.findings.length > 0) {
    lines.push("All Findings:");
    lines.push("──────────────────────────────────────────────────────");
    for (const f of result.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 All canonical contracts are valid");
  }

  lines.push("");
  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// DB Logging (same pattern as fowler/knuth)
// ══════════════════════════════════════════════════════════════════════════════

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
      insight_id: 'ins_review_' + randomUUID(),
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

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const { subCommand, args } = parseArgs();

  // No args at all → print usage
  if (!subCommand && args.length === 0) {
    console.log("[carmack] Carmack — Performance Review Agent");
    console.log("");
    console.log("Usage:");
    console.log("  bun scripts/agents/carmack-review.ts review <pr>   Code review of a PR (git diff)");
    console.log("  bun scripts/agents/carmack-review.ts check <path>  Standalone file review");
    console.log("  bun scripts/agents/carmack-review.ts surface <dir> API surface analysis");
    console.log("  bun scripts/agents/carmack-review.ts contracts    Check canonical contracts");
    console.log("  bun scripts/agents/carmack-review.ts <pr>         Default: review (backward compat)");
    process.exit(0);
  }

  console.log("[carmack] Starting code review...");
  console.log(`[carmack] Command: ${subCommand || "review"}`);
  if (args.length > 0) {
    console.log(`[carmack] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Execute the sub-command — always real analysis
  let output: string;
  let findingsForDb: Record<string, unknown>;
  let exitCode = 0;

  if (subCommand === "review") {
    if (args.length === 0) {
      console.error("[carmack] review requires a PR number or ref");
      process.exit(1);
    }
    const result = cmdReview(args[0]);
    output = formatReview(result);
    findingsForDb = {
      subCommand: "review",
      prRef: args[0],
      filesChanged: result.diffStats.filesChanged,
      totalExports: result.summary.totalExports,
      findingsByCategory: result.summary.byCategory,
      severityBreakdown: result.summary.bySeverity,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else if (subCommand === "check") {
    if (args.length === 0) {
      console.error("[carmack] check requires a file path");
      process.exit(1);
    }
    const result = cmdCheck(args[0]);
    output = formatCheck(result);
    findingsForDb = {
      subCommand: "check",
      target: args[0],
      exportCount: result.fileReview.exports.length,
      findingCount: result.fileReview.findings.length,
    };
    const hasFail = result.fileReview.findings.some((f) => f.severity === "fail");
    const failFunctions = result.functionScores.filter((s) => s.score === "🔴").length;
    exitCode = hasFail || failFunctions > 0 ? 1 : 0;
  } else if (subCommand === "surface") {
    if (args.length === 0) {
      console.error("[carmack] surface requires a directory path");
      process.exit(1);
    }
    const result = cmdSurface(args[0]);
    output = formatSurface(result);
    findingsForDb = {
      subCommand: "surface",
      target: args[0],
      totalModules: result.summary.totalModules,
      totalExports: result.summary.totalExports,
      undocumentedCount: result.summary.undocumentedCount,
      anyTypeCount: result.summary.anyTypeCount,
      wideSurfaceCount: result.summary.wideSurfaceCount,
      findingCount: result.findings.length,
    };
    exitCode = result.findings.some((f) => f.severity === "fail") ? 1 : 0;
  } else if (subCommand === "contracts") {
    const result = cmdContracts();
    output = formatContracts(result);
    findingsForDb = {
      subCommand: "contracts",
      operationsChecked: CANONICAL_OPS.length,
      findingCount: result.findings.length,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else {
    // Default: bare PR number → review
    const prRef = args[0];
    const result = cmdReview(prRef);
    output = formatReview(result);
    findingsForDb = {
      subCommand: "review",
      prRef,
      filesChanged: result.diffStats.filesChanged,
      totalExports: result.summary.totalExports,
      findingsByCategory: result.summary.byCategory,
      severityBreakdown: result.summary.bySeverity,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  }

  // Always print real output
  console.log(output);

  // Try DB logging if available
  const db = await getDbConnections();

  if (!db) {
    console.log("\n[carmack] ⚠️  Database connections not configured");
    console.log("[carmack] Review complete — results shown above (no DB logging)");
    console.log("[carmack] Set POSTGRES_URL and NEO4J_URI to log findings");
    process.exit(exitCode);
  }

  try {
    // Log review start
    await logToPostgres(db, "code_review_started", {
      ...findingsForDb,
      agent: AGENT_ID,
    });

    // Create insight in Neo4j
    const confidence = findingsForDb.verdict === "fail" ? 0.92 :
                        findingsForDb.verdict === "warn" ? 0.80 : 0.85;
    const summary = `Dijkstra code review (${findingsForDb.subCommand}): ${JSON.stringify(findingsForDb)}`;
    await createInsight(db, summary, confidence, "agent_review");

    // Log review completion
    await logToPostgres(db, "code_review_completed", {
      ...findingsForDb,
      confidence,
    });

    console.log("\n[carmack] ✅ Review logged to PostgreSQL and Neo4j");
  } catch (error) {
    console.error("\n[carmack] DB logging failed:", error);
    // Don't change exit code — the review output is still valid
  } finally {
    await db.neo4jSession.close();
    await db.closeDriver();
    await db.closePool();
  }

  process.exit(exitCode);
}

main();
