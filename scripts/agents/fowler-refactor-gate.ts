#!/usr/bin/env bun
/**
 * Agent: Fowler (Refactor Gate)
 * Manifest ID: fowler
 * CI Route: push → fowler-refactor-gate (future — manual only for now)
 * See: src/lib/agents/agent-manifest.ts
 *
 * Ensures changes are incremental, reversible, and don't add debt.
 * Routes from manual invocation → Fowler (Maintainability Gate)
 *
 * Sub-commands:
 *   check <path>       Analyze file/directory for complexity, length, params, duplication
 *   diff <commit_sha>   Analyze git diff for change size and scope risk
 *   debt                Scan entire source tree for technical debt indicators
 *   gate <commit_sha>   Full refactor gate review (diff + debt → verdict)
 *   <commit_sha>        Default: gate review (backward compatible)
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

interface FunctionAnalysis {
  name: string;
  startLine: number;
  endLine: number;
  lines: number;
  nestingDepth: number;
  branchCount: number;
  paramCount: number;
}

interface FileInfo {
  path: string;
  lines: number;
  functions: FunctionAnalysis[];
}

interface DiffStats {
  commitSha: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  totalLines: number;
 fileList: Array<{ path: string; additions: number; deletions: number }>;
}

interface DebtScan {
  anyCount: number;
  anyLocations: Array<{ file: string; line: number; content: string }>;
  tsIgnoreCount: number;
  tsIgnoreLocations: Array<{ file: string; line: number; content: string }>;
  todoCount: number;
  todoLocations: Array<{ file: string; line: number; content: string }>;
  eslintDisableCount: number;
  eslintDisableLocations: Array<{ file: string; line: number; content: string }>;
  longFunctionCount: number;
  longFunctionLocations: Array<{ file: string; line: number; content: string }>;
  longFileCount: number;
  longFileLocations: Array<{ file: string; line: number; content: string }>;
  consoleLogCount: number;
  consoleLogLocations: Array<{ file: string; line: number; content: string }>;
  totalFindings: number;
}

interface GateVerdict {
  incremental: Severity;
  reversible: Severity;
  debtAdded: Severity;
  designDrift: Severity;
  overall: Severity;
  findings: Finding[];
}

interface CheckResult {
  filePath: string;
  fileInfo: FileInfo;
  findings: Finding[];
  duplicationBlocks: Array<{ lines: string; occurrences: number; firstLine: number }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "fowler";

const SUBCOMMANDS = ["check", "diff", "debt", "gate"] as const;
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

const MAX_FUNCTION_LINES = 50;
const MAX_FILE_LINES = 300;
const MAX_PARAM_COUNT = 4;
const MAX_BRANCH_COUNT = 8;
const MAX_NESTING_DEPTH = 4;
const MAX_DIFF_LINES = 300;
const MAX_DIFF_FILES = 10;

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

  // Backward compatible: bare commit SHA → gate
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

// ── Utility: Is this a source file we analyze? ───────────────────────────────

function isAnalyzableFile(filePath: string): boolean {
  const ext = extname(filePath);
  if (BINARY_EXTS.has(ext)) return false;
  if (IGNORED_FILES.has(basename(filePath))) return false;
  return ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx";
}

function isSourceFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx";
}

function isScriptFile(filePath: string): boolean {
  return filePath.includes("scripts/") || filePath.includes("script/");
}

/**
 * Check if a line is a comment (not real code that should be flagged).
 * Handles //, *, /*, and JSDoc-style lines.
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
 * Check if a pattern in a line appears inside a string literal (template/quote)
 * or inside a regex literal (/pattern/). Used to avoid false positives from this
 * script's own detection code.
 */
function isPatternInStringLiteral(line: string, pattern: string): boolean {
  const patternIdx = line.indexOf(pattern);
  if (patternIdx === -1) return false;

  // Check if the line starts with a comment — no regex literals in comment lines
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
    return false;
  }

  // Check if pattern appears inside backtick template literal
  const backtickIndices: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "`" && (i === 0 || line[i - 1] !== "\\")) {
      backtickIndices.push(i);
    }
  }
  for (let pair = 0; pair + 1 < backtickIndices.length; pair += 2) {
    const start = backtickIndices[pair];
    const end = backtickIndices[pair + 1];
    if (patternIdx > start && patternIdx < end) return true;
  }

  // Check if pattern appears inside a regex literal /pattern/flags
  // Must NOT start at column 0 with / (that's a comment, not regex)
  // Walk the line to find regex literals, skipping // comments
  let inRegex = false;
  let regexStart = -1;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inRegex) {
      if (ch === "\\" && i + 1 < line.length) {
        i += 2; // skip escaped char
        continue;
      }
      if (ch === "/") {
        // End of regex literal
        const end = i;
        // Check for flags
        let j = i + 1;
        while (j < line.length && /[gimsuy]/.test(line[j])) j++;
        if (patternIdx > regexStart && patternIdx < end) return true;
        inRegex = false;
        i = j;
        continue;
      }
    } else {
      if (ch === "/" && i + 1 < line.length && line[i + 1] === "/") break; // line comment
      if (ch === "/" && i + 1 < line.length && line[i + 1] !== "*" && line[i + 1] !== "/") {
        // Potential regex start — must be preceded by an operator/punctuation
        const prevCh = i > 0 ? line[i - 1] : " ";
        if (/[(=,;!&|?:[{+~-]/.test(prevCh) || i === 0) {
          inRegex = true;
          regexStart = i;
        }
      }
    }
    i++;
  }

  return false;
}

/**
 * Strip inline comments from a line for more accurate pattern detection.
 * Preserves string contents (avoids removing // inside strings).
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

// ══════════════════════════════════════════════════════════════════════════════
// CHECK: Analyze a file or directory for complexity metrics
// ══════════════════════════════════════════════════════════════════════════════

function analyzeFile(filePath: string): FileInfo {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const functions = extractFunctions(content, lines);

  return {
    path: relPath(filePath),
    lines: lines.length,
    functions,
  };
}

/**
 * Extract function bodies using regex + brace counting.
 * Finds function declarations, arrow assignments, and method declarations.
 */
function extractFunctions(content: string, lines: string[]): FunctionAnalysis[] {
  const results: FunctionAnalysis[] = [];

  // Pattern to find function starts:
  // Group 1: function name(, export function name(, async function name(
  // Group 2: const name = (arrow), const name: Type = (typed arrow)
  // Group 3: public/private/protected name(, get/set name(
  const funcStartRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+|<[^>]+>)\s*[<(]|^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?\(|^\s*(?:public|private|protected|readonly)\s+(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*[<(]/gm;

  // JS/TS keywords that are NOT function names
  const JS_KEYWORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "break",
    "continue", "return", "throw", "try", "catch", "finally",
    "new", "delete", "typeof", "instanceof", "in", "of",
    "class", "extends", "import", "export", "from", "as",
    "const", "let", "var", "void", "yield", "await", "async",
    "true", "false", "null", "undefined", "this", "super",
    "default", "static", "get", "set",
  ]);

  let match: RegExpExecArray | null;
  while ((match = funcStartRe.exec(content)) !== null) {
    const funcName = match[1] || match[2] || match[3] || "<anonymous>";
    if (funcName.startsWith("<")) continue; // skip generics
    if (JS_KEYWORDS.has(funcName)) continue; // skip non-function keywords

    const startLine = content.substring(0, match.index).split("\n").length;
    if (startLine > lines.length) continue;

    // Find the opening brace from this position
    const fromIndex = match.index;
    const afterMatch = content.substring(fromIndex);
    const braceOffset = afterMatch.indexOf("{");
    if (braceOffset === -1) continue;

    const bodyStart = fromIndex + braceOffset;
    const bodyStartLine = content.substring(0, bodyStart).split("\n").length;

    // Count braces to find function end
    let depth = 0;
    let endIdx = bodyStart;
    let foundEnd = false;

    for (let i = bodyStart; i < content.length; i++) {
      const ch = content[i];
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          foundEnd = true;
          break;
        }
      }
    }

    if (!foundEnd) continue;

    const endLine = content.substring(0, endIdx).split("\n").length;
    const funcLines = endLine - startLine + 1;

    // Extract the function body for analysis
    const body = content.substring(bodyStart, endIdx + 1);

    // Count nesting depth (max consecutive { without matching })
    const nesting = countMaxNesting(body);

    // Count branches: if, else if, for, while, switch, case, catch, ?:
    const branchCount = countBranches(body);

    // Count parameters
    const paramMatch = afterMatch.match(/^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?(?:\w+\s*)?\(([^)]*)\)/);
    const paramCount = paramMatch ? countParams(paramMatch[1]) : 0;

    results.push({
      name: funcName,
      startLine,
      endLine,
      lines: funcLines,
      nestingDepth: nesting,
      branchCount,
      paramCount,
    });
  }

  return results;
}

function countMaxNesting(body: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const ch of body) {
    if (ch === "{") {
      currentDepth++;
      if (currentDepth > maxDepth) maxDepth = currentDepth;
    } else if (ch === "}") {
      currentDepth--;
    }
  }

  // Subtract 1 because the function body's own braces count as depth 1
  return Math.max(0, maxDepth - 1);
}

function countBranches(body: string): number {
  let count = 0;

  // if, else if
  const ifMatches = body.match(/\bif\s*\(/g);
  count += ifMatches ? ifMatches.length : 0;

  // else if (already counted by `if`, but we need to not double count)
  // Actually `else if` has `if` in it, so the if-match already caught it.
  // We want the else-if as a separate branch.
  const elseIfMatches = body.match(/\belse\s+if\s*\(/g);
  // Don't double count: the `if` regex caught the `if` inside `else if` too
  // So we subtract those
  if (elseIfMatches) {
    count -= elseIfMatches.length; // remove the double-counted `if`
    count += elseIfMatches.length; // add them back as `else if` branches
  }

  // for, for...in, for...of
  const forMatches = body.match(/\bfor\s*\(/g);
  count += forMatches ? forMatches.length : 0;
  const forOfMatches = body.match(/\bfor\s*(?:await\s+)?\(/g);
  // The for regex already catches, so don't double count

  // while
  const whileMatches = body.match(/\bwhile\s*\(/g);
  count += whileMatches ? whileMatches.length : 0;

  // switch/case — each case is a branch
  const caseMatches = body.match(/\bcase\s+/g);
  count += caseMatches ? caseMatches.length : 0;

  // catch
  const catchMatches = body.match(/\bcatch\s*[\(]/g);
  count += catchMatches ? catchMatches.length : 0;

  // ternary operator
  const ternaryMatches = body.match(/\?\s*[^\?]/g);
  count += ternaryMatches ? ternaryMatches.length : 0;

  return count;
}

function countParams(paramStr: string): number {
  if (!paramStr.trim()) return 0;

  let depth = 0;
  let count = 1; // at least one param if non-empty
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
 * Find duplicate blocks — repeated consecutive lines of 3+ lines.
 */
function findDuplication(content: string, lines: string[]): Array<{ lines: string; occurrences: number; firstLine: number }> {
  const MIN_BLOCK = 3;
  const results: Array<{ lines: string; occurrences: number; firstLine: number }> = [];
  const seen = new Map<string, { firstLine: number; count: number }>();

  for (let i = 0; i < lines.length - MIN_BLOCK; i++) {
    // Skip blocks that are mostly whitespace or comments
    const block = lines.slice(i, i + MIN_BLOCK).join("\n").trim();
    if (block.length < 15) continue; // skip trivial blocks
    if (/^[//*]/.test(block)) continue; // skip comment-only blocks

    const existing = seen.get(block);
    if (existing) {
      existing.count++;
    } else {
      seen.set(block, { firstLine: i + 1, count: 1 });
    }
  }

  for (const [blockLines, info] of seen) {
    if (info.count >= 2) {
      results.push({
        lines: blockLines.split("\n").map((l) => l.substring(0, 60)).join("\\n"),
        occurrences: info.count,
        firstLine: info.firstLine,
      });
    }
  }

  return results.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);
}

function cmdCheck(targetPath: string): CheckResult {
  const absPath = join(ROOT_DIR, targetPath);

  if (!existsSync(absPath)) {
    console.error(`[fowler] Path not found: ${targetPath}`);
    process.exit(1);
  }

  const stat = statSync(absPath);
  const findings: Finding[] = [];

  let fileInfo: FileInfo;
  let duplicationBlocks: Array<{ lines: string; occurrences: number; firstLine: number }> = [];

  if (stat.isDirectory()) {
    // Analyze all analyzable files in directory
    const files = walkDir(absPath).filter(isAnalyzableFile);
    const allFunctions: FunctionAnalysis[] = [];
    let totalLines = 0;

    for (const fp of files) {
      try {
        const info = analyzeFile(fp);
        allFunctions.push(...info.functions);
        totalLines += info.lines;

        // Check individual file findings
        for (const fn of info.functions) {
          checkFunction(fn, relPath(fp), findings);
        }

        if (info.lines > MAX_FILE_LINES) {
          findings.push({
            severity: "warn",
            category: "file-length",
            message: `File is ${info.lines} lines (threshold: ${MAX_FILE_LINES})`,
            location: fmtLocation(relPath(fp), 1),
          });
        }
      } catch {
        // skip unreadable
      }
    }

    fileInfo = {
      path: targetPath,
      lines: totalLines,
      functions: allFunctions,
    };
  } else {
    const content = readFileSync(absPath, "utf-8");
    const lines = content.split("\n");

    fileInfo = analyzeFile(absPath);

    for (const fn of fileInfo.functions) {
      checkFunction(fn, relPath(absPath), findings);
    }

    if (fileInfo.lines > MAX_FILE_LINES) {
      findings.push({
        severity: "warn",
        category: "file-length",
        message: `File is ${fileInfo.lines} lines (threshold: ${MAX_FILE_LINES})`,
        location: fmtLocation(relPath(absPath), 1),
      });
    }

    // Duplication analysis for single file
    duplicationBlocks = findDuplication(content, lines);
    for (const block of duplicationBlocks) {
      findings.push({
        severity: "warn",
        category: "duplication",
        message: `Repeated block (${block.occurrences}x): "${block.lines.substring(0, 80)}..."`,
        location: fmtLocation(relPath(absPath), block.firstLine),
      });
    }
  }

  return { filePath: targetPath, fileInfo, findings, duplicationBlocks };
}

function checkFunction(fn: FunctionAnalysis, filePath: string, findings: Finding[]): void {
  if (fn.lines > MAX_FUNCTION_LINES) {
    findings.push({
      severity: fn.lines > MAX_FUNCTION_LINES * 2 ? "fail" : "warn",
      category: "function-length",
      message: `function \`${fn.name}\` is ${fn.lines} lines (threshold: ${MAX_FUNCTION_LINES})`,
      location: fmtLocation(filePath, fn.startLine),
    });
  }

  if (fn.branchCount > MAX_BRANCH_COUNT) {
    findings.push({
      severity: fn.branchCount > MAX_BRANCH_COUNT * 2 ? "fail" : "warn",
      category: "complexity",
      message: `function \`${fn.name}\` has ${fn.branchCount} branches (threshold: ${MAX_BRANCH_COUNT})`,
      location: fmtLocation(filePath, fn.startLine),
    });
  }

  if (fn.nestingDepth > MAX_NESTING_DEPTH) {
    findings.push({
      severity: fn.nestingDepth > MAX_NESTING_DEPTH + 2 ? "fail" : "warn",
      category: "nesting",
      message: `function \`${fn.name}\` has nesting depth ${fn.nestingDepth} (threshold: ${MAX_NESTING_DEPTH})`,
      location: fmtLocation(filePath, fn.startLine),
    });
  }

  if (fn.paramCount > MAX_PARAM_COUNT) {
    findings.push({
      severity: fn.paramCount > MAX_PARAM_COUNT + 2 ? "fail" : "warn",
      category: "params",
      message: `function \`${fn.name}\` has ${fn.paramCount} parameters (threshold: ${MAX_PARAM_COUNT})`,
      location: fmtLocation(filePath, fn.startLine),
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DIFF: Analyze git diff for change size and scope risk
// ══════════════════════════════════════════════════════════════════════════════

function getDiffStats(commitSha: string): DiffStats {
  const sha = commitSha === "HEAD" ? "HEAD" : commitSha;

  // Get the commit's diff against its parent
  let diffOutput: string;
  try {
    diffOutput = gitExec(
      ["diff", `${sha}^..${sha}`, "--numstat", '--format='],
      { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    // Could be a shallow clone or initial commit — try diff against empty tree
    try {
      diffOutput = gitExec(
        ["diff", `4b825dc642cb6eb9a060e54bf899d15363ef012b..${sha}`, "--numstat", '--format='],
        { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch {
      console.error(`[fowler] Cannot get diff for ${sha}. Is it a valid commit?`);
      process.exit(1);
    }
  }

  const fileList: Array<{ path: string; additions: number; deletions: number }> = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const line of diffOutput.trim().split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
    const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
    const path = parts[2];

    // Skip binary / generated files
    if (path.endsWith(".lock") || path.endsWith(".map")) continue;

    fileList.push({ path, additions, deletions });
    totalAdditions += additions;
    totalDeletions += deletions;
  }

  return {
    commitSha: sha,
    filesChanged: fileList.length,
    additions: totalAdditions,
    deletions: totalDeletions,
    totalLines: totalAdditions + totalDeletions,
    fileList,
  };
}

function cmdDiff(commitSha: string): { stats: DiffStats; findings: Finding[] } {
  const stats = getDiffStats(commitSha);
  const findings: Finding[] = [];

  // Size check
  if (stats.totalLines > MAX_DIFF_LINES) {
    findings.push({
      severity: stats.totalLines > MAX_DIFF_LINES * 2 ? "fail" : "warn",
      category: "change-size",
      message: `${stats.totalLines} lines changed (threshold: ${MAX_DIFF_LINES}) — non-incremental risk`,
      location: stats.commitSha,
    });
  } else {
    findings.push({
      severity: "pass",
      category: "change-size",
      message: `${stats.totalLines} lines changed — incremental`,
      location: stats.commitSha,
    });
  }

  // File count check
  if (stats.filesChanged > MAX_DIFF_FILES) {
    findings.push({
      severity: stats.filesChanged > MAX_DIFF_FILES * 2 ? "fail" : "warn",
      category: "scope",
      message: `${stats.filesChanged} files changed (threshold: ${MAX_DIFF_FILES}) — broad scope risk`,
      location: stats.commitSha,
    });
  } else {
    findings.push({
      severity: "pass",
      category: "scope",
      message: `${stats.filesChanged} files changed — focused scope`,
      location: stats.commitSha,
    });
  }

  // "While I'm here" pattern: check for unrelated file changes
  const dirGroups = new Map<string, number>();
  for (const f of stats.fileList) {
    const topDir = f.path.split("/")[0] || ".";
    dirGroups.set(topDir, (dirGroups.get(topDir) || 0) + 1);
  }

  const topDirs = [...dirGroups.entries()].sort((a, b) => b[1] - a[1]);
  if (topDirs.length > 3 && stats.filesChanged > 5) {
    const dirs = topDirs.map(([d, c]) => `${d}(${c})`).join(", ");
    findings.push({
      severity: "warn",
      category: "while-im-here",
      message: `Changes span ${topDirs.length} top-level directories (${dirs}) — possible "while I'm here" pattern`,
      location: stats.commitSha,
    });
  }

  return { stats, findings };
}

// ══════════════════════════════════════════════════════════════════════════════
// DEBT: Scan entire source tree for technical debt indicators
// ══════════════════════════════════════════════════════════════════════════════

function cmdDebt(): DebtScan {
  const allFiles = walkDir(ROOT_DIR).filter(isSourceFile);

  const anyLocations: Array<{ file: string; line: number; content: string }> = [];
  const tsIgnoreLocations: Array<{ file: string; line: number; content: string }> = [];
  const todoLocations: Array<{ file: string; line: number; content: string }> = [];
  const eslintDisableLocations: Array<{ file: string; line: number; content: string }> = [];
  const longFunctionLocations: Array<{ file: string; line: number; content: string }> = [];
  const longFileLocations: Array<{ file: string; line: number; content: string }> = [];
  const consoleLogLocations: Array<{ file: string; line: number; content: string }> = [];

  const MAX_FINDINGS_PER_CATEGORY = 30;

  // This script's own filename — skip self-reference false positives
  // for pattern-based categories (ts-ignore, TODO, eslint-disable)
  const fowlerSelf = relPath(join(ROOT_DIR, "scripts/agents/fowler-refactor-gate.ts"));

  for (const fp of allFiles) {
    let content: string;
    try {
      content = readFileSync(fp, "utf-8");
    } catch {
      continue;
    }

    const rel = relPath(fp);
    const lines = content.split("\n");

    // 1. `any` type usage
    if (anyLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      const anyRe = /:\s*any\b|[<,(]\s*any\s*[>,)]|\bas\s+any\b/; // type annotations, generics, casts
      for (let i = 0; i < lines.length; i++) {
        if (anyLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
        if (isCommentLine(lines[i])) continue;
        // Strip inline comments to avoid flagging comment-only code
        const codePortion = stripInlineComment(lines[i]);
        if (anyRe.test(codePortion)) {
          anyLocations.push({
            file: rel,
            line: i + 1,
            content: codePortion.trim().substring(0, 100),
          });
        }
      }
    }

    // 2. @ts-ignore / @ts-expect-error — these ARE comment directives
    if (tsIgnoreLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      for (let i = 0; i < lines.length; i++) {
        if (tsIgnoreLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
        // Skip this script's own detection patterns (self-reference noise)
        if (rel === fowlerSelf) continue;
        // @ts-ignore/@ts-expect-error ARE comments, so use the raw line
        if (/@ts-ignore|@ts-expect-error/.test(lines[i])) {
          // Skip if the pattern is inside a regex literal (code, not directive)
          if (isPatternInStringLiteral(lines[i], "@ts-ignore")) continue;
          if (isPatternInStringLiteral(lines[i], "@ts-expect-error")) continue;
          tsIgnoreLocations.push({
            file: rel,
            line: i + 1,
            content: lines[i].trim().substring(0, 100),
          });
        }
      }
    }

    // 3. TODO / FIXME / HACK — can appear in code or comments
    if (todoLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      for (let i = 0; i < lines.length; i++) {
        if (todoLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
        // Skip this script's own patterns
        if (rel === fowlerSelf) continue;
        if (/\bTODO\b|\bFIXME\b|\bHACK\b/.test(lines[i])) {
          // Skip if inside a template literal (output formatting)
          const patternMatch = lines[i].match(/\b(TODO|FIXME|HACK)\b/);
          if (patternMatch && isPatternInStringLiteral(lines[i], patternMatch[1])) continue;
          todoLocations.push({
            file: rel,
            line: i + 1,
            content: lines[i].trim().substring(0, 100),
          });
        }
      }
    }

    // 4. eslint-disable — these ARE comment directives
    if (eslintDisableLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      for (let i = 0; i < lines.length; i++) {
        if (eslintDisableLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
        // Skip this script's own patterns
        if (rel === fowlerSelf) continue;
        // eslint-disable comments ARE comment lines, so use raw line
        if (/eslint-disable(?:-next-line|-line)?/.test(lines[i])) {
          // Skip if inside a template literal or regex (self-reference)
          if (isPatternInStringLiteral(lines[i], "eslint-disable")) continue;
          eslintDisableLocations.push({
            file: rel,
            line: i + 1,
            content: lines[i].trim().substring(0, 100),
          });
        }
      }
    }

    // 5. Functions longer than 50 lines
    if (longFunctionLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      try {
        const fileInfo = analyzeFile(fp);
        for (const fn of fileInfo.functions) {
          if (longFunctionLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
          if (fn.lines > MAX_FUNCTION_LINES) {
            longFunctionLocations.push({
              file: rel,
              line: fn.startLine,
              content: `function \`${fn.name}\` is ${fn.lines} lines`,
            });
          }
        }
      } catch {
        // skip
      }
    }

    // 6. Files longer than 300 lines
    if (longFileLocations.length < MAX_FINDINGS_PER_CATEGORY) {
      if (lines.length > MAX_FILE_LINES) {
        longFileLocations.push({
          file: rel,
          line: 1,
          content: `File is ${lines.length} lines`,
        });
      }
    }

    // 7. console.log in non-script files
    if (!isScriptFile(fp)) {
      for (let i = 0; i < lines.length; i++) {
        if (consoleLogLocations.length >= MAX_FINDINGS_PER_CATEGORY) break;
        if (isCommentLine(lines[i])) continue;
        const codePortion = stripInlineComment(lines[i]);
        if (/\bconsole\.log\s*\(/.test(codePortion)) {
          consoleLogLocations.push({
            file: rel,
            line: i + 1,
            content: codePortion.trim().substring(0, 100),
          });
        }
      }
    }
  }

  const totalFindings =
    anyLocations.length +
    tsIgnoreLocations.length +
    todoLocations.length +
    eslintDisableLocations.length +
    longFunctionLocations.length +
    longFileLocations.length +
    consoleLogLocations.length;

  return {
    anyCount: anyLocations.length,
    anyLocations,
    tsIgnoreCount: tsIgnoreLocations.length,
    tsIgnoreLocations,
    todoCount: todoLocations.length,
    todoLocations,
    eslintDisableCount: eslintDisableLocations.length,
    eslintDisableLocations,
    longFunctionCount: longFunctionLocations.length,
    longFunctionLocations,
    longFileCount: longFileLocations.length,
    longFileLocations,
    consoleLogCount: consoleLogLocations.length,
    consoleLogLocations,
    totalFindings,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// GATE: Full refactor gate review combining diff + debt
// ══════════════════════════════════════════════════════════════════════════════

function cmdGate(commitSha: string): GateVerdict {
  const findings: Finding[] = [];

  // 1. Diff analysis
  const diffResult = cmdDiff(commitSha);
  findings.push(...diffResult.findings);

  // 2. Debt introduced by this commit
  let diffContent: string;
  try {
    diffContent = gitExec(
      ["diff", `${commitSha}^..${commitSha}`, "--diff-filter=ACMR", "--", "src/"],
      { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    try {
      diffContent = gitExec(
        ["diff", `4b825dc642cb6eb9a060e54bf899d15363ef012b..${commitSha}`, "--diff-filter=ACMR", "--", "src/"],
        { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch {
      diffContent = "";
    }
  }

  // Check for new debt in the diff
  const diffLines = diffContent.split("\n");
  const addedLines = diffLines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));

  let newAny = 0;
  let newTsIgnore = 0;
  let newTodo = 0;

  for (const line of addedLines) {
    const stripped = line.substring(1);
    if (/\bany\b/.test(stripped) && /:\s*any\b|[<,(]\s*any\s*[>,)]|\bas\s+any\b/.test(stripped)) {
      newAny++;
    }
    if (/@ts-ignore|@ts-expect-error/.test(stripped)) {
      newTsIgnore++;
    }
    if (/\bTODO\b|\bFIXME\b|\bHACK\b/.test(stripped)) {
      newTodo++;
    }
  }

  if (newAny > 0) {
    findings.push({
      severity: newAny > 3 ? "fail" : "warn",
      category: "new-debt",
      message: `+${newAny} new \`any\` type usage(s) in this commit`,
      location: commitSha,
    });
  }

  if (newTsIgnore > 0) {
    findings.push({
      severity: "warn",
      category: "new-debt",
      message: `+${newTsIgnore} new @ts-ignore/@ts-expect-error suppression(s)`,
      location: commitSha,
    });
  }

  if (newTodo > 0) {
    findings.push({
      severity: "warn",
      category: "new-debt",
      message: `+${newTodo} new TODO/FIXME/HACK comment(s)`,
      location: commitSha,
    });
  }

  // 3. Reversibility check: destructive operations
  const deletedLines = diffLines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
  const hasDestructivePatterns =
    deletedLines.some((l) => /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i.test(l.substring(1))) ||
    addedLines.some((l) => /force\s+push|--force|--no-verify/i.test(l.substring(1)));

  if (hasDestructivePatterns) {
    findings.push({
      severity: "fail",
      category: "reversible",
      message: "Potentially destructive operations detected in diff",
      location: commitSha,
    });
  }

  // 4. Design drift: check for ADR contradictions
  const adrDir = join(ROOT_DIR, "docs");
  let hasAdrContradiction = false;

  if (existsSync(adrDir)) {
    const adrFiles = walkDir(adrDir)
      .filter((fp) => basename(fp).toLowerCase().includes("adr") || fp.includes("decision"));
    for (const adrFile of adrFiles.slice(0, 20)) {
      try {
        const adrContent = readFileSync(adrFile, "utf-8").toLowerCase();
        // Check for contradictions: ADR says "use X" but diff introduces "Y"
        if (adrContent.includes("bun") && /npx\s|npm\srun|npm\sinstall/.test(diffContent)) {
          if (!hasAdrContradiction) {
            hasAdrContradiction = true;
            findings.push({
              severity: "warn",
              category: "design-drift",
              message: `Diff uses npm/npx but ADR mandates bun → ${relPath(adrFile)}`,
              location: commitSha,
            });
          }
        }
        if (adrContent.includes("allura-") && /roninclaw-/.test(diffContent)) {
          if (!hasAdrContradiction) {
            hasAdrContradiction = true;
            findings.push({
              severity: "warn",
              category: "design-drift",
              message: `Diff uses deprecated 'roninclaw-' naming, ADR mandates 'allura-' → ${relPath(adrFile)}`,
              location: commitSha,
            });
          }
        }
      } catch {
        // skip
      }
    }
  }

  // 5. Compute verdicts
  const hasFail = (category: string) =>
    findings.some((f) => f.category.startsWith(category) && f.severity === "fail");
  const hasWarn = (category: string) =>
    findings.some((f) => f.category.startsWith(category) && f.severity === "warn");

  const incremental: Severity =
    hasFail("change-size") || hasFail("scope") ? "fail" :
    hasWarn("change-size") || hasWarn("scope") ? "warn" : "pass";

  const reversible: Severity =
    hasFail("reversible") ? "fail" :
    hasWarn("while-im-here") ? "warn" : "pass";

  const debtAdded: Severity =
    newAny > 3 || newTsIgnore > 2 ? "fail" :
    newAny > 0 || newTsIgnore > 0 || newTodo > 0 ? "warn" : "pass";

  const designDrift: Severity =
    hasFail("design-drift") ? "fail" :
    hasAdrContradiction ? "warn" : "pass";

  // Overall: worst of the four
  const dimScores: Severity[] = [incremental, reversible, debtAdded, designDrift];
  const overall: Severity =
    dimScores.includes("fail") ? "fail" :
    dimScores.includes("warn") ? "warn" : "pass";

  return { incremental, reversible, debtAdded, designDrift, overall, findings };
}

// ══════════════════════════════════════════════════════════════════════════════
// Formatters
// ══════════════════════════════════════════════════════════════════════════════

function formatCheck(result: CheckResult): string {
  const lines: string[] = [];
  lines.push("[fowler] ══ CHECK RESULTS ══════════════════════════════════");
  lines.push("");
  lines.push(`Target: ${result.filePath}`);
  lines.push(`Total lines: ${result.fileInfo.lines}`);
  lines.push(`Functions: ${result.fileInfo.functions.length}`);
  lines.push("");

  if (result.fileInfo.functions.length > 0) {
    lines.push("Function metrics:");
    for (const fn of result.fileInfo.functions) {
      const sev =
        fn.lines > MAX_FUNCTION_LINES * 2 ? "🔴" :
        fn.lines > MAX_FUNCTION_LINES ? "🟡" :
        fn.branchCount > MAX_BRANCH_COUNT ? "🟡" :
        fn.nestingDepth > MAX_NESTING_DEPTH ? "🟡" :
        fn.paramCount > MAX_PARAM_COUNT ? "🟡" : "🟢";

      lines.push(
        `  ${sev} \`${fn.name}\` — ${fn.lines}L, ${fn.branchCount} branches, ` +
        `depth ${fn.nestingDepth}, ${fn.paramCount} params → :${fn.startLine}`,
      );
    }
    lines.push("");
  }

  if (result.duplicationBlocks.length > 0) {
    lines.push("Duplication:");
    for (const block of result.duplicationBlocks) {
      lines.push(`  🟡 [duplication] ${block.occurrences}x repeated → :${block.firstLine}`);
    }
    lines.push("");
  }

  if (result.findings.length > 0) {
    lines.push("Findings:");
    for (const f of result.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 No findings — file looks clean");
  }

  return lines.join("\n");
}

function formatDiff(stats: DiffStats, findings: Finding[]): string {
  const lines: string[] = [];
  lines.push("[fowler] ══ DIFF ANALYSIS ═════════════════════════════════");
  lines.push("");
  lines.push(`Commit: ${stats.commitSha}`);
  lines.push(`Files changed: ${stats.filesChanged}`);
  lines.push(`  +${stats.additions} / -${stats.deletions} (${stats.totalLines} total)`);
  lines.push("");

  if (stats.fileList.length > 0) {
    lines.push("Changed files:");
    for (const f of stats.fileList) {
      lines.push(`  ${f.path} (+${f.additions}/-${f.deletions})`);
    }
    lines.push("");
  }

  lines.push("Assessment:");
  for (const f of findings) {
    lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
  }

  return lines.join("\n");
}

function formatDebt(scan: DebtScan): string {
  const lines: string[] = [];
  lines.push("[fowler] ══ DEBT SCAN ═════════════════════════════════════");
  lines.push("");
  lines.push(`Total findings: ${scan.totalFindings}`);
  lines.push("");

  const sections: Array<{
    label: string;
    icon: string;
    count: number;
    items: Array<{ file: string; line: number; content: string }>;
    threshold: number;
  }> = [
    { label: "`any` type usage", icon: "🔴", count: scan.anyCount, items: scan.anyLocations, threshold: 0 },
    { label: "@ts-ignore / @ts-expect-error", icon: "🟡", count: scan.tsIgnoreCount, items: scan.tsIgnoreLocations, threshold: 0 },
    { label: "TODO / FIXME / HACK", icon: "ℹ️ ", count: scan.todoCount, items: scan.todoLocations, threshold: 0 },
    { label: "eslint-disable", icon: "🟡", count: scan.eslintDisableCount, items: scan.eslintDisableLocations, threshold: 0 },
    { label: `Functions > ${MAX_FUNCTION_LINES} lines`, icon: "🔴", count: scan.longFunctionCount, items: scan.longFunctionLocations, threshold: 0 },
    { label: `Files > ${MAX_FILE_LINES} lines`, icon: "🟡", count: scan.longFileCount, items: scan.longFileLocations, threshold: 0 },
    { label: "console.log (non-script)", icon: "ℹ️ ", count: scan.consoleLogCount, items: scan.consoleLogLocations, threshold: 0 },
  ];

  for (const section of sections) {
    const sevIcon = section.count === 0 ? "🟢" : section.icon;
    lines.push(`${sevIcon} ${section.label}: ${section.count}`);
    if (section.items.length > 0) {
      for (const item of section.items.slice(0, 10)) {
        lines.push(`  → ${item.file}:${item.line}: ${item.content}`);
      }
      if (section.items.length > 10) {
        lines.push(`  ... and ${section.items.length - 10} more`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatGate(verdict: GateVerdict): string {
  const lines: string[] = [];
  lines.push("[fowler] ═══════════════════════════════════════════════════");
  lines.push("[fowler]       REFACTOR GATE REVIEW");
  lines.push("[fowler] ═══════════════════════════════════════════════════");
  lines.push("");

  const dimensions: Array<{ label: string; value: Severity }> = [
    { label: "Incremental", value: verdict.incremental },
    { label: "Reversible", value: verdict.reversible },
    { label: "Debt Added", value: verdict.debtAdded },
    { label: "Design Drift", value: verdict.designDrift },
  ];

  lines.push("Dimension Assessment:");
  for (const dim of dimensions) {
    lines.push(`  ${sevIcon(dim.value)}  ${dim.label}: ${dim.value.toUpperCase()}`);
  }
  lines.push("");

  lines.push("Findings:");
  if (verdict.findings.length === 0) {
    lines.push("  (none — all clean)");
  } else {
    for (const f of verdict.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  }
  lines.push("");

  // Verdict
  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(verdict.overall)} ${verdict.overall.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");
  lines.push("");

  if (verdict.overall === "fail") {
    lines.push("  ❌ REFACTOR GATE FAILED — do not merge without resolution");
  } else if (verdict.overall === "warn") {
    lines.push("  ⚠️  REFACTOR GATE PASSED WITH WARNINGS — review recommended");
  } else {
    lines.push("  ✅ REFACTOR GATE PASSED — clean to merge");
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// DB Logging (same pattern as scout)
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
      insight_id: 'ins_refactor_' + randomUUID(),
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
    console.log("[fowler] Fowler — Refactor Gate Agent");
    console.log("");
    console.log("Usage:");
    console.log("  bun scripts/agents/fowler-refactor-gate.ts check <path>    Analyze file/dir for complexity metrics");
    console.log("  bun scripts/agents/fowler-refactor-gate.ts diff <sha>      Analyze git diff for change size");
    console.log("  bun scripts/agents/fowler-refactor-gate.ts debt             Scan entire source tree for debt");
    console.log("  bun scripts/agents/fowler-refactor-gate.ts gate <sha>      Full refactor gate review (verdict)");
    console.log("  bun scripts/agents/fowler-refactor-gate.ts <sha>           Default: gate review");
    process.exit(0);
  }

  console.log("[fowler] Starting refactor gate analysis...");
  console.log(`[fowler] Command: ${subCommand || "gate"}`);
  if (args.length > 0) {
    console.log(`[fowler] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Execute the sub-command — always real analysis
  let output: string;
  let findingsForDb: Record<string, unknown>;
  let exitCode = 0;

  if (subCommand === "check") {
    if (args.length === 0) {
      console.error("[fowler] check requires a file or directory path");
      process.exit(1);
    }
    const result = cmdCheck(args[0]);
    output = formatCheck(result);
    findingsForDb = {
      subCommand: "check",
      target: result.filePath,
      findingCount: result.findings.length,
      functionCount: result.fileInfo.functions.length,
      totalLines: result.fileInfo.lines,
    };
    exitCode = result.findings.some((f) => f.severity === "fail") ? 1 : 0;
  } else if (subCommand === "diff") {
    if (args.length === 0) {
      console.error("[fowler] diff requires a commit SHA");
      process.exit(1);
    }
    const result = cmdDiff(args[0]);
    output = formatDiff(result.stats, result.findings);
    findingsForDb = {
      subCommand: "diff",
      commitSha: result.stats.commitSha,
      filesChanged: result.stats.filesChanged,
      totalLines: result.stats.totalLines,
      findingCount: result.findings.length,
    };
  } else if (subCommand === "debt") {
    const scan = cmdDebt();
    output = formatDebt(scan);
    findingsForDb = {
      subCommand: "debt",
      totalFindings: scan.totalFindings,
      anyCount: scan.anyCount,
      tsIgnoreCount: scan.tsIgnoreCount,
      todoCount: scan.todoCount,
      eslintDisableCount: scan.eslintDisableCount,
      longFunctionCount: scan.longFunctionCount,
      longFileCount: scan.longFileCount,
      consoleLogCount: scan.consoleLogCount,
    };
  } else if (subCommand === "gate") {
    if (args.length === 0) {
      console.error("[fowler] gate requires a commit SHA (or HEAD)");
      process.exit(1);
    }
    const verdict = cmdGate(args[0]);
    output = formatGate(verdict);
    findingsForDb = {
      subCommand: "gate",
      incremental: verdict.incremental,
      reversible: verdict.reversible,
      debtAdded: verdict.debtAdded,
      designDrift: verdict.designDrift,
      overall: verdict.overall,
      findingCount: verdict.findings.length,
    };
    exitCode = verdict.overall === "fail" ? 1 : 0;
  } else {
    // Default: bare commit SHA → gate
    const commitSha = args[0];
    const verdict = cmdGate(commitSha);
    output = formatGate(verdict);
    findingsForDb = {
      subCommand: "gate",
      commitSha,
      incremental: verdict.incremental,
      reversible: verdict.reversible,
      debtAdded: verdict.debtAdded,
      designDrift: verdict.designDrift,
      overall: verdict.overall,
      findingCount: verdict.findings.length,
    };
    exitCode = verdict.overall === "fail" ? 1 : 0;
  }

  // Always print real output
  console.log(output);

  // Try DB logging if available
  const db = await getDbConnections();

  if (!db) {
    console.log("\n[fowler] ⚠️  Database connections not configured");
    console.log("[fowler] Analysis complete — results shown above (no DB logging)");
    console.log("[fowler] Set POSTGRES_URL and NEO4J_URI to log findings");
    process.exit(exitCode);
  }

  try {
    // Log analysis start
    await logToPostgres(db, "refactor_analysis_started", {
      ...findingsForDb,
      agent: AGENT_ID,
    });

    // Create insight in Neo4j
    const confidence = findingsForDb.overall === "fail" ? 0.92 :
                        findingsForDb.overall === "warn" ? 0.80 : 0.85;
    const summary = `Fowler refactor gate (${findingsForDb.subCommand}): ${JSON.stringify(findingsForDb)}`;
    await createInsight(db, summary, confidence, "agent_review");

    // Log analysis completion
    await logToPostgres(db, "refactor_analysis_completed", {
      ...findingsForDb,
      confidence,
    });

    console.log("\n[fowler] ✅ Analysis logged to PostgreSQL and Neo4j");
  } catch (error) {
    console.error("\n[fowler] DB logging failed:", error);
    // Don't change exit code — the analysis output is still valid
  } finally {
    await db.neo4jSession.close();
    await db.closeDriver();
    await db.closePool();
  }

  process.exit(exitCode);
}

main();
