# Local CI Partial Evidence — 2026-05-17

> [!NOTE]
> **AI-Assisted Documentation**
> This evidence was drafted with AI assistance. It is local command evidence,
> not a replacement for GitHub checks.

## Scope

This artifact records local CI-equivalent evidence gathered while working
toward `docs/goal.md`.

GitHub CI was not queried in this session. Treat this as partial local evidence
only.

## Commands And Results

| CI Lane | Command | Result |
| --- | --- | --- |
| Typecheck | `bun run typecheck` | Passed |
| Lint | `bun run lint` | Passed; currently aliases `bun run typecheck` in `package.json` |
| Unit | `bun run test:unit` | Passed: 51 files passed, 7 skipped; 1131 tests passed, 159 skipped |
| Curator | `bun run test:curator` | Passed: 6 files passed, 1 skipped; 112 tests passed, 8 skipped |
| Integration | `bun run test:integration` | Passed: 21 files passed, 3 skipped; 402 tests passed, 46 skipped |
| Focused roadmap suite | Board/governance/cutover/domain/release tests | Passed: 40 tests, 0 failures, 127 assertions |
| MCP server build | `bun build src/mcp/memory-server-canonical.ts --outdir dist/mcp --target node` | Passed |
| Next production build | `timeout 180s bun run build` | Failed by timeout; exited with code 124 / build script code 143 |

## Fixes Made During CI Evidence Collection

- `src/__tests__/graph-route.test.ts`
  - Removed stale hardcoded absolute path with a space-containing old project
    path.
  - Reads the route source from `process.cwd()` instead.
- `src/__tests__/trace-middleware.test.ts`
  - Updated stale expectations from removed HTTP trace-fetch middleware.
  - Now tests the current Next 16 proxy behavior: dev auth pass-through,
    `x-allura-*` header injection, public/static route pass-through, and
    matcher shape.

## Current Decision

CI status is **PARTIAL**.

The local typecheck, lint, unit, curator, integration, focused roadmap suite,
and MCP server build lanes are green. Final CI cannot be called green because:

- GitHub checks were not fetched.
- Next production build timed out locally.
- E2E tests require live PostgreSQL and Neo4j service containers.
- Board-route MCP/browser screenshot evidence is recorded in
  `artifacts/board-screenshot-evidence-2026-05-17.md`, with Notion
  `3631d9be-65b3-8167-af39-fe1e8e0a074c` and Brain
  `7ab42d42-78d3-4a34-95b6-be7f8089d490`; full release browser validation
  remains open.

Do not use this artifact as final release approval.

## Audit Receipts

- Notion: `3631d9be-65b3-8189-a83a-dd5756cce43e`
- Allura Brain: `6a329870-61f2-4808-a54e-92f2ab7e7967`
