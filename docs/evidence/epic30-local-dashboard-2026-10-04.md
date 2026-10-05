# Epic 30 Local Dashboard Evidence — 2026-10-04

## Decision

**LOCAL HEALTH/DATA PATH: PASS**
**AUTHENTICATED DASHBOARD UX: BLOCKED**
**PUBLIC RELEASE / PUSH: NOT RUN**

This is a local-only evidence record. It does not claim the dashboard is shipped, production-ready, publicly tested, or approved for release.

## Target lock

- Worktree: `/home/roninhub/git/Allura-Ecosystem/epic30-recovery`
- Branch: `codex/epic30-recovery-20260927`
- Starting HEAD: `cbfd7c590863ee2d4c75bfa9d7c08a4d8ec62d29`
- Checkpoint: `checkpoint/epic30-local-run-start-20261004` → starting HEAD
- Code-only diff SHA-256 used for the final image: `e63685fe7bd52f564663519a804ffc00c945d992e01b62b230baa02ca47a6bdb`
- Final local image tag: `allura-memory-portal:epic30-local-cbfd7c590-e63685fe7`
- Final local image ID: `sha256:77fd57f12d4fa44331c01d7bcc3314b827fd08045446ea85dd51b05114dffd8a`
- Local portal: `http://127.0.0.1:3200`
- Internal MCP endpoint: `http://allura-memory-mcp:3201/mcp`
- Probe tenant: `allura-faithmeats`

## Scope

Changed production/test files:

1. `src/lib/brain-client.ts`
2. `src/lib/brain-client.test.ts`
3. `src/app/api/brain/health/route.ts`
4. `src/lib/digital-brain/legacy-api-quarantine.test.ts`
5. `src/__tests__/epic30-controlled-red-privacy.test.ts`

Evidence files:

- `docs/evidence/epic30-local-dashboard-2026-10-04.md`
- `docs/evidence/epic30-local-dashboard-2026-10-04/receipt.json`
- `docs/evidence/epic30-local-dashboard-2026-10-04/login-desktop.png`
- `docs/evidence/epic30-local-dashboard-2026-10-04/login-mobile.png`

No production reader, route-manifest, tenant-authority, database schema, Cloudflare, DNS, tunnel, or Git remote file was changed.

## Implemented contract

- Exact public MCP endpoint remains `https://mcp.faithmeats.org/mcp` and requires Bearer plus Cloudflare Access service headers.
- Exact internal MCP endpoint is `http://allura-memory-mcp:3201/mcp` and sends only `Authorization: Bearer …`.
- Near-miss, loopback, arbitrary local, and arbitrary remote endpoint values fail closed before fetch.
- `ALLURA_BRAIN_PROBE_GROUP_ID` is environment-derived only and validated by the repository group-ID contract.
- Invalid probe tenant, missing bearer, wrong bearer, MCP error envelopes, partial reports, and unrecognized status strings fail closed.
- The public `/api/brain/health` response is rebuilt from scratch and exposes only `{ "overall_status": <allowlisted status> }`. MCP metadata, subsystem details, exception strings, latency, counts, tool names, and unknown fields are never forwarded.
- Quarantined Brain content routes remain quarantined.

## Context7 receipt

- Required: yes
- Library: `/modelcontextprotocol/typescript-sdk`
- Topic: Streamable HTTP authentication headers
- Finding: current SDK documentation shows Bearer authentication applied through request headers to initialize and subsequent MCP requests. The exact endpoint allowlist and tenant rules remain repository-owned contracts.

## Test receipts

### Final focused gate

```text
Test Files  3 passed (3)
Tests       56 passed | 3 skipped (59)
```

Command:

```text
bun x vitest run --config vitest.config.epic30-hermetic.ts \
  src/lib/digital-brain/legacy-api-quarantine.test.ts \
  src/__tests__/epic30-controlled-red-privacy.test.ts \
  src/lib/brain-client.test.ts
```

The three skips are existing `RUN_E2E_TESTS`-gated live contracts.

### Final Epic 30 hermetic gate

```text
Test Files  39 passed (39)
Tests       447 passed | 3 skipped (450)
```

`bun run test:epic30-hermetic` includes `tsc --noEmit`; typecheck passed.

### Hygiene

- `git diff --check`: pass
- Changed-file ESLint: 0 errors; pre-existing import-order/unused warnings remain
- Added-line secret scan: no private key, generic secret, or bearer-literal hits

## Build receipt

The first normal `bun run build` compiled successfully but its duplicate TypeScript worker was killed under host memory pressure. Next.js Context7 documentation permits skipping build-time TypeScript validation when a dedicated typecheck has already passed.

Final build procedure:

1. `bun run test:epic30-hermetic` passed and included `tsc --noEmit`.
2. A temporary, uncommitted `next.config.ts` switch enabled `typescript.ignoreBuildErrors` only for the low-memory build.
3. `NEXT_BUILD_SKIP_TYPECHECK=true NODE_OPTIONS=--max-old-space-size=2048 bun run build` passed, including static generation of 70/70 pages.
4. The temporary config change was immediately reverted; `next.config.ts` is not in the source diff.
5. `Dockerfile.portal-prebuilt` packaged that exact standalone output into the image identified above.

The generated `.next/required-server-files.json` truthfully records that build-time typechecking was skipped. This is paired with the separate passing full typecheck receipt; it is not represented as a normal all-in-one build.

## Runtime receipts

Only `allura-human-portal` was recreated. `allura-memory-mcp` and `knowledge-postgres` retained their earlier start timestamps and were not recreated.

| Gate | Result |
|---|---:|
| Portal container health | healthy |
| `GET /api/health/live` | 200, `alive=true` |
| `GET /api/health/ready` | 200, `ready=true` |
| Readiness PostgreSQL dependency | healthy |
| Readiness MCP dependency | healthy |
| `GET /api/brain/health` | 200, body exactly `{"overall_status":"healthy"}` |
| MCP initialize, authorized scoped bearer | 200 |
| MCP initialize, missing bearer | 401 |
| MCP initialize, wrong bearer | 401 |
| Cloudflare service credentials in portal runtime | absent |
| Portal restart count after recreate | 0 |

The protected bearer value was never printed, written to Git, placed in evidence, or copied into a Compose file. The temporary Compose override references only the protected environment-variable name.

## Browser/UX receipts

Real headless Chromium was used against the exact local image on desktop (1440×1000) and mobile (390×844).

| Interaction/state | Desktop | Mobile |
|---|---:|---:|
| Login route renders | PASS | PASS |
| Honest `Authentication unavailable` state | PASS | PASS |
| `/dashboard` redirects to login | PASS | PASS |
| `/dashboard/search` redirects to login | PASS | PASS |
| `/dashboard/kanban` redirects to login | PASS | PASS |
| `/dashboard/teams` redirects to login | PASS | PASS |
| Brain health fetch in browser | 200 / healthy | 200 / healthy |
| Console errors | 0 | 0 |
| Page errors | 0 | 0 |
| External origins contacted | 0 | 0 |
| Authenticated dashboard controls/buttons | **BLOCKED** | **BLOCKED** |

Security headers observed: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.

Visual inspection found no clipping or overlap. The fallback state is readable and truthful, but visually bare: flush-left desktop content, minimal spacing, and no recovery action.

Final browser artifact SHA-256 values:

- `receipt.json`: `fb3e28792c1a9d80591a554defdbc56f106aae73fda960ad55021365fb76ff4c`
- `login-desktop.png`: `bc69c79a7c93a24d0b8a1d758839f6b3ec5441dde668f61a5d177fe8cc62454f`
- `login-mobile.png`: `9d3c496ddb955836560276a8aa49fe08dd47b38e374611c5d40b9e3343597f13`

## Real blocker

The production-mode local portal has no legitimate identity provider:

- `NODE_ENV=production`
- `ALLURA_DEV_AUTH_ENABLED=false`
- Cloudflare Access identity mode not enabled locally
- Clerk publishable/secret keys absent

Therefore login, logout, authenticated navigation, search/filter controls, work-item controls, button enabled/disabled states, and authorized dashboard row rendering cannot be honestly exercised on the target portal. Forged Cloudflare assertions and production dev-auth bypasses were not used.

Required owner action: approve and provision a legitimate local identity path or separately authorize a public Cloudflare Access browser test. Until then, authenticated UX and release readiness remain blocked.

## Independent review history

- Initial Pike Astra verdict: **BLOCK** — public health route could forward raw subsystem `detail` strings. Remediated with a strict bounded public body and RED→GREEN disclosure tests.
- Initial Fowler Astra verdict: **BLOCK** — code was acceptable in scope, but durable delivery/build/UX evidence was incomplete and authenticated UX remained unproven.
- Final Pike Astra verdict: **APPROVE** — security delta is safe for a blocked local checkpoint; release-ready is false.
- Final Fowler Astra verdict: **APPROVE** — a truthful local BLOCKED checkpoint commit is allowed; release-ready is false.

Both final reviewers explicitly limited approval to local preservation. Authenticated UX, push, deployment, and release remain blocked.

## Prohibited actions confirmed

- GitHub authentication repair: not run
- Git push/PR/merge: not run
- Cloudflare/DNS/tunnel changes: not run
- Public dashboard test: not run
- Production deployment: not run
- MCP/PostgreSQL recreation: not run
- Shared business-data mutation: not run

## Current disposition

The internal local MCP health/data path is verified and fail-closed. The code and runtime are ready for final independent delta review. The overall local dashboard completion gate remains **BLOCKED** on legitimate authenticated UX proof. No completion claim or public release claim is authorized by this report.
