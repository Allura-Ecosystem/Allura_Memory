/**
 * Vitest Config — Unit Lane
 *
 * Pure logic only. No database. No Ollama. No Notion. No MCP browser.
 * Pure functions, type validation, scoring, dedup, similarity, etc.
 *
 * If a test needs PostgreSQL, Neo4j, or any external service, it belongs
 * in the integration lane — NOT here.
 */
import { config } from "dotenv"
import { defineConfig } from "vitest/config"
import path from "node:path"

config()

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    passWithNoTests: true,
    include: [
      // ── Pure unit tests (no DB, no external services) ──────────────────
      // Benchmark harness metric math (Precision@K, Recall@K, MRR, percentiles)
      "src/__benchmarks__/**/*.test.ts",
      // Scoring, dedup, similarity, budget, circuit breaker
      "src/lib/curator/**/*.test.ts",
      "src/lib/budget/**/*.test.ts",
      "src/lib/circuit-breaker/**/*.test.ts",
      "src/lib/dedup/**/*.test.ts",
      "src/lib/git/**/*.test.ts",
      // Story 26.2 — read-only supply-chain inventory. Was never added to this
      // lane despite merging (PR #108); found and fixed 2026-08-27.
      "src/lib/inventory/**/*.test.ts",
      // Story 26.3 — exposure matcher. Same gap as 26.2, same fix.
      "src/lib/exposure/**/*.test.ts",
      // Story 26.4 — scheduled discovery and alert routing.
      "src/lib/threat-discovery/**/*.test.ts",
      // Story 26.4 Slice B — external advisory ingestion. All HTTP calls
      // mocked; no live network access in the test suite itself.
      "src/lib/threat-ingestion/**/*.test.ts",
      // Story 26.6 — containment connectors and response receipts.
      "src/lib/containment/**/*.test.ts",
      // Story 26.7 — incident replay through the real pipeline, and the
      // Bumblebee operator module's fail-closed/rollback behaviour.
      "src/lib/replay/**/*.test.ts",
      "src/lib/bumblebee/**/*.test.ts",
      "src/mcp/governed-lane-tools.test.ts",
      // Story 27.3 — governed promotion adapter: proposal conversion,
      // receipts, quarantine, and rollback (pure logic, mocked queryable).
      "src/lib/branch/**/*.test.ts",
      // Story 27.5 — Team RAM / Durham branch workflow lanes: sole-writer
      // ownership, Durham manifests, Munari/Rand review gate (pure logic,
      // mocked queryable; no DB/network).
      "src/lib/branch-workflows/**/*.test.ts",
      // SONA vs AgentDB retrieval-learning evaluation harness
      // (pure logic, hermetic in-memory arms; no DB/network).
      "src/lib/branch-eval/**/*.test.ts",
      // Story 27.6 — epic gate: enforcement checks (isolation/poisoning/
      // replay/tamper/quota/expiry/rollback) and the release manifest
      // builder (pure logic, mocked queryable; no DB/network).
      "src/lib/branch-gate/**/*.test.ts",
      // Story 26.5 — governed mitigation drafts must stay in the CI unit lane.
      "src/lib/mitigation/**/*.test.ts",
      // Story 24.5 — deterministic scenario harness. Hermetic: engine DB
      // singletons + connection pool mocked to an in-memory store, so the
      // lane runs with no live PostgreSQL.
      "src/lib/harness/**/*.test.ts",
      // Story 24.6 — portfolio evaluation runner/report unit tests (hermetic:
      // offline fixture datasets only, no DB/network).
      "src/lib/evals/**/*.test.ts",
      "src/lib/memory/config.test.ts",
      "src/lib/memory/embeddings.test.ts",
      "src/lib/memory/types.test.ts",
      "src/lib/memory/writer.test.ts",
      "src/lib/memory/relationships/*.test.ts",
      "src/lib/memory/__tests__/approval-audit.test.ts",
      "src/lib/memory/traceable-memory.test.ts",
      "src/lib/memory/approve-proposal.test.ts",
      "src/lib/memory/governance-receipt-writer.test.ts",
      "src/lib/memory/retrieval-authority.test.ts",
      "src/lib/memory/proposal-semantic-projection.test.ts",
      "src/lib/memory/decision-trigger-metadata-contract.test.ts",
      "src/lib/memory/__tests__/decision-delegation.test.ts",
      "src/lib/session/**/*.test.ts",
      // Command Center header live-state source (mocked pool — pure logic)
      "src/lib/operational-state/sources/header-source.test.ts",
      "src/lib/validation/encoding-validator.test.ts",
      "src/lib/validation/group-id.test.ts",
      "src/lib/mcp/enforced-client.test.ts",
      "src/lib/mcp/trace-middleware.test.ts",
      "src/lib/mcp/wrapped-client.test.ts",
      "src/lib/ruvector/embedding-service.test.ts",
      // ControlPlane
      "src/control-plane/**/*.test.ts",
      // Auto-Curator pure-unit tests are listed explicitly below; database E2Es
      // remain in vitest.config.live-db.ts.
      // API route tests (mocked DB)
      "src/__tests__/api-degradation.test.ts",
      "src/__tests__/auth-middleware.test.ts",
      "src/__tests__/auth-roles.test.ts",
      "src/__tests__/cors-middleware.test.ts",
      "src/__tests__/graph-route.test.ts",
      "src/__tests__/health-metrics.test.ts",
      "src/__tests__/health-metrics-scope.test.ts",
      "src/__tests__/health-probes.test.ts",
      "src/__tests__/curator-approve-route.test.ts",
      "src/__tests__/curator-proposals-route.test.ts",
      "src/__tests__/curator-reject-route.test.ts",
      "src/__tests__/contract-validation.test.ts",
      // DW-2 — executable regression coverage for the canonical-docs shell guard.
      "src/__tests__/docs-backend-residue-guard.test.ts",
      "src/__tests__/sentry-integration.test.ts",
      "src/__tests__/sentry-wiring.test.ts",
      "src/__tests__/byok-key-manager.test.ts",
      // Backup automation (pure logic, mocked deps)
      "src/__tests__/backup-automation.test.ts",
      // Self-healing auto-recovery (pure decision logic, mocked deps — Story 2.3)
      "src/__tests__/auto-recovery.test.ts",
      // Token compliance validation (Story 2.7)
      "src/__tests__/token-compliance.test.ts",
      // Retrieval benchmark (FR-1.2 — mocked DB/services)
      "src/__tests__/retrieval-benchmark.test.ts",
      // TraceMiddleware (Story 1.2)
      "src/__tests__/trace-middleware.test.ts",
      // SONA Trajectory Engine (Story 1.3)
      "src/__tests__/trajectory-engine.test.ts",
      // Skill usage tracker (Story 1.2)
      "src/__tests__/skill-usage-tracker.test.ts",
      // Genesis Engine (Story 2.2) — pattern detector + proposal generator
      "src/__tests__/genesis-engine.test.ts",
      // Team RAM
      "src/team-ram/orchestrator.test.ts",
      "src/team-ram/orchestration-tracing.test.ts",
      "src/team-ram/mcp-skill-executor.test.ts",
      // Curator workers
      "src/curator/embedding-backfill-worker.test.ts",
      "src/curator/notion-sync.test.ts",
      "src/curator/approve-cli.test.ts",
      // UI unit tests (Story 11.2 — toast system)
      "src/__tests__/toast.test.tsx",
      // UI unit tests (Story 16.3 — 3-pane inspector)
      "src/__tests__/inspector-panel.test.tsx",
      // UI unit tests (Story 26.7 — Bumblebee operator surfaces, ARIA/keyboard)
      "src/__tests__/bumblebee-surfaces.test.tsx",
      // Story 25.3b — server-issued curator shell state/accessibility.
      "src/__tests__/curator-module-shell.test.tsx",
      // Story 25.3b — executing test for the production /dashboard/curator
      // page wiring (issuance→shell, degraded state, denied scope).
      "src/__tests__/curator-handoff-page.test.tsx",
      "src/__tests__/curator-dashboard.test.tsx",
      // UI unit tests — inspector entity views (6 view components)
      "src/__tests__/inspector-views.test.tsx",
      // Dashboard pages (Story 16.4 — approvals/handoffs/evidence)
      "src/__tests__/dashboard-approvals.test.ts",
      // Dashboard operational state tests (Tasks 5-8)
      "src/__tests__/dashboard-pages-5-8.test.ts",
      // Server actions (Stories 16.5, 16.6)
      "src/server/**/*.test.ts",
      // Script-level guardrail tests (GIT-EXEC-001)
      "tests/scripts/**/*.test.ts",
      // Allura Hosted — Guard gateway + MCP token (pure logic, no DB)
      "src/lib/guard/**/*.test.ts",
      "src/lib/mcp-token/**/*.test.ts",
      // Story 24.2 — Authenticated principal context (pure logic, injected deps)
      "src/lib/auth/__tests__/principal-context.test.ts",
      "src/lib/auth/__tests__/dev-auth-production-guard.test.ts",
      "src/lib/auth/__tests__/principal-audit.test.ts",
      "src/lib/auth/__tests__/budget-scope.test.ts",
      // Story 24.11a AC-7 — withPermission enforces its PermissionAction argument
      "src/lib/auth/__tests__/with-permission-action.test.ts",
      // Story 24.12 — effective-tenant authority seam (pure logic)
      "src/lib/auth/__tests__/api-tenant-seam.test.ts",
      "src/lib/auth/__tests__/web-principal.test.ts",
      "src/__tests__/mcp-auth-adversarial.test.ts",
      // Allura Hosted — admin route auth/shape tests (mocked repos)
      "src/__tests__/hosted-admin-routes.test.ts",
      // Benchmark harness — pure IR-metric math (no live stack)
      "src/__benchmarks__/lib/metrics.test.ts",
      // Graph adapter — ruvector-crate subset parity (fake fixture by default;
      // real binding opt-in via RUVECTOR_TEST_BINDING_PATH — no DB either way)
      "src/lib/graph-adapter/__tests__/ruvector-crate-adapter.subset.test.ts",
      // Coherence Monitor (Story 2.1) — pure detectors + monitor with mocked deps
      "src/__tests__/coherence-monitor.test.ts",
      // Coherence Monitor API routes (Story 2.1) — mocked auth/pool
      "src/__tests__/coherence-routes.test.ts",
      // Story 24.7 — SDK public contract + CLI command surface (hermetic:
      // injected fetch / subprocess; no server, no DB).
      "packages/sdk/test/**/*.test.ts",
      "packages/cli/src/**/*.test.ts",
    ],
    exclude: [
      // ── Integration tests (mocked DB/services) — use test:integration ──
      "src/__tests__/canonical-memory.test.ts",
      "src/__tests__/memory-search-ruvector.test.ts",
      "src/__tests__/notion-sync*.test.ts",
      "src/__tests__/notion-projection-sync.test.ts",
      "src/__tests__/mcp-catalog.test.ts",
      "src/__tests__/mcp-streamable-http.test.ts",
      "src/__tests__/neo4j-writer-errors.test.ts",
      "src/__tests__/generate-agent.test.ts",
      "src/__tests__/knowledge-hub-bridge.test.ts",
      "src/__tests__/parity-test.test.ts",
      "src/lib/ruvector/bridge.test.ts",
      "src/lib/ruvector/retrieval-adapter.test.ts",
      "src/lib/neo4j/connection.test.ts",
      "src/lib/postgres/connection.test.ts",
      "src/lib/neo4j/queries/*.test.ts",
      "src/lib/postgres/queries/*.test.ts",
      "src/lib/postgres/trace-logger.test.ts",
      "src/integrations/mcp.client.test.ts",
      "src/lib/validation/group-governance.test.ts",
      "src/lib/validation/trace-ref.test.ts",
      "src/lib/agents/agent-manifest.test.ts",
      "src/lib/memory/__tests__/approval-audit.test.ts",
      // ── DB-backed Story 24.4 / workspace E2Es — use test:live-db ──
      "src/__tests__/curator-approve.test.ts",
      "src/__tests__/curator-reject.test.ts",
      "src/__tests__/watchdog-sustained.test.ts",
      "src/__tests__/auto-curator-workspace-authority.e2e.test.ts",
      // ── E2E tests — use test:e2e ──
      "src/__tests__/e2e-integration.test.ts",
      "src/__tests__/curator-pipeline.e2e.test.ts",
      "src/__tests__/ruvector-e2e.test.ts",
      "src/__tests__/graph-route.e2e.test.ts",
      "src/team-ram/e2e-smoke.test.ts",
    ],
    testTimeout: 10_000,
    // Enable per-file environment override (e.g. @vitest-environment jsdom in toast.test.tsx)
    environmentMatchGlobs: [
      ["src/__tests__/toast.test.tsx", "jsdom"],
      ["src/__tests__/inspector-panel.test.tsx", "jsdom"],
      ["src/__tests__/inspector-views.test.tsx", "jsdom"],
      ["src/__tests__/bumblebee-surfaces.test.tsx", "jsdom"],
      ["src/__tests__/curator-dashboard.test.tsx", "jsdom"],
    ],
  },
  resolve: {
    alias: [
      { find: "@allura/types", replacement: path.resolve(__dirname, "./packages/types/src/index.ts") },
      { find: "@allura/rbac", replacement: path.resolve(__dirname, "./packages/rbac/src/index.ts") },
      { find: "@allura/mcp-server", replacement: path.resolve(__dirname, "./packages/mcp-server/src/index.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})
