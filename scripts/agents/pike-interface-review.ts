#!/usr/bin/env bun
/**
 * Agent: Pike (Interface Review)
 * Manifest ID: pike
 * CI Route: pull_request → pike-interface-review
 * See: src/lib/agents/agent-manifest.ts
 *
 * Reviews interface surface area, naming conventions, API ergonomics,
 * breaking changes, and canonical contract compliance.
 * Routes from GitHub webhook → Pike (Interface Gate)
 *
 * Sub-commands:
 *   review <path>           Interface review of changed files (default)
 *   breaking <base>..<head> Compare API surface between two git refs
 *   surface <dir>           Module surface analysis with quality scoring
 *   canonical               Check canonical memory interface compliance
 *   <path>                  Default: review (backward compatible)
 *
 * Gracefully handles missing DB connections (for CI environments).
 * When no DB, produces real analysis — the analysis is the value, DB is just logging.
 */

import { execSync } from "node:child_process";
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
  paramNames: string[];
  hasAnyReturnType: boolean;
  hasOptionalBeforeRequired: boolean;
  hasBooleanParam: boolean;
  returnsPromise: boolean;
}

interface ModuleScore {
  path: string;
  exports: ExportInfo[];
  findings: Finding[];
  score: number; // 0-10
}

interface ApiExport {
  name: string;
  kind: ExportInfo["kind"];
  signature: string;
  line: number;
  location?: string;
}

interface BreakingChange {
  type: "removed" | "signature-changed" | "return-type-changed" | "param-type-changed" | "added";
  severity: Severity;
  name: string;
  detail: string;
  location: string;
}

interface CanonicalCheck {
  operation: string;
  contractSignature: string;
  mcpSignature: string;
  restSignature: string;
  findings: Finding[];
  drift: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "pike";

const SUBCOMMANDS = ["review", "check", "breaking", "surface", "canonical"] as const;
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
const MAX_PARAM_COUNT = 4;

// Regex: PascalCase for types/interfaces/classes
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
// Regex: camelCase for functions/consts
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/;

// Canonical memory operations
const CANONICAL_OPS = [
  "memory_add",
  "memory_search",
  "memory_get",
  "memory_list",
  "memory_delete",
] as const;

// Canonical contract file paths
const CANONICAL_CONTRACTS_PATH = "src/lib/memory/canonical-contracts.ts";
const CANONICAL_TOOLS_PATH = "src/mcp/canonical-tools.ts";
const REST_API_ROUTE_PATH = "src/app/api/memory/route.ts";

// ── Formatting helpers ──────────────────────────────────────────────────────

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

// ── Arg Parsing ─────────────────────────────────────────────────────────────

function parseArgs(): { subCommand: SubCommand | null; args: string[] } {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    return { subCommand: null, args: [] };
  }

  const first = argv[0];
  if (SUBCOMMANDS.includes(first as SubCommand)) {
    return { subCommand: first as SubCommand, args: argv.slice(1) };
  }

  // Backward compatible: bare path → review
  return { subCommand: null, args: argv };
}

// ── Utility: Walk directory tree ────────────────────────────────────────────

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
  return ext === ".ts" || ext === ".tsx";
}

function isAnalyzableFile(filePath: string): boolean {
  const ext = extname(filePath);
  if (BINARY_EXTS.has(ext)) return false;
  if (IGNORED_FILES.has(basename(filePath))) return false;
  return ext === ".ts" || ext === ".tsx";
}

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

// ── Export Detection ────────────────────────────────────────────────────────

/**
 * Detect all exports in a file with interface-quality analysis.
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

  // Track JSDoc blocks
  const jsdocLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.endsWith("*/")) {
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        if (lines[j].trim().startsWith("/**") || lines[j].trim() === "/**") {
          for (let k = j; k <= i; k++) jsdocLines.add(k);
          break;
        }
        if (lines[j].trim() === "*/" && j !== i) break;
      }
    }
  }

  // Regex patterns for export kinds
  const patterns: Array<{
    re: RegExp;
    kind: ExportInfo["kind"];
  }> = [
    { re: /^(\s*)export\s+(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { re: /^(\s*)export\s+(?:const|let|var)\s+(\w+)/, kind: "const" },
    { re: /^(\s*)export\s+interface\s+(\w+)/, kind: "interface" },
    { re: /^(\s*)export\s+type\s+(\w+)/, kind: "type" },
    { re: /^(\s*)export\s+class\s+(\w+)/, kind: "class" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!/\bexport\b/.test(line)) continue;
    if (isCommentLine(line)) continue;

    for (const { re, kind } of patterns) {
      const match = line.match(re);
      if (!match) continue;

      const name = match[2];
      if (!name) continue;

      const exportLine = i + 1; // 1-indexed

      // Check for JSDoc: closing */ on the line immediately before the export
      let hasJSDoc = false;
      for (let back = 1; back <= 5; back++) {
        const checkLine = i - back;
        if (checkLine < 0) break;
        if (jsdocLines.has(checkLine) && checkLine === i - 1) {
          hasJSDoc = true;
          break;
        }
        if (lines[checkLine].trim() === "*/" && checkLine === i - 1) {
          hasJSDoc = true;
          break;
        }
      }

      // Analyze function/const exports for interface quality
      let hasExplicitReturnType = false;
      let paramCount = 0;
      let paramNames: string[] = [];
      let hasAnyReturnType = false;
      let hasOptionalBeforeRequired = false;
      let hasBooleanParam = false;
      let returnsPromise = false;

      if (kind === "function" || kind === "const") {
        // Collect full declaration (up to 15 lines for multi-line signatures)
        const fullDecl = lines.slice(i, Math.min(i + 15, lines.length)).join(" ");

        // Explicit return type
        hasExplicitReturnType = /:\s*\w+[^=]*$/.test(line) && !/:\s*any\b/.test(line);
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

        // Check any return type
        hasAnyReturnType = /\):\s*any\b|:\s*any\s*[=,{]/.test(fullDecl);

        // Extract parameter details
        const paramMatch = fullDecl.match(/\(([^)]*)\)/);
        if (paramMatch) {
          const parsed = parseParams(paramMatch[1]);
          paramCount = parsed.count;
          paramNames = parsed.names;
          hasOptionalBeforeRequired = parsed.hasOptionalBeforeRequired;
          hasBooleanParam = parsed.hasBooleanParam;
        }

        // Promise return
        returnsPromise = /:\s*(?:Promise|PromiseLike)</.test(fullDecl) ||
                         /async\s+function/.test(line);
      }

      exports.push({
        name,
        kind,
        line: exportLine,
        hasJSDoc,
        hasExplicitReturnType,
        paramCount,
        paramNames,
        hasAnyReturnType,
        hasOptionalBeforeRequired,
        hasBooleanParam,
        returnsPromise,
      });

      break; // matched one pattern, no need to try others
    }
  }

  return exports;
}

/**
 * Parse function parameters, detecting optional-before-required and boolean params.
 */
function parseParams(paramStr: string): {
  count: number;
  names: string[];
  hasOptionalBeforeRequired: boolean;
  hasBooleanParam: boolean;
} {
  if (!paramStr.trim()) return { count: 0, names: [], hasOptionalBeforeRequired: false, hasBooleanParam: false };

  const params: Array<{ name: string; optional: boolean; hasBoolean: boolean }> = [];
  let depth = 0;
  let current = "";
  let inString: string | null = null;

  for (const ch of paramStr) {
    if (inString) {
      if (ch === inString) inString = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[" || ch === "<") {
      depth++;
      current += ch;
    } else if (ch === ")" || ch === "}" || ch === "]" || ch === ">") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      params.push(parseSingleParam(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }

  // Last param (no trailing comma)
  const lastTrimmed = current.trim();
  if (lastTrimmed) {
    params.push(parseSingleParam(lastTrimmed));
  }

  // Detect optional before required
  let seenOptional = false;
  let hasOptionalBeforeRequired = false;
  for (const p of params) {
    if (p.optional) {
      seenOptional = true;
    } else if (seenOptional && !p.optional) {
      hasOptionalBeforeRequired = true;
    }
  }

  const hasBooleanParam = params.some((p) => p.hasBoolean);
  const names = params.map((p) => p.name);

  return { count: params.length, names, hasOptionalBeforeRequired, hasBooleanParam };
}

/**
 * Parse a single parameter string like "name: string" or "opts?: Options".
 */
function parseSingleParam(param: string): { name: string; optional: boolean; hasBoolean: boolean } {
  // Destructured params: { foo, bar }: Type — treat as single param
  if (param.startsWith("{") || param.startsWith("[")) {
    const optional = param.includes("?:") || param.includes(" = ");
    const nameMatch = param.match(/\{?\s*(\w+)\s*:/);
    const name = nameMatch ? nameMatch[1] : "destructured";
    return { name, optional, hasBoolean: /:\s*boolean/.test(param) };
  }

  // Rest params: ...args: string[]
  if (param.startsWith("...")) {
    const nameMatch = param.match(/\.\.\.(\w+)/);
    return { name: nameMatch ? nameMatch[1] : "rest", optional: false, hasBoolean: false };
  }

  const optional = param.includes("?:") || param.includes(" = ");
  const nameMatch = param.match(/^(\w+)/);
  const name = nameMatch ? nameMatch[1] : "unknown";

  return { name, optional, hasBoolean: /:\s*boolean/.test(param) };
}

/**
 * Check JSDoc @param coverage: does the JSDoc block before an export document all params?
 */
function checkJSDocParamCoverage(
  filePath: string,
  exportInfo: ExportInfo,
): Finding[] {
  const findings: Finding[] = [];
  if (exportInfo.kind !== "function" && exportInfo.kind !== "const") return findings;
  if (exportInfo.paramCount === 0) return findings;
  if (!exportInfo.hasJSDoc) return findings; // already flagged as undocumented

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");
  const exportLineIdx = exportInfo.line - 1; // 0-indexed

  // Find the JSDoc block immediately before this export
  let jsdocEnd = -1;
  let jsdocStart = -1;
  for (let back = 1; back <= 5; back++) {
    const checkIdx = exportLineIdx - back;
    if (checkIdx < 0) break;
    if (lines[checkIdx].trim() === "*/") {
      jsdocEnd = checkIdx;
      break;
    }
  }

  if (jsdocEnd === -1) return findings;

  // Walk back to find /**
  for (let j = jsdocEnd; j >= Math.max(0, jsdocEnd - 20); j--) {
    if (lines[j].trim().startsWith("/**")) {
      jsdocStart = j;
      break;
    }
  }

  if (jsdocStart === -1) return findings;

  // Extract @param names from the JSDoc block
  const jsdocContent = lines.slice(jsdocStart, jsdocEnd + 1).join("\n");
  const documentedParams: string[] = [];
  const paramRe = /@param\s+(?:\{[^}]*\}\s+)?(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(jsdocContent)) !== null) {
    documentedParams.push(m[1]);
  }

  // Check that every function param has a corresponding @param
  for (const paramName of exportInfo.paramNames) {
    if (paramName === "rest" || paramName === "destructured" || paramName === "unknown") continue;
    if (!documentedParams.includes(paramName)) {
      findings.push({
        severity: "warn",
        category: "undocumented-param",
        message: `parameter \`${paramName}\` in \`${exportInfo.name}\` has no @param in JSDoc`,
        location: fmtLocation(relPath(filePath), exportInfo.line),
      });
    }
  }

  return findings;
}

// ── Canonical Contract Analysis ─────────────────────────────────────────────

/**
 * Extract interface block by name from file content lines.
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

/**
 * Extract exported function signature from file content.
 */
function extractFunctionSignature(lines: string[], funcName: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bexport\b/.test(line) && /\bfunction\b/.test(line) && line.includes(funcName)) {
      // Collect the full signature (up to opening brace or semicolon)
      const sigLines: string[] = [];
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        const l = lines[j];
        sigLines.push(l);
        if (l.includes("{") || l.includes(";")) break;
      }
      return sigLines.join(" ").replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

/**
 * Extract REST API handler signature from route file content.
 */
function extractRestHandler(lines: string[], httpMethod: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`export async function ${httpMethod}`)) {
      const sigLines: string[] = [];
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        sigLines.push(lines[j]);
        if (lines[j].includes("{")) break;
      }
      return sigLines.join(" ").replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: review — Interface review of changed files
// ════════════════════════════════════════════════════════════════════════════

function cmdReview(targetPath: string): {
  exports: ExportInfo[];
  findings: Finding[];
  verdict: Severity;
} {
  const absPath = join(ROOT_DIR, targetPath);
  const findings: Finding[] = [];

  if (!existsSync(absPath)) {
    console.error(`[pike] Path not found: ${targetPath}`);
    process.exit(1);
  }

  // Accept both files and directories
  const files: string[] = [];
  if (statSync(absPath).isDirectory()) {
    files.push(...walkDir(absPath).filter(isSourceFile));
  } else {
    files.push(absPath);
  }

  const allExports: ExportInfo[] = [];

  for (const fp of files) {
    const rel = relPath(fp);
    const exports = detectExports(fp);
    allExports.push(...exports);

    for (const exp of exports) {
      // ── Naming consistency ──
      if (exp.kind === "interface" || exp.kind === "type" || exp.kind === "class") {
        if (!PASCAL_CASE_RE.test(exp.name)) {
          findings.push({
            severity: "warn",
            category: "naming",
            message: `\`${exp.name}\` (${exp.kind}) should be PascalCase`,
            location: fmtLocation(rel, exp.line),
          });
        }
      } else if (exp.kind === "function" || exp.kind === "const") {
        if (!CAMEL_CASE_RE.test(exp.name)) {
          findings.push({
            severity: "warn",
            category: "naming",
            message: `\`${exp.name}\` (${exp.kind}) should be camelCase`,
            location: fmtLocation(rel, exp.line),
          });
        }
      }

      // ── Undocumented exports ──
      if (!exp.hasJSDoc) {
        findings.push({
          severity: "warn",
          category: "undocumented-export",
          message: `\`${exp.name}\` (${exp.kind}) has no JSDoc`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // ── Undocumented parameters ──
      const paramFindings = checkJSDocParamCoverage(fp, exp);
      findings.push(...paramFindings);

      // ── Ergonomics: optional params before required ──
      if (exp.hasOptionalBeforeRequired) {
        findings.push({
          severity: "warn",
          category: "ergonomics",
          message: `\`${exp.name}\` has optional parameters before required ones`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // ── Ergonomics: any return type ──
      if (exp.hasAnyReturnType) {
        findings.push({
          severity: "fail",
          category: "ergonomics",
          message: `\`${exp.name}\` returns \`any\` — use a specific type`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // ── Ergonomics: > 4 params ──
      if (exp.paramCount > MAX_PARAM_COUNT) {
        findings.push({
          severity: exp.paramCount > MAX_PARAM_COUNT + 2 ? "fail" : "warn",
          category: "ergonomics",
          message: `\`${exp.name}\` has ${exp.paramCount} parameters — use an options object`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // ── Ergonomics: boolean params ──
      if (exp.hasBooleanParam) {
        findings.push({
          severity: "warn",
          category: "ergonomics",
          message: `\`${exp.name}\` has a boolean parameter — use an options object instead`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // ── Explicit return type missing on exported functions ──
      if ((exp.kind === "function" || exp.kind === "const") && !exp.hasExplicitReturnType) {
        findings.push({
          severity: "warn",
          category: "missing-return-type",
          message: `\`${exp.name}\` has no explicit return type annotation`,
          location: fmtLocation(rel, exp.line),
        });
      }
    }

    // ── Canonical contract compliance for src/lib/memory/ and src/mcp/ ──
    const relPathStr = rel.replace(/\\/g, "/");
    if (relPathStr.startsWith("src/lib/memory/") || relPathStr.startsWith("src/mcp/")) {
      const canonicalFindings = checkCanonicalCompliance(fp);
      findings.push(...canonicalFindings);
    }
  }

  const verdict: Severity =
    findings.some((f) => f.severity === "fail") ? "fail" :
    findings.some((f) => f.severity === "warn") ? "warn" : "pass";

  return { exports: allExports, findings, verdict };
}

/**
 * Check that a file in src/lib/memory/ or src/mcp/ follows canonical patterns.
 */
function checkCanonicalCompliance(filePath: string): Finding[] {
  const findings: Finding[] = [];
  const rel = relPath(filePath);
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return findings;
  }

  // Check group_id usage in src/mcp/ files
  if (rel.startsWith("src/mcp/")) {
    const mcpExports = detectExports(filePath);
    for (const exp of mcpExports) {
      if (exp.kind !== "function") continue;

      // Functions in canonical-tools.ts should accept a request param with group_id
      const fullDecl = content.split("\n").slice(exp.line - 1, Math.min(exp.line + 15, content.split("\n").length)).join(" ");
      if (!fullDecl.includes("group_id") && !fullDecl.includes("GroupId")) {
        findings.push({
          severity: "fail",
          category: "canonical",
          message: `\`${exp.name}\` in MCP tool does not accept group_id — required for tenant isolation`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // Check for meta structure in return
      if (fullDecl.includes("Promise")) {
        const funcBody = extractFunctionBody(content, exp.line - 1);
        if (funcBody && !funcBody.includes("meta") && !funcBody.includes("MemoryResponseMeta")) {
          findings.push({
            severity: "warn",
            category: "canonical",
            message: `\`${exp.name}\` does not include meta in response — should follow MemoryResponseMeta structure`,
            location: fmtLocation(rel, exp.line),
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Extract function body from content starting at a line index.
 */
function extractFunctionBody(content: string, declLineIdx: number): string | null {
  const lines = content.split("\n");

  // Find the opening brace
  let braceStart = -1;
  for (let i = declLineIdx; i < Math.min(declLineIdx + 5, lines.length); i++) {
    if (lines[i].includes("{")) {
      braceStart = i;
      break;
    }
  }

  if (braceStart === -1) return null;

  // Walk forward to find end of function
  const bodyLines: string[] = [];
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
          bodyLines.push(line);
          return bodyLines.join("\n");
        }
      }
    }
    bodyLines.push(line);
  }

  return bodyLines.join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: breaking — Compare API surface between two git refs
// ════════════════════════════════════════════════════════════════════════════

function cmdBreaking(refRange: string): {
  base: string;
  head: string;
  changes: BreakingChange[];
  baseExports: ApiExport[];
  headExports: ApiExport[];
  verdict: Severity;
} {
  const parts = refRange.split("..");
  if (parts.length !== 2) {
    console.error("[pike] Invalid ref range. Use format: <base>..<head>");
    process.exit(1);
  }

  const [base, head] = parts;

  const baseExports = extractApiSurface(base);
  const headExports = extractApiSurface(head);

  const changes: BreakingChange[] = [];

  // Build maps for lookup
  const baseMap = new Map(baseExports.map((e) => [`${e.kind}:${e.name}`, e]));
  const headMap = new Map(headExports.map((e) => [`${e.kind}:${e.name}`, e]));

  // Check for removed exports (🔴 breaking)
  for (const key of Array.from(baseMap.keys())) {
    const baseExport = baseMap.get(key)!;
    if (!headMap.has(key)) {
      changes.push({
        type: "removed",
        severity: "fail",
        name: baseExport.name,
        detail: `export \`${baseExport.name}\` (${baseExport.kind}) was removed`,
        location: baseExport.location || baseExport.name,
      });
    }
  }

  // Check for added exports (🟢 clean)
  for (const key of Array.from(headMap.keys())) {
    const headExport = headMap.get(key)!;
    if (!baseMap.has(key)) {
      changes.push({
        type: "added",
        severity: "pass",
        name: headExport.name,
        detail: `export \`${headExport.name}\` (${headExport.kind}) was added`,
        location: headExport.location || headExport.name,
      });
    }
  }

  // Check for signature changes on existing exports (🔴 breaking)
  for (const key of Array.from(headMap.keys())) {
    const headExport = headMap.get(key)!;
    const baseExport = baseMap.get(key);
    if (!baseExport) continue;

    if (baseExport.signature !== headExport.signature) {
      // Detect what kind of change
      if (signatureReturnTypeChanged(baseExport.signature, headExport.signature)) {
        changes.push({
          type: "return-type-changed",
          severity: "fail",
          name: headExport.name,
          detail: `return type changed: "${baseExport.signature}" → "${headExport.signature}"`,
          location: headExport.location || headExport.name,
        });
      }

      if (signatureParamsChanged(baseExport.signature, headExport.signature)) {
        changes.push({
          type: "param-type-changed",
          severity: "fail",
          name: headExport.name,
          detail: `parameter signature changed: "${baseExport.signature}" → "${headExport.signature}"`,
          location: headExport.location || headExport.name,
        });
      }

      // Generic signature change that didn't match specific patterns
      const hasSpecificChange = changes.some(
        (c) => c.name === headExport.name && c.type !== "signature-changed",
      );
      if (!hasSpecificChange) {
        changes.push({
          type: "signature-changed",
          severity: "fail",
          name: headExport.name,
          detail: `signature changed: "${baseExport.signature}" → "${headExport.signature}"`,
          location: headExport.location || headExport.name,
        });
      }
    }
  }

  const verdict: Severity =
    changes.some((c) => c.severity === "fail") ? "fail" :
    changes.some((c) => c.severity === "warn") ? "warn" : "pass";

  return { base, head, changes, baseExports, headExports, verdict };
}

/**
 * Extract API surface (all exports) from a git ref.
 */
function extractApiSurface(gitRef: string): ApiExport[] {
  // Get list of TypeScript files at this ref
  let fileList: string;
  try {
    fileList = execSync(
      `git ls-tree -r --name-only ${gitRef}`,
      { encoding: "utf-8", cwd: ROOT_DIR, maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    console.error(`[pike] Cannot list files at ref ${gitRef}`);
    return [];
  }

  const files = fileList
    .split("\n")
    .filter((f) => f.trim())
    .filter((f) => {
      const ext = extname(f);
      return ext === ".ts" || ext === ".tsx";
    })
    .filter((f) => !f.includes("node_modules") && !f.includes(".next") && !f.includes(".opencode"));

  const allExports: ApiExport[] = [];

  for (const file of files) {
    let content: string;
    try {
      // gitExec routes through the GIT-EXEC-001 choke point and uses
      // execFileSync internally (no shell escaping issues with paths).
      content = gitExec(
        ["show", `${gitRef}:${file}`],
        { cwd: ROOT_DIR, maxBuffer: 50 * 1024 * 1024 },
      );
    } catch {
      continue; // file might not exist at this ref
    }

    const lines = content.split("\n");
    const exports = parseExportsFromContent(lines, file);

    for (const exp of exports) {
      allExports.push({
        ...exp,
        location: fmtLocation(file, exp.line),
      });
    }
  }

  return allExports;
}

/**
 * Parse exports from content lines (no filesystem needed — for git show output).
 */
function parseExportsFromContent(
  lines: string[],
  filePath: string,
): ApiExport[] {
  const exports: ApiExport[] = [];

  const patterns: Array<{
    re: RegExp;
    kind: ApiExport["kind"];
  }> = [
    { re: /^(\s*)export\s+(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { re: /^(\s*)export\s+(?:const|let|var)\s+(\w+)/, kind: "const" },
    { re: /^(\s*)export\s+interface\s+(\w+)/, kind: "interface" },
    { re: /^(\s*)export\s+type\s+(\w+)/, kind: "type" },
    { re: /^(\s*)export\s+class\s+(\w+)/, kind: "class" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bexport\b/.test(line)) continue;
    if (isCommentLine(line)) continue;

    for (const { re, kind } of patterns) {
      const match = line.match(re);
      if (!match) continue;

      const name = match[2];
      if (!name) continue;

      // Extract signature: collect up to opening brace or semicolon
      const sigLines: string[] = [];
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        sigLines.push(lines[j].trim());
        if (lines[j].includes("{") || lines[j].includes(";")) break;
      }
      const signature = sigLines.join(" ").replace(/\s+/g, " ").trim();

      exports.push({
        name,
        kind,
        signature,
        line: i + 1,
      });

      break;
    }
  }

  return exports;
}

function signatureReturnTypeChanged(baseSig: string, headSig: string): boolean {
  const baseReturn = baseSig.match(/\):\s*([^{]*)/);
  const headReturn = headSig.match(/\):\s*([^{]*)/);

  if (!baseReturn || !headReturn) return false;

  return baseReturn[1].trim() !== headReturn[1].trim();
}

function signatureParamsChanged(baseSig: string, headSig: string): boolean {
  const baseParams = baseSig.match(/\(([^)]*)\)/);
  const headParams = headSig.match(/\(([^)]*)\)/);

  if (!baseParams || !headParams) return false;

  return baseParams[1].trim() !== headParams[1].trim();
}

// ════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: surface — Module surface analysis with quality scoring
// ════════════════════════════════════════════════════════════════════════════

function cmdSurface(dirPath: string): {
  modules: ModuleScore[];
  findings: Finding[];
  summary: {
    totalModules: number;
    totalExports: number;
    avgScore: number;
  };
  verdict: Severity;
} {
  const absPath = join(ROOT_DIR, dirPath);

  if (!existsSync(absPath)) {
    console.error(`[pike] Directory not found: ${dirPath}`);
    process.exit(1);
  }

  if (!statSync(absPath).isDirectory()) {
    console.error(`[pike] surface requires a directory path. Use 'review' for files.`);
    process.exit(1);
  }

  const files = walkDir(absPath).filter(isAnalyzableFile);
  const modules: ModuleScore[] = [];
  const findings: Finding[] = [];

  let totalExports = 0;
  let totalScore = 0;

  for (const fp of files) {
    const rel = relPath(fp);
    const exports = detectExports(fp);
    const moduleFindings: Finding[] = [];

    let moduleScore = 10; // Start at 10, subtract for issues

    for (const exp of exports) {
      totalExports++;

      // Naming consistency (-1 per violation)
      if (exp.kind === "interface" || exp.kind === "type" || exp.kind === "class") {
        if (!PASCAL_CASE_RE.test(exp.name)) {
          moduleScore -= 1;
          moduleFindings.push({
            severity: "warn",
            category: "naming",
            message: `\`${exp.name}\` (${exp.kind}) should be PascalCase`,
            location: fmtLocation(rel, exp.line),
          });
        }
      } else if (exp.kind === "function" || exp.kind === "const") {
        if (!CAMEL_CASE_RE.test(exp.name)) {
          moduleScore -= 1;
          moduleFindings.push({
            severity: "warn",
            category: "naming",
            message: `\`${exp.name}\` (${exp.kind}) should be camelCase`,
            location: fmtLocation(rel, exp.line),
          });
        }
      }

      // Missing JSDoc (-1)
      if (!exp.hasJSDoc) {
        moduleScore -= 1;
        moduleFindings.push({
          severity: "warn",
          category: "undocumented-export",
          message: `\`${exp.name}\` (${exp.kind}) has no JSDoc`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // Boolean params (-0.5)
      if (exp.hasBooleanParam) {
        moduleScore -= 0.5;
        moduleFindings.push({
          severity: "warn",
          category: "ergonomics",
          message: `\`${exp.name}\` has a boolean parameter — use options object`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // Any return type (-2)
      if (exp.hasAnyReturnType) {
        moduleScore -= 2;
        moduleFindings.push({
          severity: "fail",
          category: "ergonomics",
          message: `\`${exp.name}\` returns \`any\``,
          location: fmtLocation(rel, exp.line),
        });
      }

      // > 4 params (-1)
      if (exp.paramCount > MAX_PARAM_COUNT) {
        moduleScore -= 1;
        moduleFindings.push({
          severity: "warn",
          category: "ergonomics",
          message: `\`${exp.name}\` has ${exp.paramCount} params — use options object`,
          location: fmtLocation(rel, exp.line),
        });
      }

      // Missing return type (-0.5)
      if ((exp.kind === "function" || exp.kind === "const") && !exp.hasExplicitReturnType) {
        moduleScore -= 0.5;
      }
    }

    // Clamp score to 0-10
    moduleScore = Math.max(0, Math.min(10, moduleScore));
    totalScore += moduleScore;

    findings.push(...moduleFindings);

    modules.push({
      path: rel,
      exports,
      findings: moduleFindings,
      score: moduleScore,
    });
  }

  const totalModules = modules.length;
  const avgScore = totalModules > 0 ? Math.round((totalScore / totalModules) * 10) / 10 : 0;

  const verdict: Severity =
    findings.some((f) => f.severity === "fail") ? "fail" :
    findings.some((f) => f.severity === "warn") ? "warn" : "pass";

  return {
    modules,
    findings,
    summary: { totalModules, totalExports, avgScore },
    verdict,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: canonical — Check canonical memory interface compliance
// ════════════════════════════════════════════════════════════════════════════

function cmdCanonical(): {
  checks: CanonicalCheck[];
  findings: Finding[];
  verdict: Severity;
} {
  const findings: Finding[] = [];
  const checks: CanonicalCheck[] = [];

  // Load the 3 key files
  const contractPath = join(ROOT_DIR, CANONICAL_CONTRACTS_PATH);
  const toolsPath = join(ROOT_DIR, CANONICAL_TOOLS_PATH);
  const restPath = join(ROOT_DIR, REST_API_ROUTE_PATH);

  const contractContent = existsSync(contractPath) ? readFileSync(contractPath, "utf-8") : null;
  const toolsContent = existsSync(toolsPath) ? readFileSync(toolsPath, "utf-8") : null;
  const restContent = existsSync(restPath) ? readFileSync(restPath, "utf-8") : null;

  if (!contractContent) {
    findings.push({
      severity: "fail",
      category: "canonical",
      message: `${CANONICAL_CONTRACTS_PATH} not found`,
      location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
    });
  }

  if (!toolsContent) {
    findings.push({
      severity: "fail",
      category: "canonical",
      message: `${CANONICAL_TOOLS_PATH} not found`,
      location: fmtLocation(CANONICAL_TOOLS_PATH, 1),
    });
  }

  if (!restContent) {
    findings.push({
      severity: "warn",
      category: "canonical",
      message: `${REST_API_ROUTE_PATH} not found`,
      location: fmtLocation(REST_API_ROUTE_PATH, 1),
    });
  }

  // Check each canonical operation
  for (const op of CANONICAL_OPS) {
    const opFindings: Finding[] = [];
    const pascalOp = op
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");

    const requestName = `${pascalOp}Request`;
    const responseName = `${pascalOp}Response`;

    // ── Contract signatures ──
    let contractSignature = "NOT FOUND";
    let mcpSignature = "NOT FOUND";
    let restSignature = "NOT FOUND";
    let drift = false;

    if (contractContent) {
      const contractLines = contractContent.split("\n");

      // Check Request interface exists
      const requestBlock = extractInterfaceBlock(contractLines, requestName);
      if (!requestBlock) {
        opFindings.push({
          severity: "fail",
          category: "canonical",
          message: `${op}: missing ${requestName} in canonical-contracts.ts`,
          location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
        });
        drift = true;
      } else {
        contractSignature = requestBlock.replace(/\s+/g, " ").trim().substring(0, 200);

        // Check group_id is required
        const groupIdRequired = /group_id:\s*GroupId/.test(requestBlock) && !/group_id\?:/.test(requestBlock);
        if (!groupIdRequired) {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: group_id should be required (not optional) in ${requestName}`,
            location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
          });
        }
      }

      // Check Response interface exists
      const responseBlock = extractInterfaceBlock(contractLines, responseName);
      if (!responseBlock) {
        opFindings.push({
          severity: "fail",
          category: "canonical",
          message: `${op}: missing ${responseName} in canonical-contracts.ts`,
          location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
        });
        drift = true;
      } else {
        // Check for meta field
        const hasMeta = responseBlock.includes("meta?:") || responseBlock.includes("MemoryResponseMeta");
        if (!hasMeta) {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: ${responseName} missing meta?: MemoryResponseMeta`,
            location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
          });
          drift = true;
        }

        // Check for id field
        const hasId = responseBlock.includes("id:") || responseBlock.includes("id?:");
        if (!hasId && op !== "memory_delete") {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: ${responseName} missing id field`,
            location: fmtLocation(CANONICAL_CONTRACTS_PATH, 1),
          });
          drift = true;
        }
      }
    }

    // ── MCP tool implementation ──
    if (toolsContent) {
      const toolsLines = toolsContent.split("\n");
      const mcpFuncSig = extractFunctionSignature(toolsLines, op);

      if (!mcpFuncSig) {
        opFindings.push({
          severity: "fail",
          category: "canonical",
          message: `${op}: missing export function \`${op}\` in canonical-tools.ts`,
          location: fmtLocation(CANONICAL_TOOLS_PATH, 1),
        });
        drift = true;
      } else {
        mcpSignature = mcpFuncSig.substring(0, 200);

        // Check that the MCP function imports and uses the canonical Request/Response types
        const usesRequestType = mcpFuncSig.includes(`${pascalOp}Request`) || mcpFuncSig.includes("Request");
        const usesResponseType = mcpFuncSig.includes(`${pascalOp}Response`) || mcpFuncSig.includes("Response");

        if (!usesRequestType) {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: MCP function doesn't use ${requestName} type`,
            location: fmtLocation(CANONICAL_TOOLS_PATH, 1),
          });
          drift = true;
        }

        if (!usesResponseType) {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: MCP function doesn't use ${responseName} return type`,
            location: fmtLocation(CANONICAL_TOOLS_PATH, 1),
          });
          drift = true;
        }

        // Check group_id usage in the MCP function
        const funcBody = extractFunctionBody(toolsContent, toolsLines.findIndex((l) => l.includes(`export`) && l.includes(`function`) && l.includes(op)));
        if (funcBody && !funcBody.includes("group_id") && !funcBody.includes("GroupId")) {
          opFindings.push({
            severity: "fail",
            category: "canonical",
            message: `${op}: MCP implementation doesn't use group_id — tenant isolation broken`,
            location: fmtLocation(CANONICAL_TOOLS_PATH, 1),
          });
          drift = true;
        }
      }
    }

    // ── REST API route ──
    if (restContent) {
      const restLines = restContent.split("\n");

      // Determine HTTP method for this operation
      const httpMethod = getHttpMethodForOp(op);
      const handlerSig = extractRestHandler(restLines, httpMethod);

      if (handlerSig) {
        restSignature = handlerSig.substring(0, 200);

        // Check that the REST handler calls the canonical MCP function
        const handlerBody = extractRestHandlerBody(restContent, httpMethod);
        if (handlerBody && !handlerBody.includes(op)) {
          opFindings.push({
            severity: "fail",
            category: "canonical",
            message: `${op}: REST ${httpMethod} handler doesn't call \`${op}\` from canonical-tools`,
            location: fmtLocation(REST_API_ROUTE_PATH, 1),
          });
          drift = true;
        }

        // Check that group_id is validated in REST
        if (handlerBody && !handlerBody.includes("group_id")) {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: REST ${httpMethod} handler doesn't validate group_id`,
            location: fmtLocation(REST_API_ROUTE_PATH, 1),
          });
        }
      } else {
        if (httpMethod === "DELETE") {
          // DELETE might be in a different route file
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: REST ${httpMethod} handler not found in ${REST_API_ROUTE_PATH}`,
            location: fmtLocation(REST_API_ROUTE_PATH, 1),
          });
        } else {
          opFindings.push({
            severity: "warn",
            category: "canonical",
            message: `${op}: REST ${httpMethod} handler not found in ${REST_API_ROUTE_PATH}`,
            location: fmtLocation(REST_API_ROUTE_PATH, 1),
          });
        }
      }
    }

    findings.push(...opFindings);

    checks.push({
      operation: op,
      contractSignature,
      mcpSignature,
      restSignature,
      findings: opFindings,
      drift,
    });
  }

  const verdict: Severity =
    findings.some((f) => f.severity === "fail") ? "fail" :
    findings.some((f) => f.severity === "warn") ? "warn" : "pass";

  return { checks, findings, verdict };
}

/**
 * Map canonical operation to HTTP method.
 */
function getHttpMethodForOp(op: string): string {
  switch (op) {
    case "memory_add": return "POST";
    case "memory_search": return "GET"; // via ?query=
    case "memory_get": return "GET";
    case "memory_list": return "GET";
    case "memory_delete": return "DELETE";
    default: return "GET";
  }
}

/**
 * Extract REST handler function body.
 */
function extractRestHandlerBody(content: string, httpMethod: string): string | null {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`export async function ${httpMethod}`)) {
      const body = extractFunctionBody(content, i);
      return body;
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Formatters
// ════════════════════════════════════════════════════════════════════════════

function formatReview(result: { exports: ExportInfo[]; findings: Finding[]; verdict: Severity }): string {
  const lines: string[] = [];
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("[pike]       INTERFACE REVIEW REPORT");
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("");

  const byCategory: Record<string, Finding[]> = {};
  for (const f of result.findings) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  if (Object.keys(byCategory).length > 0) {
    lines.push("Findings by Category:");
    lines.push("──────────────────────────────────────────────────────");

    for (const [category, catFindings] of Object.entries(byCategory).sort()) {
      lines.push(`  ${category} (${catFindings.length}):`);
      for (const f of catFindings) {
        lines.push(`    ${sevIcon(f.severity)} ${f.message} → ${f.location}`);
      }
    }
    lines.push("");
  }

  // Severity breakdown
  const passCount = result.findings.filter((f) => f.severity === "pass").length;
  const warnCount = result.findings.filter((f) => f.severity === "warn").length;
  const failCount = result.findings.filter((f) => f.severity === "fail").length;

  lines.push("Severity Breakdown:");
  lines.push("──────────────────────────────────────────────────────");
  lines.push(`  🟢 Pass: ${passCount}`);
  lines.push(`  🟡 Warn: ${warnCount}`);
  lines.push(`  🔴 Fail: ${failCount}`);
  lines.push("");

  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");
  lines.push("");

  if (result.verdict === "fail") {
    lines.push("  ❌ INTERFACE REVIEW FAILED — breaking issues found");
  } else if (result.verdict === "warn") {
    lines.push("  ⚠️  REVIEW PASSED WITH WARNINGS — address before merge");
  } else {
    lines.push("  ✅ INTERFACE REVIEW PASSED — clean");
  }

  return lines.join("\n");
}

function formatBreaking(result: {
  base: string;
  head: string;
  changes: BreakingChange[];
  baseExports: ApiExport[];
  headExports: ApiExport[];
  verdict: Severity;
}): string {
  const lines: string[] = [];
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("[pike]       BREAKING CHANGE ANALYSIS");
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Base ref: ${result.base}`);
  lines.push(`Head ref: ${result.head}`);
  lines.push(`Base exports: ${result.baseExports.length}`);
  lines.push(`Head exports: ${result.headExports.length}`);
  lines.push("");

  // Group changes by type
  const removed = result.changes.filter((c) => c.type === "removed");
  const sigChanged = result.changes.filter((c) => c.type === "signature-changed" || c.type === "return-type-changed" || c.type === "param-type-changed");
  const added = result.changes.filter((c) => c.type === "added");

  if (removed.length > 0) {
    lines.push("🔴 REMOVED EXPORTS (BREAKING):");
    lines.push("──────────────────────────────────────────────────────");
    for (const c of removed) {
      lines.push(`  🔴 ${c.detail}`);
    }
    lines.push("");
  }

  if (sigChanged.length > 0) {
    lines.push("🔴 SIGNATURE CHANGES (BREAKING):");
    lines.push("──────────────────────────────────────────────────────");
    for (const c of sigChanged) {
      lines.push(`  🔴 ${c.detail}`);
    }
    lines.push("");
  }

  if (added.length > 0) {
    lines.push("🟢 ADDED EXPORTS (CLEAN):");
    lines.push("──────────────────────────────────────────────────────");
    for (const c of added) {
      lines.push(`  🟢 ${c.detail}`);
    }
    lines.push("");
  }

  if (result.changes.length === 0) {
    lines.push("🟢 No API surface changes detected");
    lines.push("");
  }

  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");
  lines.push("");

  if (result.verdict === "fail") {
    lines.push("  ❌ BREAKING CHANGES DETECTED — do not merge without migration plan");
  } else {
    lines.push("  ✅ No breaking changes — safe to merge");
  }

  return lines.join("\n");
}

function formatSurface(result: {
  modules: ModuleScore[];
  findings: Finding[];
  summary: { totalModules: number; totalExports: number; avgScore: number };
  verdict: Severity;
}): string {
  const lines: string[] = [];
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("[pike]       MODULE SURFACE ANALYSIS");
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Modules analyzed: ${result.summary.totalModules}`);
  lines.push(`Total exports: ${result.summary.totalExports}`);
  lines.push(`Average score: ${result.summary.avgScore}/10`);
  lines.push("");

  lines.push("Module Scores:");
  lines.push("──────────────────────────────────────────────────────");

  // Sort by score ascending (worst first)
  const sorted = [...result.modules].sort((a, b) => a.score - b.score);

  for (const mod of sorted) {
    const scoreIcon = mod.score >= 8 ? "🟢" : mod.score >= 5 ? "🟡" : "🔴";
    lines.push(`  ${scoreIcon} ${mod.path} — ${mod.score}/10 (${mod.exports.length} exports)`);

    for (const exp of mod.exports) {
      const icons: string[] = [];
      if (!exp.hasJSDoc) icons.push("no-jsdoc");
      if (exp.hasBooleanParam) icons.push("⚡bool-param");
      if (exp.hasAnyReturnType) icons.push("⚠any-return");
      const iconStr = icons.length > 0 ? ` [${icons.join(", ")}]` : " ✓";
      lines.push(`    ${exp.kind}: \`${exp.name}\`${iconStr} → :${exp.line}`);
    }

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
    lines.push("🟢 No surface findings — all modules score 10/10");
  }

  lines.push("");
  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");

  return lines.join("\n");
}

function formatCanonical(result: {
  checks: CanonicalCheck[];
  findings: Finding[];
  verdict: Severity;
}): string {
  const lines: string[] = [];
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("[pike]       CANONICAL CONTRACT COMPLIANCE");
  lines.push("[pike] ═══════════════════════════════════════════════════════");
  lines.push("");

  lines.push("Contract → Implementation → API Drift:");
  lines.push("──────────────────────────────────────────────────────");

  for (const check of result.checks) {
    const driftIcon = check.drift ? "🔴" : "🟢";
    lines.push(`  ${driftIcon} ${check.operation} — drift: ${check.drift}`);

    lines.push(`    Contract: ${check.contractSignature.substring(0, 100)}${check.contractSignature.length > 100 ? "..." : ""}`);
    lines.push(`    MCP Tool:  ${check.mcpSignature.substring(0, 100)}${check.mcpSignature.length > 100 ? "..." : ""}`);
    lines.push(`    REST API:  ${check.restSignature.substring(0, 100)}${check.restSignature.length > 100 ? "..." : ""}`);

    for (const f of check.findings) {
      lines.push(`    ${sevIcon(f.severity)} ${f.message}`);
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
    lines.push("🟢 All canonical contracts are in compliance — no drift detected");
  }

  lines.push("");
  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${sevIcon(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push("──────────────────────────────────────────────────────────");

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// DB Logging (same pattern as carmack/fowler/knuth)
// ════════════════════════════════════════════════════════════════════════════

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
  const neo4jUri = process.env.NEO4J_URI;

  if (!postgresUrl || !neo4jUri) {
    return null;
  }

  const { getPool, closePool } = await import("../../src/lib/postgres/connection");
  const { getDriver, closeDriver } = await import("../../src/lib/neo4j/connection");

  const pgPool = getPool();
  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();

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
      insight_id: 'ins_interface_' + randomUUID(),
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

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const { subCommand, args } = parseArgs();

  // No args → print usage
  if (!subCommand && args.length === 0) {
    console.log("[pike] Pike — Interface Review Agent");
    console.log("");
    console.log("Usage:");
    console.log("  bun scripts/agents/pike-interface-review.ts review <path>           Interface review of files");
    console.log("  bun scripts/agents/pike-interface-review.ts check <path>            Alias for review");
    console.log("  bun scripts/agents/pike-interface-review.ts breaking <base>..<head> Breaking change analysis");
    console.log("  bun scripts/agents/pike-interface-review.ts surface <dir>           Module surface scoring");
    console.log("  bun scripts/agents/pike-interface-review.ts canonical               Canonical contract compliance");
    console.log("  bun scripts/agents/pike-interface-review.ts <path>                  Default: review (backward compat)");
    process.exit(0);
  }

  console.log("[pike] Starting interface review...");
  console.log(`[pike] Command: ${subCommand || "review"}`);
  if (args.length > 0) {
    console.log(`[pike] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Execute sub-command — always real analysis
  let output: string;
  let findingsForDb: Record<string, unknown>;
  let exitCode = 0;

  if (subCommand === "review" || subCommand === "check") {
    if (args.length === 0) {
      console.error("[pike] review requires a file or directory path");
      process.exit(1);
    }
    const result = cmdReview(args[0]);
    output = formatReview(result);
    findingsForDb = {
      subCommand: "review",
      target: args[0],
      exportCount: result.exports.length,
      findingCount: result.findings.length,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else if (subCommand === "breaking") {
    if (args.length === 0) {
      console.error("[pike] breaking requires a ref range (e.g., main..HEAD)");
      process.exit(1);
    }
    const result = cmdBreaking(args[0]);
    output = formatBreaking(result);
    findingsForDb = {
      subCommand: "breaking",
      refRange: args[0],
      baseExportCount: result.baseExports.length,
      headExportCount: result.headExports.length,
      breakingChangeCount: result.changes.filter((c) => c.severity === "fail").length,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else if (subCommand === "surface") {
    if (args.length === 0) {
      console.error("[pike] surface requires a directory path");
      process.exit(1);
    }
    const result = cmdSurface(args[0]);
    output = formatSurface(result);
    findingsForDb = {
      subCommand: "surface",
      target: args[0],
      totalModules: result.summary.totalModules,
      totalExports: result.summary.totalExports,
      avgScore: result.summary.avgScore,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else if (subCommand === "canonical") {
    const result = cmdCanonical();
    output = formatCanonical(result);
    findingsForDb = {
      subCommand: "canonical",
      operationsChecked: CANONICAL_OPS.length,
      findingCount: result.findings.length,
      driftDetected: result.checks.some((c) => c.drift),
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  } else {
    // Default: bare path → review (backward compatible)
    const targetPath = args[0];
    const result = cmdReview(targetPath);
    output = formatReview(result);
    findingsForDb = {
      subCommand: "review",
      target: targetPath,
      exportCount: result.exports.length,
      findingCount: result.findings.length,
      verdict: result.verdict,
    };
    exitCode = result.verdict === "fail" ? 1 : 0;
  }

  // Always print real output
  console.log(output);

  // Try DB logging if available
  const db = await getDbConnections();

  if (!db) {
    console.log("\n[pike] ⚠️  Database connections not configured");
    console.log("[pike] Review complete — results shown above (no DB logging)");
    console.log("[pike] Set POSTGRES_URL and NEO4J_URI to log findings");
    process.exit(exitCode);
  }

  try {
    // Log review start
    await logToPostgres(db, "interface_review_started", {
      ...findingsForDb,
      agent: AGENT_ID,
    });

    // Create insight in Neo4j
    const confidence = findingsForDb.verdict === "fail" ? 0.95 :
                        findingsForDb.verdict === "warn" ? 0.80 : 0.85;
    const summary = `Pike interface review (${findingsForDb.subCommand}): ${JSON.stringify(findingsForDb)}`;
    await createInsight(db, summary, confidence, "agent_review");

    // Log review completion
    await logToPostgres(db, "interface_review_completed", {
      ...findingsForDb,
      confidence,
    });

    console.log("\n[pike] ✅ Review logged to PostgreSQL and Neo4j");
  } catch (error) {
    console.error("\n[pike] DB logging failed:", error);
    // Don't change exit code — the review output is still valid
  } finally {
    await db.neo4jSession.close();
    await db.closeDriver();
    await db.closePool();
  }

  process.exit(exitCode);
}

main();
