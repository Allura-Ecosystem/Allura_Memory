#!/usr/bin/env bun
/**
 * Agent: Knuth (Deep Analysis)
 * Manifest ID: knuth
 * CI Route: push → knuth-analyze
 * See: src/lib/agents/agent-manifest.ts
 *
 * Performs deep code analysis: complexity scoring, architectural layer
 * classification, boundary violation detection, and circular dependency checks.
 * Routes from push events → Knuth (Deep Worker)
 *
 * Sub-commands:
 *   analyze <commit_sha>  Deep analysis of a commit (complexity, layers, deps)
 *   complexity <path>     Standalone complexity analysis of a file/directory
 *   layers                Architectural layer map of the entire source tree
 *   <commit_sha>         Default: analyze (backward compatible)
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

interface FunctionComplexity {
  name: string;
  startLine: number;
  endLine: number;
  lines: number;
  nestingDepth: number;
  branchCount: number;
  cyclomaticComplexity: number;
}

interface FileComplexityResult {
  path: string;
  lines: number;
  functionCount: number;
  totalBranches: number;
  maxNesting: number;
  functions: FunctionComplexity[];
  totalComplexity: number;
}

interface ChangedFileAnalysis {
  path: string;
  layer: ArchitecturalLayer;
  complexity: FileComplexityResult;
  imports: string[];
  layerViolations: Finding[];
  circularDeps: Finding[];
}

interface CommitAnalysis {
  commitSha: string;
  changedFiles: ChangedFileAnalysis[];
  findings: Finding[];
  summary: {
    totalFiles: number;
    highestComplexityFile: string;
    highestComplexity: number;
    layerViolations: number;
    circularDeps: number;
  };
}

interface LayerMap {
  files: Map<ArchitecturalLayer, string[]>;
  crossLayerImports: Array<{
    from: string;
    fromLayer: ArchitecturalLayer;
    to: string;
    toLayer: ArchitecturalLayer;
  }>;
  emptyLayers: ArchitecturalLayer[];
  totalFiles: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "knuth";

const SUBCOMMANDS = ["analyze", "complexity", "layers"] as const;
type SubCommand = (typeof SUBCOMMANDS)[number];

type ArchitecturalLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "unknown";

const LAYER_NAMES: Record<ArchitecturalLayer, string> = {
  L1: "RuVix ControlPlane",
  L2: "Data Layer",
  L3: "Agent Runtime",
  L4: "Workflow/API",
  L5: "UI",
  unknown: "Unclassified",
};

const LAYER_ORDER: Record<ArchitecturalLayer, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
  unknown: 0,
};

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

const MAX_FUNCTION_COMPLEXITY = 10;
const MAX_FILE_COMPLEXITY = 50;

// ── Layer Classification Rules ────────────────────────────────────────────────

/**
 * Classify a file path into the 5-layer Allura architecture model.
 *
 * L1: src/control-plane/ (RuVix ControlPlane)
 * L2: src/lib/postgres/, src/lib/neo4j/, src/lib/ruvector/ (Data Layer)
 * L3: src/mcp/, src/lib/agents/, src/lib/config/ (Agent Runtime)
 * L4: src/app/api/, src/lib/memory/ (Workflow/API)
 * L5: src/app/ (excluding api/), src/components/, src/lib/ui/ (UI)
 */
function classifyLayer(filePath: string): ArchitecturalLayer {
  const rel = filePath.startsWith("/") ? relative(ROOT_DIR, filePath) : filePath;
  const normalized = rel.replace(/\\/g, "/");

  // L1: ControlPlane
  if (normalized.startsWith("src/control-plane/")) return "L1";

  // L2: Data Layer (must check before L4/L5 since lib/postgres etc. are under src/lib/)
  if (
    normalized.startsWith("src/lib/postgres/") ||
    normalized.startsWith("src/lib/neo4j/") ||
    normalized.startsWith("src/lib/ruvector/")
  ) {
    return "L2";
  }

  // L3: Agent Runtime
  if (
    normalized.startsWith("src/mcp/") ||
    normalized.startsWith("src/lib/agents/") ||
    normalized.startsWith("src/lib/config/")
  ) {
    return "L3";
  }

  // L4: Workflow/API (api routes, memory/curator workflows)
  if (
    normalized.startsWith("src/app/api/") ||
    normalized.startsWith("src/lib/memory/") ||
    normalized.startsWith("src/lib/curator/")
  ) {
    return "L4";
  }

  // L5: UI (pages, components, hooks, styles)
  if (
    normalized.startsWith("src/app/") && !normalized.startsWith("src/app/api/") ||
    normalized.startsWith("src/components/") ||
    normalized.startsWith("src/lib/ui/") ||
    normalized.startsWith("src/hooks/") ||
    normalized.startsWith("src/styles/")
  ) {
    return "L5";
  }

  return "unknown";
}

/**
 * Check if a cross-layer import is a violation.
 * Adjacent layers are allowed. Non-adjacent layers are violations.
 * L5 → L1 is always a violation (UI reaching into controlPlane).
 */
function isLayerViolation(
  fromLayer: ArchitecturalLayer,
  toLayer: ArchitecturalLayer,
): boolean {
  if (fromLayer === "unknown" || toLayer === "unknown") return false;
  if (fromLayer === toLayer) return false;

  const fromOrder = LAYER_ORDER[fromLayer];
  const toOrder = LAYER_ORDER[toLayer];
  const distance = Math.abs(fromOrder - toOrder);

  // Non-adjacent layers = violation (distance > 1)
  return distance > 1;
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

  // Backward compatible: bare arg (commit SHA) → analyze
  return { subCommand: null, args: argv };
}

// ── Utility Functions ────────────────────────────────────────────────────────

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
  return ext === ".ts" || ext === ".tsx";
}

function relPath(absPath: string): string {
  return relative(ROOT_DIR, absPath);
}

function fmtLocation(file: string, line: number): string {
  return `${file}:${line}`;
}

// ── Complexity Analysis (Fowler-style) ───────────────────────────────────────

/**
 * Count branches in a function body: if, for, while, switch/case, catch, ternary.
 * Reuses the same approach as fowler-refactor-gate.
 */
function countBranches(body: string): number {
  let count = 0;

  // if, else if
  const ifMatches = body.match(/\bif\s*\(/g);
  count += ifMatches ? ifMatches.length : 0;

  // else if — already counted by `if`, adjust
  const elseIfMatches = body.match(/\belse\s+if\s*\(/g);
  if (elseIfMatches) {
    count -= elseIfMatches.length;
    count += elseIfMatches.length;
  }

  // for (including for...of, for...in)
  const forMatches = body.match(/\bfor\s*\(/g);
  count += forMatches ? forMatches.length : 0;

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

/**
 * Count max nesting depth within a function body.
 */
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

  // Subtract 1: the function body's own braces count as depth 1
  return Math.max(0, maxDepth - 1);
}

/**
 * Extract functions from source code using regex + brace counting.
 */
function extractFunctions(content: string): FunctionComplexity[] {
  const results: FunctionComplexity[] = [];

  const funcStartRe =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+|<[^>]+>)\s*[<(]|^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?\(|^\s*(?:public|private|protected|readonly)\s+(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*[<(]/gm;

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
    if (funcName.startsWith("<")) continue;
    if (JS_KEYWORDS.has(funcName)) continue;

    const startLine = content.substring(0, match.index).split("\n").length;

    const fromIndex = match.index;
    const afterMatch = content.substring(fromIndex);
    const braceOffset = afterMatch.indexOf("{");
    if (braceOffset === -1) continue;

    const bodyStart = fromIndex + braceOffset;

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
    const body = content.substring(bodyStart, endIdx + 1);

    const nestingDepth = countMaxNesting(body);
    const branchCount = countBranches(body);
    const cyclomaticComplexity = branchCount + 1; // M = branches + 1 per function

    results.push({
      name: funcName,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      nestingDepth,
      branchCount,
      cyclomaticComplexity,
    });
  }

  return results;
}

/**
 * Analyze a single file for complexity metrics.
 */
function analyzeFileComplexity(filePath: string): FileComplexityResult {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return {
      path: relPath(filePath),
      lines: 0,
      functionCount: 0,
      totalBranches: 0,
      maxNesting: 0,
      functions: [],
      totalComplexity: 0,
    };
  }

  const lines = content.split("\n");
  const functions = extractFunctions(content);
  const totalBranches = functions.reduce((sum, fn) => sum + fn.branchCount, 0);
  const maxNesting = functions.reduce((max, fn) => Math.max(max, fn.nestingDepth), 0);
  const totalComplexity = functions.reduce((sum, fn) => sum + fn.cyclomaticComplexity, 0);

  return {
    path: relPath(filePath),
    lines: lines.length,
    functionCount: functions.length,
    totalBranches,
    maxNesting,
    functions,
    totalComplexity,
  };
}

// ── Import Analysis ──────────────────────────────────────────────────────────

/**
 * Extract import paths from a source file.
 * Matches: import ... from '...', require('...'), import('...')
 */
function extractImports(filePath: string): string[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const imports: Set<string> = new Set();

  // import ... from 'module' or import ... from "@/path"
  const importFromRe = /(?:import\s+(?:type\s+)?(?:[^;]*?)\s+from\s+|import\s+(?:type\s+)?)['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importFromRe.exec(content)) !== null) {
    imports.add(match[1]);
  }

  // require('module')
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(content)) !== null) {
    imports.add(match[1]);
  }

  // dynamic import('module')
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRe.exec(content)) !== null) {
    imports.add(match[1]);
  }

  return Array.from(imports);
}

/**
 * Resolve an import specifier to a file path for layer analysis.
 * Only resolves alias (@/...) and relative paths. External packages are ignored.
 */
function resolveImportSpecifier(
  specifier: string,
  fromFile: string,
): string | null {
  // Skip external packages (node_modules, non-path imports)
  if (
    !specifier.startsWith(".") &&
    !specifier.startsWith("@/") &&
    !specifier.startsWith("/")
  ) {
    // External package — no layer classification possible
    return null;
  }

  // Handle @/ alias → src/
  if (specifier.startsWith("@/")) {
    const srcPath = specifier.replace(/^@\//, "src/");
    // Try common extensions
    const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
    for (const ext of extensions) {
      const candidate = join(ROOT_DIR, srcPath + ext);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return join(ROOT_DIR, srcPath);
  }

  // Handle relative imports
  if (specifier.startsWith(".")) {
    const dir = join(fromFile, "..");
    const resolved = join(dir, specifier);
    const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return resolved;
  }

  return null;
}

/**
 * Check for circular dependencies between a set of files.
 * Returns pairs where A imports B and B imports A.
 */
function findCircularDeps(
  fileImports: Map<string, string[]>,
): Array<{ fileA: string; fileB: string }> {
  const circles: Array<{ fileA: string; fileB: string }> = [];
  const seen = new Set<string>();

  for (const fileA of Array.from(fileImports.keys())) {
    const importsA = fileImports.get(fileA)!;
    for (const importSpec of importsA) {
      const resolvedB = resolveImportSpecifier(importSpec, fileA);
      if (!resolvedB) continue;

      const importsB = fileImports.get(resolvedB);
      if (!importsB) continue;

      // Check if B imports A
      const normalizedName = relPath(fileA);
      const reverseImport = importsB.some((spec) => {
        const resolved = resolveImportSpecifier(spec, resolvedB);
        if (!resolved) return false;
        return relPath(resolved) === normalizedName;
      });

      if (reverseImport) {
        // Canonical key to avoid duplicates
        const key = [normalizedName, relPath(resolvedB)].sort().join("<->");
        if (!seen.has(key)) {
          seen.add(key);
          circles.push({ fileA: normalizedName, fileB: relPath(resolvedB) });
        }
      }
    }
  }

  return circles;
}

// ── Git Operations ──────────────────────────────────────────────────────────

/**
 * Get the list of files changed in a commit using git diff-tree.
 */
function getChangedFiles(commitSha: string): string[] {
  let output: string;
  try {
    // Resolve HEAD to actual SHA if needed
    const resolvedSha = gitExec(
      ["rev-parse", commitSha],
      { cwd: ROOT_DIR },
    ).trim();

    output = gitExec(
      ["diff-tree", "--no-commit-id", "-r", resolvedSha],
      { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    // Try alternative: for initial commits or shallow clones
    try {
      output = gitExec(
        ["diff-tree", "--no-commit-id", "-r", commitSha],
        { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch {
      console.error(`[knuth] Cannot get changed files for ${commitSha}. Is it a valid commit?`);
      process.exit(1);
    }
  }

  const files: string[] = [];
  for (const line of output.trim().split("\n")) {
    if (!line.trim()) continue;

    // git diff-tree output format: :oldmode newmode oldsha newsha status\tfilepath
    const tabIdx = line.indexOf("\t");
    if (tabIdx === -1) continue;

    const filePath = line.substring(tabIdx + 1).trim();
    if (filePath) {
      files.push(join(ROOT_DIR, filePath));
    }
  }

  return files;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: analyze — Deep analysis of a commit
// ══════════════════════════════════════════════════════════════════════════════

function cmdAnalyze(commitSha: string): CommitAnalysis {
  const changedFilePaths = getChangedFiles(commitSha);
  const changedFiles: ChangedFileAnalysis[] = [];
  const allFindings: Finding[] = [];

  // Track imports across changed files for circular dep detection
  const fileImportsMap = new Map<string, string[]>();

  for (const filePath of changedFilePaths) {
    const rel = relPath(filePath);

    if (!isAnalyzableFile(filePath)) continue;

    const layer = classifyLayer(rel);
    const complexity = analyzeFileComplexity(filePath);
    const imports = extractImports(filePath);
    const layerViolations: Finding[] = [];

    // Check layer boundary violations
    const fromLayer = layer;
    for (const importSpec of imports) {
      const resolvedPath = resolveImportSpecifier(importSpec, filePath);
      if (!resolvedPath) continue;

      const toLayer = classifyLayer(resolvedPath);
      if (isLayerViolation(fromLayer, toLayer)) {
        layerViolations.push({
          severity: "fail",
          category: "layer-violation",
          message: `${LAYER_NAMES[fromLayer]} (${fromLayer}) imports from ${LAYER_NAMES[toLayer]} (${toLayer}) — non-adjacent layer access`,
          location: fmtLocation(rel, 1),
        });
      }
    }

    // Flag high-complexity functions
    for (const fn of complexity.functions) {
      if (fn.cyclomaticComplexity > MAX_FUNCTION_COMPLEXITY) {
        allFindings.push({
          severity: fn.cyclomaticComplexity > MAX_FUNCTION_COMPLEXITY * 2 ? "fail" : "warn",
          category: "complexity",
          message: `function \`${fn.name}\` has cyclomatic complexity ${fn.cyclomaticComplexity} (threshold: ${MAX_FUNCTION_COMPLEXITY})`,
          location: fmtLocation(rel, fn.startLine),
        });
      }
    }

    // Flag high total file complexity
    if (complexity.totalComplexity > MAX_FILE_COMPLEXITY) {
      allFindings.push({
        severity: complexity.totalComplexity > MAX_FILE_COMPLEXITY * 2 ? "fail" : "warn",
        category: "file-complexity",
        message: `file has total complexity ${complexity.totalComplexity} (threshold: ${MAX_FILE_COMPLEXITY})`,
        location: fmtLocation(rel, 1),
      });
    }

    changedFiles.push({
      path: rel,
      layer,
      complexity,
      imports,
      layerViolations,
      circularDeps: [], // populated below
    });

    allFindings.push(...layerViolations);

    // Store for circular dep analysis
    fileImportsMap.set(filePath, imports);
  }

  // Detect circular dependencies among changed files
  const circularDeps = findCircularDeps(fileImportsMap);
  for (const circ of circularDeps) {
    const finding: Finding = {
      severity: "fail",
      category: "circular-dependency",
      message: `circular dependency: ${circ.fileA} ↔ ${circ.fileB}`,
      location: circ.fileA,
    };
    allFindings.push(finding);

    // Attach to relevant files
    for (const cf of changedFiles) {
      if (cf.path === circ.fileA || cf.path === circ.fileB) {
        cf.circularDeps.push(finding);
      }
    }
  }

  // Build summary
  let highestComplexityFile = "(none)";
  let highestComplexity = 0;
  for (const cf of changedFiles) {
    if (cf.complexity.totalComplexity > highestComplexity) {
      highestComplexity = cf.complexity.totalComplexity;
      highestComplexityFile = cf.path;
    }
  }

  const layerViolationCount = allFindings.filter(
    (f) => f.category === "layer-violation",
  ).length;
  const circularDepCount = allFindings.filter(
    (f) => f.category === "circular-dependency",
  ).length;

  return {
    commitSha,
    changedFiles,
    findings: allFindings,
    summary: {
      totalFiles: changedFiles.length,
      highestComplexityFile,
      highestComplexity,
      layerViolations: layerViolationCount,
      circularDeps: circularDepCount,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: complexity — Standalone complexity analysis
// ══════════════════════════════════════════════════════════════════════════════

function cmdComplexity(targetPath: string): {
  results: FileComplexityResult[];
  findings: Finding[];
} {
  const absPath = join(ROOT_DIR, targetPath);

  if (!existsSync(absPath)) {
    console.error(`[knuth] Path not found: ${targetPath}`);
    process.exit(1);
  }

  const stat = statSync(absPath);
  const results: FileComplexityResult[] = [];
  const findings: Finding[] = [];

  const files: string[] = stat.isDirectory()
    ? walkDir(absPath).filter(isAnalyzableFile)
    : [absPath];

  for (const fp of files) {
    const result = analyzeFileComplexity(fp);
    results.push(result);

    // Flag high-complexity functions
    for (const fn of result.functions) {
      if (fn.cyclomaticComplexity > MAX_FUNCTION_COMPLEXITY) {
        findings.push({
          severity: fn.cyclomaticComplexity > MAX_FUNCTION_COMPLEXITY * 2 ? "fail" : "warn",
          category: "complexity",
          message: `function \`${fn.name}\` has cyclomatic complexity ${fn.cyclomaticComplexity} (threshold: ${MAX_FUNCTION_COMPLEXITY})`,
          location: fmtLocation(result.path, fn.startLine),
        });
      }
    }

    // Flag high total file complexity
    if (result.totalComplexity > MAX_FILE_COMPLEXITY) {
      findings.push({
        severity: result.totalComplexity > MAX_FILE_COMPLEXITY * 2 ? "fail" : "warn",
        category: "file-complexity",
        message: `file has total complexity ${result.totalComplexity} (threshold: ${MAX_FILE_COMPLEXITY})`,
        location: fmtLocation(result.path, 1),
      });
    }
  }

  return { results, findings };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: layers — Architectural layer map
// ══════════════════════════════════════════════════════════════════════════════

function cmdLayers(): LayerMap {
  const srcDir = join(ROOT_DIR, "src");
  if (!existsSync(srcDir)) {
    console.error("[knuth] src/ directory not found");
    process.exit(1);
  }

  const allFiles = walkDir(srcDir).filter(isAnalyzableFile);
  const files = new Map<ArchitecturalLayer, string[]>();
  const crossLayerImports: LayerMap["crossLayerImports"] = [];

  // Initialize all layers
  for (const layer of ["L1", "L2", "L3", "L4", "L5"] as ArchitecturalLayer[]) {
    files.set(layer, []);
  }
  files.set("unknown", []);

  // Classify files
  for (const fp of allFiles) {
    const rel = relPath(fp);
    const layer = classifyLayer(rel);
    files.get(layer)!.push(rel);
  }

  // Check cross-layer imports
  for (const fp of allFiles) {
    const rel = relPath(fp);
    const fromLayer = classifyLayer(rel);
    const imports = extractImports(fp);

    for (const importSpec of imports) {
      const resolvedPath = resolveImportSpecifier(importSpec, fp);
      if (!resolvedPath) continue;

      const toLayer = classifyLayer(resolvedPath);
      if (fromLayer !== toLayer && fromLayer !== "unknown" && toLayer !== "unknown") {
        crossLayerImports.push({
          from: rel,
          fromLayer,
          to: relPath(resolvedPath),
          toLayer,
        });
      }
    }
  }

  // Find empty layers
  const emptyLayers: ArchitecturalLayer[] = [];
  for (const layer of ["L1", "L2", "L3", "L4", "L5"] as ArchitecturalLayer[]) {
    const fileList = files.get(layer) ?? [];
    if (fileList.length === 0) {
      emptyLayers.push(layer);
    }
  }

  const totalFiles = allFiles.length;

  return { files, crossLayerImports, emptyLayers, totalFiles };
}

// ══════════════════════════════════════════════════════════════════════════════
// Formatting helpers
// ══════════════════════════════════════════════════════════════════════════════

const SEV_ICON: Record<Severity, string> = {
  pass: "\u{1F7E2}",  // 🟢
  warn: "\u{1F7E1}",  // 🟡
  fail: "\u{1F534}",  // 🔴
};

function sevIcon(s: Severity): string {
  return SEV_ICON[s];
}

function complexityIcon(complexity: number): string {
  if (complexity > MAX_FUNCTION_COMPLEXITY * 2) return "🔴";
  if (complexity > MAX_FUNCTION_COMPLEXITY) return "🟡";
  return "🟢";
}

function formatAnalyze(analysis: CommitAnalysis): string {
  const lines: string[] = [];
  lines.push("[knuth] ═══════════════════════════════════════════════════");
  lines.push("[knuth]       DEEP ANALYSIS REPORT");
  lines.push("[knuth] ═══════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Commit: ${analysis.commitSha}`);
  lines.push(`Changed source files: ${analysis.summary.totalFiles}`);
  lines.push("");

  if (analysis.changedFiles.length > 0) {
    lines.push("File Analysis:");
    lines.push("──────────────────────────────────────────────────────");
    for (const cf of analysis.changedFiles) {
      const sev = cf.layerViolations.length > 0 || cf.circularDeps.length > 0
        ? "🔴"
        : cf.complexity.totalComplexity > MAX_FILE_COMPLEXITY
          ? "🟡"
          : "🟢";

      lines.push(
        `  ${sev} ${cf.path} [${cf.layer}] — ` +
        `complexity ${cf.complexity.totalComplexity}, ` +
        `${cf.complexity.functionCount} functions, ` +
        `${cf.complexity.totalBranches} branches`,
      );

      // Show function-level details
      for (const fn of cf.complexity.functions) {
        const fnSev = complexityIcon(fn.cyclomaticComplexity);
        lines.push(
          `    ${fnSev} \`${fn.name}\` M=${fn.cyclomaticComplexity} ` +
          `(${fn.branchCount} branches, depth ${fn.nestingDepth}, ${fn.lines}L) → :${fn.startLine}`,
        );
      }

      // Show layer violations
      for (const v of cf.layerViolations) {
        lines.push(`    🔴 [layer-violation] ${v.message}`);
      }

      // Show circular deps
      for (const c of cf.circularDeps) {
        lines.push(`    🔴 [circular-dep] ${c.message}`);
      }
    }
    lines.push("");
  }

  // Summary
  lines.push("Summary:");
  lines.push("──────────────────────────────────────────────────────");
  lines.push(`  Total changed files: ${analysis.summary.totalFiles}`);
  lines.push(
    `  Highest complexity: ${analysis.summary.highestComplexityFile} ` +
    `(M=${analysis.summary.highestComplexity})`,
  );
  lines.push(`  Layer violations: ${analysis.summary.layerViolations}`);
  lines.push(`  Circular dependencies: ${analysis.summary.circularDeps}`);
  lines.push("");

  if (analysis.findings.length > 0) {
    lines.push("All Findings:");
    lines.push("──────────────────────────────────────────────────────");
    for (const f of analysis.findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 No findings — commit is clean");
  }

  return lines.join("\n");
}

function formatComplexity(
  results: FileComplexityResult[],
  findings: Finding[],
): string {
  const lines: string[] = [];
  lines.push("[knuth] ══ COMPLEXITY ANALYSIS ═══════════════════════════");
  lines.push("");

  for (const result of results) {
    const fileSev = result.totalComplexity > MAX_FILE_COMPLEXITY * 2 ? "🔴"
      : result.totalComplexity > MAX_FILE_COMPLEXITY ? "🟡"
      : "🟢";

    lines.push(`  ${fileSev} ${result.path}`);
    lines.push(`     Lines: ${result.lines} | Functions: ${result.functionCount} | ` +
      `Total complexity: M=${result.totalComplexity} | ` +
      `Branches: ${result.totalBranches} | Max nesting: ${result.maxNesting}`);

    for (const fn of result.functions) {
      const fnSev = complexityIcon(fn.cyclomaticComplexity);
      lines.push(
        `    ${fnSev} \`${fn.name}\` — M=${fn.cyclomaticComplexity} ` +
        `(${fn.branchCount} branches, depth ${fn.nestingDepth}, ${fn.lines}L) → :${fn.startLine}`,
      );
    }
    lines.push("");
  }

  if (findings.length > 0) {
    lines.push("Findings:");
    lines.push("──────────────────────────────────────────────────────");
    for (const f of findings) {
      lines.push(`  ${sevIcon(f.severity)} [${f.category}] ${f.message} → ${f.location}`);
    }
  } else {
    lines.push("🟢 All functions within complexity thresholds");
  }

  return lines.join("\n");
}

function formatLayers(layerMap: LayerMap): string {
  const lines: string[] = [];
  lines.push("[knuth] ══ ARCHITECTURAL LAYER MAP ═══════════════════════");
  lines.push("");
  lines.push(`Total source files: ${layerMap.totalFiles}`);
  lines.push("");

  // Layer summary
  lines.push("Layer Distribution:");
  lines.push("──────────────────────────────────────────────────────");
  for (const layer of ["L1", "L2", "L3", "L4", "L5"] as ArchitecturalLayer[]) {
    const fileList = layerMap.files.get(layer) ?? [];
    const empty = fileList.length === 0;
    const sev = empty ? "🔴" : "🟢";
    lines.push(`  ${sev} ${layer} — ${LAYER_NAMES[layer]} (${fileList.length} files)`);
    if (empty) {
      lines.push(`     ⚠  GAP: No files in this layer`);
    }
    // Show file list (capped)
    for (const fp of fileList.slice(0, 15)) {
      lines.push(`     ${fp}`);
    }
    if (fileList.length > 15) {
      lines.push(`     ... and ${fileList.length - 15} more`);
    }
  }

  // Unknown classification
  const unknownFiles = layerMap.files.get("unknown") ?? [];
  if (unknownFiles.length > 0) {
    lines.push("");
    lines.push(`  ℹ️  Unclassified (${unknownFiles.length} files)`);
    for (const fp of unknownFiles.slice(0, 10)) {
      lines.push(`     ${fp}`);
    }
    if (unknownFiles.length > 10) {
      lines.push(`     ... and ${unknownFiles.length - 10} more`);
    }
  }

  // Empty layers warning
  if (layerMap.emptyLayers.length > 0) {
    lines.push("");
    lines.push("🔴 Layer Gaps:");
    for (const layer of layerMap.emptyLayers) {
      lines.push(`  ${layer} (${LAYER_NAMES[layer]}) has 0 files — architectural gap`);
    }
  }

  // Cross-layer imports
  lines.push("");
  lines.push("Cross-Layer Imports:");
  lines.push("──────────────────────────────────────────────────────");

  if (layerMap.crossLayerImports.length === 0) {
    lines.push("  🟢 No cross-layer imports found");
  } else {
    // Group by violation severity
    const violations = layerMap.crossLayerImports.filter(
      (i) => isLayerViolation(i.fromLayer, i.toLayer),
    );
    const adjacent = layerMap.crossLayerImports.filter(
      (i) => !isLayerViolation(i.fromLayer, i.toLayer),
    );

    if (violations.length > 0) {
      lines.push(`  🔴 Layer Violations (${violations.length}) — non-adjacent layer access:`);
      for (const v of violations.slice(0, 20)) {
        lines.push(
          `    ${v.from} [${v.fromLayer}] → ${v.to} [${v.toLayer}]`,
        );
      }
      if (violations.length > 20) {
        lines.push(`    ... and ${violations.length - 20} more`);
      }
    }

    if (adjacent.length > 0) {
      lines.push(`  🟡 Adjacent Layer Imports (${adjacent.length}) — allowed but track:`);
      for (const a of adjacent.slice(0, 20)) {
        lines.push(
          `    ${a.from} [${a.fromLayer}] → ${a.to} [${a.toLayer}]`,
        );
      }
      if (adjacent.length > 20) {
        lines.push(`    ... and ${adjacent.length - 20} more`);
      }
    }
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// DB Logging (same pattern as fowler/scout)
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
  const neo4jUri: string | null = null;

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
      insight_id: 'ins_analysis_' + randomUUID(),
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
    console.log("[knuth] Knuth — Deep Analysis Agent");
    console.log("");
    console.log("Usage:");
    console.log("  bun scripts/agents/knuth-analyze.ts analyze <sha>  Deep analysis of a commit");
    console.log("  bun scripts/agents/knuth-analyze.ts complexity <path> Standalone complexity analysis");
    console.log("  bun scripts/agents/knuth-analyze.ts layers            Architectural layer map");
    console.log("  bun scripts/agents/knuth-analyze.ts <sha>            Default: analyze");
    process.exit(0);
  }

  console.log("[knuth] Starting deep analysis...");
  console.log(`[knuth] Command: ${subCommand || "analyze"}`);
  if (args.length > 0) {
    console.log(`[knuth] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Execute the sub-command — always real analysis
  let output: string;
  let findingsForDb: Record<string, unknown>;
  let exitCode = 0;

  if (subCommand === "analyze") {
    if (args.length === 0) {
      console.error("[knuth] analyze requires a commit SHA (or HEAD)");
      process.exit(1);
    }
    const result = cmdAnalyze(args[0]);
    output = formatAnalyze(result);
    findingsForDb = {
      subCommand: "analyze",
      commitSha: result.commitSha,
      totalFiles: result.summary.totalFiles,
      highestComplexity: result.summary.highestComplexity,
      highestComplexityFile: result.summary.highestComplexityFile,
      layerViolations: result.summary.layerViolations,
      circularDeps: result.summary.circularDeps,
      findingCount: result.findings.length,
    };
    exitCode = result.findings.some((f) => f.severity === "fail") ? 1 : 0;
  } else if (subCommand === "complexity") {
    if (args.length === 0) {
      console.error("[knuth] complexity requires a file or directory path");
      process.exit(1);
    }
    const { results, findings } = cmdComplexity(args[0]);
    output = formatComplexity(results, findings);
    findingsForDb = {
      subCommand: "complexity",
      target: args[0],
      fileCount: results.length,
      totalComplexity: results.reduce((s, r) => s + r.totalComplexity, 0),
      findingCount: findings.length,
    };
    exitCode = findings.some((f) => f.severity === "fail") ? 1 : 0;
  } else if (subCommand === "layers") {
    const result = cmdLayers();
    output = formatLayers(result);
    const violationCount = result.crossLayerImports.filter(
      (i) => isLayerViolation(i.fromLayer, i.toLayer),
    ).length;
    findingsForDb = {
      subCommand: "layers",
      totalFiles: result.totalFiles,
      emptyLayers: result.emptyLayers,
      crossLayerImports: result.crossLayerImports.length,
      violations: violationCount,
    };
    exitCode = violationCount > 0 ? 1 : 0;
  } else {
    // Default: bare commit SHA → analyze
    const commitSha = args[0];
    const result = cmdAnalyze(commitSha);
    output = formatAnalyze(result);
    findingsForDb = {
      subCommand: "analyze",
      commitSha,
      totalFiles: result.summary.totalFiles,
      highestComplexity: result.summary.highestComplexity,
      highestComplexityFile: result.summary.highestComplexityFile,
      layerViolations: result.summary.layerViolations,
      circularDeps: result.summary.circularDeps,
      findingCount: result.findings.length,
    };
    exitCode = result.findings.some((f) => f.severity === "fail") ? 1 : 0;
  }

  // Always print real output
  console.log(output);

  // Try DB logging if available
  const db = await getDbConnections();

  if (!db) {
    console.log("\n[knuth] \u26A0\uFE0F  Database connections not configured");
    console.log("[knuth] Analysis complete \u2014 results shown above (no DB logging)");
    console.log("[knuth] Set POSTGRES_URL and NEO4J_URI to log findings");
    process.exit(exitCode);
  }

  try {
    // Log analysis start
    await logToPostgres(db, "deep_analysis_started", {
      ...findingsForDb,
      agent: AGENT_ID,
    });

    // Create insight in Neo4j
    const confidence = findingsForDb.findingCount
      ? ((findingsForDb.findingCount as number) > 5 ? 0.92 : 0.80)
      : 0.85;
    const summary = `Knuth deep analysis (${findingsForDb.subCommand}): ${JSON.stringify(findingsForDb)}`;
    await createInsight(db, summary, confidence, "agent_analysis");

    // Log analysis completion
    await logToPostgres(db, "deep_analysis_completed", {
      ...findingsForDb,
      confidence,
    });

    console.log("\n[knuth] \u2705 Analysis logged to PostgreSQL and Neo4j");
  } catch (error) {
    console.error("\n[knuth] DB logging failed:", error);
    // Don't change exit code — the analysis output is still valid
  } finally {
    await db.neo4jSession.close();
    await db.closeDriver();
    await db.closePool();
  }

  process.exit(exitCode);
}

main();
