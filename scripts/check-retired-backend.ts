import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

// Historical artifacts are not runtime inputs. Never rewrite migration history.
const historicalPrefixes = [
  ".opencode/archive/", ".claude/archive/", ".codex/archive/",
  ".opencode/work-items/", "docs/archive/", "scripts/archive/",
]

// Existing migration history only; new SQL/bootstrap files are still scanned.
const historicalMigrations: Record<string, string> = {
  "docker/postgres-init/00-traces.sql": "fc289093dd755a6ec4616ca68f0a7f5a3138588a1d75317eff1fae6cd2f9a144",
  "docker/postgres-init/01-sync-tables.sql": "f994d3a0d3d56ad317f9200fafe833af1a6e08078d15e3ef38c33777f0bfd6f6",
  "docker/postgres-init/04-optimization-views.sql.deferred": "a016ae3467abc1257f61ca7d51f1e7b72416bedfeb534f877c68f46dd4975ef9",
  "docker/postgres-init/11-canonical-proposals.sql": "dfecdb6c1c756ea29b6ff58173ad5bb33ee1f72d44b57e85df9a6ded74e973f5",
  "docker/postgres-init/12-ruvector-fallback.sql": "c4aba211e9b69d5a170af95a2f906191a15dd18aacc297f4e44ef37c1009b32d",
  "docker/postgres-init/16-ruvector-memories.sql": "61903521bbc8465186928af4f2b1e20633ac021c8b10021b9e5e06555190ebac",
  "docker/postgres-init/17-ruvector-fallback-sync.sql": "088407c08cceb3d4c9513f93af42cf421c33d905d1194ff65b241b75cf008cc8",
  "docker/postgres-init/21-graph-adapter-tables.sql": "f9a83a4483fe03f8e6303e9e3d68a129911c44c0baa760095da0d16bc4880e7f",
  "docker/postgres-init/24-graph-structural-context.sql": "d295069f64e40aaaaca254ff35fb252eec8e0d5bd5c6798aa55cf9b293185300",
}

// Only these specific negative assertions may name the retired backend.
// Matching whole lines prevents an unrelated new use in the same test escaping.
const rejectionLines: Record<string, string[]> = {
  "src/lib/db/__tests__/retirement-bootstrap.e2e.test.ts": [
    'for (const row of result.rows) expect(row.column_name).not.toMatch(/neo4j/i)',
    'expect(JSON.stringify(result.rows)).not.toMatch(/neo4j/i)',
  ],
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
  "src/lib/graph-adapter/__tests__/backend-config.test.ts": [
    'it.each(["neo4j", "definitely-invalid", " ", "ruvector "])("fails closed for unsupported config %s", (backend) => {',
  ],
}

export function isActiveSurface(path: string): boolean {
  if (historicalPrefixes.some((prefix) => path.startsWith(prefix))) return false
  // The detector and its hostile fixtures necessarily contain forbidden tokens.
  if (["scripts/check-retired-backend.ts", "tests/scripts/check-retired-backend.test.ts",
    ".github/scripts/docs-backend-residue-guard.sh", "scripts/inspect-results.txt",
    "packages/sdk/CHANGELOG.md"].includes(path)) return false
  return /^(src|packages|config|scripts|tests|docker|migrations|factory|json-schema|schemas|templates|examples|tooling|\.githooks|\.ralph|\.vscode|\.github|\.opencode|\.claude|\.codex|\.agents)\//.test(path)
    || /^[^/]+\.(?:jsonc?|ya?ml|toml|[cm]?[jt]s|sh)$/.test(path)
    || /^(AGENTS\.md|CLAUDE\.md|opencode\.jsonc?|package\.json|bun\.lock|env\.mjs|\.env\.example|Dockerfile[^/]*|docker-compose[^/]*|compose[^/]*|vitest\.config[^/]*)$/.test(path)
}

export function findRetiredReferences(path: string, content: string): string[] {
  if (!isActiveSurface(path)) return []
  if (historicalMigrations[path]) {
    return createHash("sha256").update(content).digest("hex") === historicalMigrations[path]
      ? [] : [`${path}: shipped migration digest mismatch; use a forward migration`]
  }
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
  if (existsSync(resolve(root, "docker/postgres-init"))) {
    for (const path of [...Object.keys(historicalMigrations), "docker/postgres-init/71-retired-storage-quarantine.sql"]) {
      if (!existsSync(resolve(root, path))) failures.push(`${path}: required migration missing`)
    }
  }
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
