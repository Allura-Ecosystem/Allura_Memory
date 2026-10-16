import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

// Historical artifacts are not runtime inputs. Never rewrite migration history.
const historicalPrefixes = [
  ".opencode/archive/", ".claude/archive/", ".codex/archive/",
  ".opencode/work-items/", "docs/archive/", "scripts/archive/",
]

// Existing migration history only; new SQL/bootstrap files are still scanned.
const historicalMigrations = new Set([
  "docker/postgres-init/00-traces.sql",
  "docker/postgres-init/01-sync-tables.sql",
  "docker/postgres-init/04-optimization-views.sql.deferred",
  "docker/postgres-init/11-canonical-proposals.sql",
  "docker/postgres-init/12-ruvector-fallback.sql",
  "docker/postgres-init/16-ruvector-memories.sql",
  "docker/postgres-init/17-ruvector-fallback-sync.sql",
  "docker/postgres-init/21-graph-adapter-tables.sql",
  "docker/postgres-init/24-graph-structural-context.sql",
])

// Only these specific negative assertions may name the retired backend.
// Matching whole lines prevents an unrelated new use in the same test escaping.
const rejectionLines: Record<string, string[]> = {
  "src/__tests__/install-deploy-review.test.ts": ['expect(envValidator).not.toContain("NEO4J_PASSWORD")'],
  "src/__tests__/memory-search-ruvector.test.ts": [
    'expect(response.meta?.stores_used).not.toContain("neo4j");',
    'it("should include ruvector in stores_used but not neo4j when semantic store fails", async () => {',
  ],
  "src/__tests__/audit-tools.test.ts": ['expect(response.subsystems).not.toHaveProperty("neo4j")'],
  "src/__tests__/health-metrics-scope.test.ts": ['expect(body.storage).not.toHaveProperty("neo4j")'],
  "src/__tests__/health-metrics.test.ts": [
    'expect(body.storage).not.toHaveProperty("neo4j")',
    'expect(body.degraded).not.toHaveProperty("neo4j_unavailable")',
  ],
  "src/lib/brain-client.test.ts": ['expect(report.subsystems).not.toHaveProperty("neo4j")'],
  "src/lib/memory/health-invariant-parity.test.ts": [
    'expect.not.arrayContaining(["neo4j", "graph", "graph_store"])',
    'expect(JSON.stringify(report).toLowerCase()).not.toContain("neo4j")',
    'expect(text).not.toContain("neo4j")',
  ],
}

export function isActiveSurface(path: string): boolean {
  if (historicalPrefixes.some((prefix) => path.startsWith(prefix))) return false
  if (historicalMigrations.has(path)) return false
  // The detector and its hostile fixtures necessarily contain forbidden tokens.
  if (["scripts/check-retired-backend.ts", "tests/scripts/check-retired-backend.test.ts",
    ".github/scripts/docs-backend-residue-guard.sh", "scripts/inspect-results.txt",
    "packages/sdk/CHANGELOG.md"].includes(path)) return false
  return /^(src|packages|config|scripts|tests|docker|migrations|factory|json-schema|\.github|\.opencode|\.claude|\.codex|\.agents)\//.test(path)
    || /^(AGENTS\.md|CLAUDE\.md|opencode\.jsonc?|package\.json|bun\.lock|env\.mjs|\.env\.example|Dockerfile[^/]*|docker-compose[^/]*|compose[^/]*|vitest\.config[^/]*)$/.test(path)
}

export function findRetiredReferences(path: string, content: string): string[] {
  if (!isActiveSurface(path)) return []
  const failures: string[] = []
  const forbidden = /neo4j|bolt(?:\+s|\+ssc)?:\/\//i
  if (forbidden.test(path)) failures.push(`${path}: retired identifier in active filename`)
  content.split(/\r?\n/).forEach((line, index) => {
    if (forbidden.test(line) && !rejectionLines[path]?.includes(line.trim())) {
      failures.push(`${path}:${index + 1}: retired backend identifier`)
    }
  })
  return failures
}

export function checkRepository(root: string): string[] {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
  const failures: string[] = []
  // Explicitly include root instruction aliases even when ignored or symlinked.
  for (const path of [...new Set([...paths.split("\0"), "AGENTS.md", "CLAUDE.md"])].sort()) {
    if (!isActiveSurface(path)) continue
    const absolute = resolve(root, path)
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue
    const content = readFileSync(absolute, "utf8")
    if (content.includes("\0")) continue
    failures.push(...findRetiredReferences(path, content))
  }
  return failures
}

if (import.meta.main) {
  const failures = checkRepository(process.cwd())
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exitCode = 1
  } else {
    console.log("retired-backend guard: PASS (active runtime, dependencies, compose, and agent instructions)")
  }
}
