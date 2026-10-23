/**
 * Regression coverage for docs-backend-residue-guard.sh (DW-2).
 *
 * Runs a copied guard in a temporary Git repository so its root discovery and
 * active-doc scan behave exactly as they do in CI.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

function makeGuardRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "allura-docs-guard-"));
  roots.push(root);
  mkdirSync(join(root, "docs", "allura"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(
    join(process.cwd(), ".github", "scripts", "docs-backend-residue-guard.sh"),
    join(root, "scripts", "docs-backend-residue-guard.sh"),
  );
  chmodSync(join(root, "scripts", "docs-backend-residue-guard.sh"), 0o755);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function runGuard(root: string, args: string[] = []): { status: number; output: string } {
  try {
    const output = execFileSync("bash", ["scripts/docs-backend-residue-guard.sh", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("docs-backend-residue-guard Markdown link coverage (DW-2)", () => {
  it("accepts inline, titled, and reference links, ignores code, and rejects a broken reference", () => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs", "allura", "TARGET.md"), "# Target\n");
    writeFileSync(
      join(root, "docs", "allura", "VALID.md"),
      [
        "[inline](TARGET.md)",
        "[titled](TARGET.md \"target\")",
        "[reference]: TARGET.md",
        "`[inline-code](MISSING-inline-code.md)`",
        "",
        "```md",
        "[fenced-code](MISSING-fenced-code.md)",
        "```",
        "",
      ].join("\n"),
    );
    expect(runGuard(root)).toMatchObject({ status: 0 });

    writeFileSync(join(root, "docs", "allura", "BROKEN.md"), "[missing]: MISSING.md\n");
    const broken = runGuard(root);
    expect(broken.status).not.toBe(0);
    expect(broken.output).toContain("broken reference link: MISSING.md");
  });
});


describe("docs-backend-residue-guard architecture consistency", () => {
  it.each([
    "guidelines/AI-GUIDELINES.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    ".opencode/DEVELOPMENT-READINESS.md",
    ".opencode/skills/allura-memory-skill/SKILL.md",
    ".opencode/skills/allura-dev-story/SKILL.md",
    ".opencode/skills/code-review/SKILL.md",
    ".opencode/skills/systematic-debugging-memory/SKILL.md",
  ])("checks backend drift in the active workflow entry point %s", (file) => {
    const root = makeGuardRepo();
    const target = join(root, file);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, "Query Neo4j for current architecture insights.\n");
    execFileSync("git", ["add", "--", file], { cwd: root });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${file}:1`);
    writeFileSync(target, "Use authenticated MCP tools for PostgreSQL semantic retrieval.\n");
    expect(runGuard(root)).toMatchObject({ status: 0 });
  });

  it.each([
    "## Neo4j: Memory",
    '  "neo4j_id": "uuid", // historical compatibility key; current data stored in Neo4j',
    "Graph selector defaults to `neo4j`; historical `neo4j` selector is rejected.",
    'description: "PostgreSQL, Neo4j, query optimization, data migration. Current store is Neo4j."',
    "No direct Neo4j writes; use neo4j-memory for recall.",
    "    participant Memory as neo4j-memory",
    "    MCP->>Neo4j: MERGE (m:Memory) — promote",
    "    NEO4J_MEMORY ||--o{ NEO4J_AGENT : AUTHORED_BY",
    "Use `neo4j-cypher` for current recall (AD-49 migration decision).",
    "Neo4j was retired; agents now query neo4j-memory first.",
    "Neo4j was removed but agents still query neo4j-memory first.",
    "| AD-23 | Skills route recall to neo4j-memory | Decided |",
    "| AD-45 | Neo4j bolt 7687 | Infrastructure remains unchanged |",
  ])("rejects current Neo4j claims even in decision logs: %s", (claim) => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs", "allura", "RISKS-AND-DECISIONS.md"), claim + "\n");
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain("RISKS-AND-DECISIONS.md:1");
  });

  it.each([
    "PostgreSQL (graph_memories) is sunset under AD-50.",
    "Historical: PostgreSQL (graph_memories)GraphAdapter was retired.",
    "| AD-50 | PostgreSQL (graph_memories) sunset | Decided |",
    "GRAPH_BACKEND flag must default to `PostgreSQL (graph_memories)`.",
    "| `PostgreSQL (graph_memories)` | Legacy backend |",
    "Load `src/lib/PostgreSQL (graph_memories)/connection.ts`.",
    "Load `src/lib/PostgreSQL semantic tables/queries/insert-insight.ts`.",
    '\"PostgreSQL (graph_memories)_id\": \"uuid\"',
    "| `graph_backend` | Target graph adapter: `PostgreSQL (graph_memories)` |",
  ])("rejects corrupt blind substitutions: %s", (claim) => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs", "allura", "DATA-DICTIONARY.md"), claim + "\n");
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain("corrupted PostgreSQL identifier");
  });

  it("preserves explicitly historical records and correct PostgreSQL descriptions", () => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs", "allura", "RISKS-AND-DECISIONS.md"), [
      "| AD-02 | Neo4j for semantic memory | Superseded by AD-50 | Original decision retained |",
      "Historical (superseded by AD-50): GRAPH_BACKEND=neo4j was the original default.",
      "Neo4j was sunset in Epic 23.",
      "| Neo4j bolt | 7687 | infra (exempt) — **retired** Epic 23 |",
      "| Neo4j HTTP | 7474 | infra (exempt) — **retired** Epic 23 |",
      "**ADR:** AD-29 — Graph Adapter Pattern (historical Neo4j → PostgreSQL migration)",
      '  "neo4j_id": "uuid", // historical compatibility key, not current backend',
      '  "neo4j_deprecated": true // historical compatibility example; producer verification required',
      "Graph selector defaults to `ruvector`; historical `neo4j` selector is rejected.",
      "Legacy dual-database, neo4j-tool, broad-dashboard claims below are historical/reconciliation debt.",
      "- Old Blueprint — **Superseded:** Older active copy with Neo4j-canonical language.",
      "AD-50 is the retirement decision for Neo4j; historical records are not approvals.",
      "This cutover removes the per-person Neo4j Community license limit.",
      "The Neo4j fallback was removed in Epic 23.",
      "Allura migrated from Neo4j to PostgreSQL-only.",
      "No Neo4j dependency remains.",
      "2. No direct Neo4j writes — Scout only writes episodic completion traces.",
      'description: "SPECIALIST — Data architect. PostgreSQL, Neo4j, query optimization, data migration."',
      "GRAPH_BACKEND=ruvector uses PostgreSQL (graph_memories) for graph persistence.",
      "These PG tables replace Neo4j nodes and relationships.",
      "Neo4j was",
      "retired in Epic 23.",
      "PostgreSQL (graph_memories) stores promoted semantic memory.",
      "`GRAPH_BACKEND=ruvector` selects `RuVectorGraphAdapter`.",
    ].join("\n"));
    const result = runGuard(root);
    expect(result.status, result.output).toBe(0);
  });

  it("does not let a historical heading hide an active diagram and ignores archived files", () => {
    const root = makeGuardRepo();
    mkdirSync(join(root, "docs", "archive"));
    writeFileSync(join(root, "docs", "archive", "OLD.md"), "GRAPH_BACKEND=neo4j\n");
    expect(runGuard(root)).toMatchObject({ status: 0 });
    writeFileSync(join(root, "docs", "allura", "BLUEPRINT.md"), [
      "## Historical comparison",
      "```mermaid",
      "  C9[(Neo4j 5.26 Semantic)]",
      "```",
    ].join("\n"));
    expect(runGuard(root).output).toContain("BLUEPRINT.md:3");
    expect(runGuard(root).status).toBe(1);
  });

  it("reports root governance drift by default and makes docs-only scope explicit", () => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "AGENTS.md"), "Neo4j remains as fallback under AD-49.\n");
    const full = runGuard(root);
    expect(full.status).toBe(1);
    expect(full.output).toContain("AGENTS.md:1");
    const docs = runGuard(root, ["--docs-only"]);
    expect(docs.status).toBe(0);
    expect(docs.output).toContain("runtime descriptions excluded by --docs-only");
  });

  it("scans tracked runtime descriptions and leaves vendored untracked content alone", () => {
    const root = makeGuardRepo();
    mkdirSync(join(root, ".agents"));
    writeFileSync(join(root, ".agents", "VENDORED.md"), "Use Neo4j for graph search.\n");
    expect(runGuard(root)).toMatchObject({ status: 0 });
    execFileSync("git", ["add", ".agents/VENDORED.md"], { cwd: root });
    expect(runGuard(root).status).toBe(1);
  });
});

describe("docs-backend-residue-guard local Notion snapshots", () => {
  const historical = [
    "<details>",
    "<summary>Historical snapshot — 2026-07-12 — not current specification</summary>",
    "GRAPH_BACKEND=neo4j",
    "```mermaid",
    "  MCP->>Neo4j: promote",
    "```",
    "</details>",
  ].join("\n");

  it("checks snapshots only when explicitly requested and retains line numbers after archived blocks", () => {
    const root = makeGuardRepo();
    const file = join(root, "notion-export.md");
    writeFileSync(file, historical + "\nCurrent recall uses neo4j-memory.\n");
    expect(runGuard(root)).toMatchObject({ status: 0 });
    const result = runGuard(root, ["--notion-snapshot", file]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("HISTORICAL EXCLUSION:");
    expect(result.output).toContain("notion-export.md:8");
    writeFileSync(file, historical + "\nCurrent memory uses PostgreSQL.\n");
    expect(runGuard(root, ["--notion-snapshot", file])).toMatchObject({ status: 0 });
  });

  it("fails closed on unclosed historical blocks and does not exempt arbitrary details", () => {
    const root = makeGuardRepo();
    const file = join(root, "notion-export.txt");
    writeFileSync(file, historical.replace("</details>", ""));
    const unclosed = runGuard(root, ["--notion-snapshot", file]);
    expect(unclosed.status).toBe(1);
    expect(unclosed.output).toContain("malformed or unclosed historical snapshot block");
    expect(unclosed.output).toContain("notion-export.txt:3");
    writeFileSync(file, "<details>\n<summary>Architecture</summary>\nneo4j-memory\n</details>");
    expect(runGuard(root, ["--notion-snapshot", file]).status).toBe(1);
  });

  it("accepts export directories but rejects missing, empty, unsupported, or unknown inputs", () => {
    const root = makeGuardRepo();
    const exports = join(root, "exports");
    mkdirSync(exports);
    expect(runGuard(root, ["--notion-snapshot", exports]).status).toBe(2);
    writeFileSync(join(exports, "Architecture.md"), "Stored in Neo4j.\n");
    expect(runGuard(root, ["--notion-snapshot", exports]).status).toBe(1);
    expect(runGuard(root, ["--notion-snapshot"]).status).toBe(2);
    expect(runGuard(root, ["--notion-snapshot", "missing.md"]).status).toBe(2);
    writeFileSync(join(root, "export.json"), "{}");
    expect(runGuard(root, ["--notion-snapshot", "export.json"]).status).toBe(2);
    expect(runGuard(root, ["--unknown"]).status).toBe(2);
  });
});

const canonical = ["BLUEPRINT.md", "SOLUTION-ARCHITECTURE.md", "DESIGN-ALLURA.md", "REQUIREMENTS-MATRIX.md", "RISKS-AND-DECISIONS.md", "DATA-DICTIONARY.md"];

function canonicalFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "allura-canonical-guard-"));
  roots.push(root);
  mkdirSync(join(root, "docs/allura"), { recursive: true });
  cpSync(join(process.cwd(), ".github/scripts/docs-allura-canonical-guard.sh"), join(root, "guard.sh"));
  for (const file of canonical) writeFileSync(join(root, "docs/allura", file), "# Specification\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function runCanonical(root: string) {
  const result = spawnSync("bash", ["guard.sh"], { cwd: root, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("closed canonical documentation set", () => {
  it("accepts exactly the six documents", () => {
    expect(runCanonical(canonicalFixture()).status).toBe(0);
  });

  it("rejects a missing governing document", () => {
    const root = canonicalFixture();
    rmSync(join(root, "docs/allura/DATA-DICTIONARY.md"));
    expect(runCanonical(root)).toMatchObject({ status: 1, output: expect.stringContaining("missing canonical document: docs/allura/DATA-DICTIONARY.md") });
  });

  it.each(["DESIGN-OTHER.md", "index.md", "PORTAL-DEPLOYMENT.md"])("rejects competing or supporting file %s", (name) => {
    const root = canonicalFixture();
    writeFileSync(join(root, "docs/allura", name), "# Supporting material\n");
    expect(runCanonical(root)).toMatchObject({ status: 1, output: expect.stringContaining(`non-canonical docs/allura file: ${name}`) });
  });

  it("rejects nested supporting material", () => {
    const root = canonicalFixture();
    mkdirSync(join(root, "docs/allura/evidence"));
    writeFileSync(join(root, "docs/allura/evidence/result.md"), "Evidence\n");
    expect(runCanonical(root)).toMatchObject({ status: 1, output: expect.stringContaining("nested non-canonical path: evidence/result.md") });
  });
});


describe("documentation promotion and storage contract", () => {
  it.each([
    "Auto-promote proposals >85% confidence without curator review (configurable).",
    "The service automatically promotes eligible proposals without human approval.",
    "Auto promotion proceeds without curator or human review.",
    "Never auto-promote without human review; auto-promote high scores without curator review.",
    "Memories flow through two stores depending on their confidence score.",
    "Semantic search across both stores.",
    "The retrieval gateway enforces contracts between agent reads and the dual stores.",
    "Retrieval no longer uses both stores, but semantic search spans two stores.",
  ])("rejects a current contract contradiction: %s", (claim) => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs/allura/BLUEPRINT.md"), claim + "\n");
    const result = runGuard(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toMatch(/promotion contract bypasses|contract describes multiple stores/);
  });

  it.each([
    "Never auto-promote proposals without curator review.",
    "Agents must not automatically promote proposals without human approval.",
    "| B19 | Auto-promote proposals without curator review | Superseded by mandatory HITL |",
    "Historical: Memories flow through two stores.",
    "Retrieval no longer reads from dual stores.",
    "Semantic search does not query both stores.",
    "Capture, review, and retrieval share PostgreSQL as the durable store.",
    "Pending proposals require human review; scores do not authorize promotion.",
  ])("preserves history and prohibitions: %s", (claim) => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs/allura/RISKS-AND-DECISIONS.md"), claim + "\n");
    const result = runGuard(root);
    expect(result.status, result.output).toBe(0);
  });
});

describe("runtime backend coverage", () => {
  it.each([
    "Historical: Neo4j was retired; current recall uses neo4j-memory.",
    "Historical: Neo4j was retired. Current recall uses neo4j-memory.",
    "Historical: an old policy; auto-promote proposals without human review.",
    "Historical: an old policy. Auto-promote proposals without curator approval.",
    "Historical: old storage; semantic search uses both stores.",
    "Historical: old storage. Retrieval crosses dual stores.",
  ])("historical qualification does not hide a later current claim: %s", (claim) => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs/allura/RISKS-AND-DECISIONS.md"), claim + "\n");
    const result = runGuard(root);
    expect(result.status, result.output).toBe(1);
  });

  it("preserves separately qualified dated historical clauses", () => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs/allura/RISKS-AND-DECISIONS.md"),
      "Historical (2026-05): recall used neo4j-memory; historical (2026-05): memories flowed through two stores. Historical (2026-05): auto-promote without human approval.\n");
    const result = runGuard(root);
    expect(result.status, result.output).toBe(0);
  });

  it.each([
    ".codex/agents/woz.toml",
    ".opencode/context/project-intelligence/technical-domain.md",
    ".opencode/context/project-intelligence/living-notes.md",
  ])("checks tracked runtime surface %s", (file) => {
    const root = makeGuardRepo();
    const parts = file.split("/");
    mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, file), "Neo4j is fallback only.\n");
    execFileSync("git", ["add", file], { cwd: root });
    const result = runGuard(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain(`${file}:1`);
    expect(runGuard(root, ["--docs-only"]).status).toBe(0);
  });

  it("accepts explicit retirement and rejects current fallback after a TOML capability inventory", () => {
    const root = makeGuardRepo();
    mkdirSync(join(root, ".codex/agents"), { recursive: true });
    const file = ".codex/agents/knuth.toml";
    const metadata = 'description = "Data architect. PostgreSQL, Neo4j, query optimization, data migration."\n';
    writeFileSync(join(root, file), metadata + "Neo4j is permanently retired. GRAPH_BACKEND=neo4j is rejected.\n");
    execFileSync("git", ["add", file], { cwd: root });
    const accepted = runGuard(root);
    expect(accepted.status, accepted.output).toBe(0);
    writeFileSync(join(root, file), metadata + "Neo4j is fallback only.\n");
    expect(runGuard(root).status).toBe(1);
  });
});
