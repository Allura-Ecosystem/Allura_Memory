import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export interface ReleaseSafetyFinding {
  file: string
  pattern: string
  message: string
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; message: string }> = [
  {
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    message: "Private key material must never be committed.",
  },
  {
    name: "openai-key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    message: "OpenAI-style API key detected.",
  },
  {
    name: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/,
    message: "GitHub token detected.",
  },
  {
    name: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    message: "Slack token detected.",
  },
  {
    name: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    message: "AWS access key detected.",
  },
  {
    name: "notion-secret",
    pattern: /\bntn_[A-Za-z0-9_-]{20,}\b/,
    message: "Notion integration secret detected.",
  },
]

const PRIVATE_DOMAIN_PATTERNS: Array<{ name: string; pattern: RegExp; message: string }> = [
  {
    name: "private-board-config-path",
    pattern: /board-configs\/private\/.+\.(?:json|ya?ml|ts|tsx|md)/,
    message: "Private board config content must stay out of public source.",
  },
  {
    name: "private-domain-live-claim",
    pattern: /(Faith Meats Operations|Lending Compliance).{0,120}(live|active|approved|current source)/i,
    message: "Deferred domain boards must not claim live/active source status in public samples.",
  },
]

const SCAN_ROOTS = [
  "docs",
  "src/lib/boards",
  "src/app/(main)/boards",
]

const SKIP_DIRS = new Set([".git", ".next", "node_modules", "coverage", "artifacts", ".worktrees"])
const SCANNED_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".json", ".yaml", ".yml"])

export function scanReleaseSafety(repoRoot = process.cwd()): ReleaseSafetyFinding[] {
  const files = SCAN_ROOTS.flatMap((root) => collectFiles(join(repoRoot, root)))
  const findings: ReleaseSafetyFinding[] = []

  for (const file of files) {
    const content = readFileSync(file, "utf8")
    const repoPath = relative(repoRoot, file)

    for (const check of [...SECRET_PATTERNS, ...PRIVATE_DOMAIN_PATTERNS]) {
      if (check.pattern.test(content)) {
        findings.push({
          file: repoPath,
          pattern: check.name,
          message: check.message,
        })
      }
    }
  }

  return findings
}

function collectFiles(path: string): string[] {
  const stats = statSync(path, { throwIfNoEntry: false })
  if (!stats) return []

  if (stats.isFile()) {
    return shouldScanFile(path) ? [path] : []
  }

  if (!stats.isDirectory()) return []

  const basename = path.split("/").at(-1)
  if (basename && SKIP_DIRS.has(basename)) return []

  return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)))
}

function shouldScanFile(path: string): boolean {
  const extension = path.match(/\.[^.]+$/)?.[0] ?? ""
  return SCANNED_EXTENSIONS.has(extension)
}

