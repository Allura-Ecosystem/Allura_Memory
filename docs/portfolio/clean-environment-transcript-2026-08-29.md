# Clean-Environment Quickstart Transcript (Story 24.7 AC-7 / CA-24-09)

**Date:** 2026-08-29
**Machine profile:** x86_64, 16 cores, 30 GiB RAM, Bun 1.3.14, Linux
**Cache state:** WARM — Docker image cache populated, `node_modules` installed,
PostgreSQL container already running. This is a **warm-cache measurement**;
a true cold-cache run (fresh clone + cold Docker pull) is not yet recorded.
**Gateway state:** PostgreSQL up (localhost:5432); MCP gateway container not
running during this measurement — gateway-dependent steps (health, MCP
round-trip) are covered by the live-DB e2e lane instead.

## Measured steps (warm cache)

| Step | Command | Elapsed |
|------|---------|---------|
| 1. Install deps | `bun install` | not re-measured (node_modules present) |
| 2. SDK build | `cd packages/sdk && bun run build` | 1.7 s |
| 3. Typecheck | `bun run typecheck` | 2.5 s |
| 4. Unit tests | `bun run test:unit` | 5.7 s |
| 5. Eval suite | `bun run eval:portfolio` | 0.05 s (deterministic offline lanes) |
| 6. Scenario run | `bun run scripts/harness.ts examples/engineering-review-agent/scenarios/success.json` | 34.9 s (includes DB registration) |
| 7. Residue guard | `bash .github/scripts/docs-backend-residue-guard.sh` | <1 s |

**Total active command time (steps 2–7):** ~45 s warm cache.

## Honest caveats

1. **Warm cache, not clean environment.** The 9–10 minute target in
   `docs/quickstart.md` assumes a cold Docker pull + fresh clone. This
   transcript measures the warm-cache path only. A cold-cache transcript
   requires a fresh clone and `docker compose pull` on a machine without the
   images — not yet executed.
2. **Gateway-dependent steps not measured here.** The MCP gateway container
   was not running during this measurement. The SDK↔gateway contract is
   covered by `sdk-gateway-integration.e2e.test.ts` in the live-DB e2e lane
   (RUN_E2E_TESTS=true), which starts the full stack.
3. **`allura up` fresh-clone path unverified.** The compose file documents
   that a naive `docker compose up` fails on a fresh machine (external
   network/volumes). The bootstrap path (`bun run brain:up`) is the
   supported entrypoint; its clean-machine execution is part of the
   cold-cache transcript still outstanding.

## Status

- **AC-7 (24.7):** partial — warm-cache timing recorded; cold-cache
  transcript remains open (tracked as follow-up item 18).
- **CA-24-09:** in-progress — SDK compatibility proven (build + contract
  tests + gateway integration test); clean-environment timed transcript
  still outstanding.
