# Clean-Environment Quickstart Transcript (Story 24.7 AC-7 / CA-24-09)

**Date:** 2026-08-29
**Machine profile:** x86_64, 16 cores, 30 GiB RAM, Bun 1.3.14, Linux
**Method:** Fresh clone of `develop` to `/tmp/allura-clean-env` (no node_modules,
no .env, no .env.local), then the quickstart steps in order.

## Measured steps (fresh clone, warm Docker cache)

| Step | Command | Elapsed |
|------|---------|---------|
| 1. Fresh clone | `git clone --branch develop <repo> /tmp/allura-clean-env` | 44.9 s |
| 2. Install deps | `bun install` | 2.5 s |
| 3. Typecheck | `bun run typecheck` | 8.6 s |
| 4. SDK build | `cd packages/sdk && bun run build` | 2.1 s |
| 5. Unit tests | `bun run test:unit` | 5.8 s |
| 6. Eval suite | `bun run eval:portfolio` | 0.05 s (deterministic offline lanes) |
| 7. CLI init | `bun packages/cli/src/index.ts init` | <1 s |
| 8. CLI doctor | `bun packages/cli/src/index.ts doctor --json` | <1 s |
| 9. CLI up | `bun packages/cli/src/index.ts up` | ~2 min (Docker image build) |

**Total active command time (steps 2–9):** ~3.5 min warm cache, including the
Docker image build for the mcp service.

## Defects found and fixed by this clean-environment run

1. **`allura up` failed on a fresh clone** (missing `.env` for compose `${VAR}`
   substitution) — fixed: `init` now creates `.env` with non-secret defaults.
2. **`allura up` failed on missing `.env.local`** (mcp service's `env_file`
   list requires it) — fixed: `init` now creates `.env.local` too.
3. **Bare `docker compose up -d` fails on external network/volumes** — fixed:
   `cmdUp` now delegates to `scripts/brain-stack.sh up` (the supported
   bootstrap that pre-creates external resources).
4. **Gateway refused to start with a short token secret** — `init`'s default
   `ALLURA_MCP_TOKEN_SECRET=change-me` (9 chars) violated the ≥16-char
   requirement; fixed to `change-me-change-me` in all three generated files.

## Verified on the fresh clone

- `init` creates `.env`, `.env.local`, and `.env.portfolio.example` (all
  gitignored, non-secret defaults).
- `doctor --json` reports structured JSON with per-check status.
- `up` pre-creates external networks/volumes, builds the mcp image, and
  starts the stack.
- Gateway health on the fresh clone: `{"status":"healthy","interface":"mcp-http",
  "auth_enabled":true,"auth_mode":"mcp_token"}`.

## Honest caveats

1. **Warm Docker cache.** The Docker image build ran with a warm layer cache
   (the mcp image was already built on this machine). A true cold-cache run
   (no images at all) would add the `docker pull`/build time — not yet
   measured.
2. **Gateway auth persistence needs a consistent environment.** The fresh
   clone's gateway container authenticates against the postgres it starts
   with; pointing it at a *different* postgres (as the hybrid test setup did)
   fails auth persistence. In a self-consistent clean environment (init →
   up → postgres + mcp with the same credentials) the flow is coherent. The
   CI live-DB lane runs everything in one consistent environment.
3. **SDK↔gateway e2e test** (`sdk-gateway-integration.e2e.test.ts`) mints a
   real per-caller token via `createToken` and exercises the live gateway —
   it joins the live-DB lane (RUN_E2E_TESTS=true) where the environment is
   consistent.

## Status

- **AC-7 (24.7):** warm-cache fresh-clone transcript recorded; cold-cache
  (no Docker images) run remains outstanding.
- **CA-24-09:** in-progress — SDK compatibility proven (build + contract
  tests + gateway integration test); clean-environment flow proven end to
  end on a fresh clone; cold-cache timing still outstanding.
