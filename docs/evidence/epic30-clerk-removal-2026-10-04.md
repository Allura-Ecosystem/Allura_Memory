# Epic 30 Clerk Removal — Local Verification Receipt

**Date:** 2026-10-04
**Branch:** `codex/epic30-recovery-20260927`
**Baseline:** `a0f84d540f410b4696dc618f417b5c0aff76278e`
**Rollback branch:** `checkpoint/epic30-pre-clerk-removal-20261004`
**Scope:** remove Clerk from the active dashboard and device-pairing runtime; preserve fail-closed production behavior; do not enable Cloudflare Access, push, deploy, change DNS, or modify public routing.

## Architecture result

- `@clerk/nextjs` is absent from `package.json` and `bun.lock`.
- `src/app/clerk-provider.tsx`, `src/app/clerk-sign-in.tsx`, and `src/lib/auth/clerk.ts` are deleted.
- Active environment schemas/examples contain no `NEXT_PUBLIC_CLERK_*` or `CLERK_SECRET_KEY` variables.
- Layout and proxy no longer load or invoke Clerk.
- Production identity target is Cloudflare Access only.
- With Cloudflare Access disabled, production returns no principal and denies protected content.
- DevAuth remains explicit and nonproduction-only.
- Device-pairing recovery/audit contracts are provider-neutral (`interactive_identity_required`, `web_session`).
- The retired external Clerk E2E harness is deleted; the provider-neutral local browser→pairing→MCP scaffold remains.
- Legacy Clerk-key patterns remain in credential scanners intentionally so retired credentials can still be detected.
- Historical evidence remains historical. Current planning and architecture documents carry 2026-10-04 supersession notes.

## TDD receipts

A focused RED run after changing the remaining device-pairing and portal expectations failed in the expected six provider-specific assertions. The minimal provider-neutral implementation then made the same focused command green.

Final focused auth/removal lane:

```text
122 tests passed; 0 failed
```

The dedicated removal contract is registered in `vitest.config.unit.ts` and asserts package, lockfile, source imports, deleted runtime files, environment surface, layout, login surface, production fail-closed behavior, and nonproduction DevAuth.

Independent review then found one blocking operator-guidance defect and two low findings. A second RED run proved all three before remediation: (1) `.env.example` and `restore-on-laptop.sh` recommended enabling the unverified header-presence path, (2) the source scanner missed dynamic imports/re-exports and untracked source, and (3) the informational login page performed unused redirect sanitization. The RED lane failed `3` of `20` removal-contract tests. After the minimal repair, the removal contract plus adjacent auth-entry suite passed `28/28`, TypeScript passed, and both changed auth files linted clean. Operator examples now explicitly keep `ALLURA_CF_ACCESS_ENABLED=false` until cryptographic verification and authenticated acceptance are complete.

## Canonical verification receipts

| Gate | Receipt |
|---|---|
| Full unit lane | `232` files passed, `7` skipped; `3234` tests passed, `165` skipped; exit `0` |
| Epic 30 hermetic lane | `39` files passed; `447` tests passed, `3` skipped; exit `0` |
| TypeScript | `bun run typecheck`; exit `0` |
| Credential scan | `credential-scan: OK (device-pairing static artifacts)` |
| Diff hygiene | `git diff --check`; exit `0` |
| New removal-contract ESLint | zero errors, zero warnings |
| Differential changed-file ESLint | baseline `8` errors / `45` warnings; candidate `5` errors / `43` warnings; delta `-3` errors / `-2` warnings |
| Production build | `NODE_OPTIONS=--max-old-space-size=1536 bun run build`; exit `0`; compile, internal TypeScript and route generation completed |

The first 1536 MiB build compiled and was kernel-killed during the duplicate TypeScript phase while a repo TypeScript language server consumed memory. A 1024 MiB diagnostic retry failed at its explicit heap cap. The repo language server and a five-day-old orphaned read-only `opencode config` process were identified by PID/ancestry and stopped. The final 1536 MiB build passed without disabling TypeScript or any build check.

## Image receipt

```text
Tag:      allura-memory-portal:epic30-clerk-removed-20261004-r2
Image ID: sha256:61bd40c015b316af661bb3244ae46d4402a291561c0453f2baae1b9ea992c95d
```

Image filesystem scan:

```json
{"residue":[],"package_has_clerk":false}
```

The scan checked `/app` for Clerk-named paths and `.env` / `.env.*` files and checked `/app/package.json` for `@clerk`.

## Local runtime receipt

A separate isolated container was started without replacing the existing portal or founder candidate:

```text
Container: allura-epic30-clerk-removed-test
ID:        4292249e6ae6
Bind:      127.0.0.1:3211 -> 3200/tcp
Network:   knowledge-network
State:     running / healthy
```

Only these explicit auth/runtime variables were added:

```text
NODE_ENV=production
PORT=3200
ALLURA_DEV_AUTH_ENABLED=false
ALLURA_CF_ACCESS_ENABLED=false
```

No Clerk environment keys are present in the container.

HTTP assertions against `http://127.0.0.1:3211`:

| Request | Result |
|---|---|
| `GET /api/health/live` | `200`; `alive:true` |
| anonymous `GET /dashboard` | `307` to `/auth/v2/login?redirect_url=%2Fdashboard` |
| forged Cloudflare email + assertion headers to `/dashboard` | same `307`; no authority created |
| forged `x-allura-*` DevAuth headers to `/dashboard` | same `307`; no authority created |
| anonymous `GET /api/work-items` | `401 Authentication required` |
| forged Cloudflare headers to `/api/work-items` | same `401` |
| `GET /auth/v2/login` | `200`; contains `Authentication unavailable` and `Cloudflare Access`; contains no `Clerk` |

## Boundaries and open gates

- **No push, deployment, DNS change, Cloudflare cutover, public-route mutation, database mutation, or secret rotation occurred.**
- Cloudflare Access remains disabled in the verified local runtime.
- The current Cloudflare header-presence helper is not approved for activation. Production enablement remains blocked until the signed assertion is verified for signature, issuer, audience, `exp`, and `nbf`, followed by real authenticated browser, tenant/workspace, logout, and revocation evidence.
- The local runtime proves fail-closed behavior only; it does not prove legitimate authenticated dashboard UX.
- The initial independent Astra review returned Pike `APPROVE` and Fowler `BLOCK` on the unsafe activation guidance. After the RED→GREEN remediation above, final read-only delta reviews returned Pike `APPROVE` and Fowler `APPROVE`. Fowler confirmed the previous blocker and both low findings closed; Pike found no authority-widening change. These approvals cover the Clerk-removal snapshot only and do not authorize Cloudflare activation or deployment.
- A governed local checkpoint was proposed only after review, but the Allura governance checker returned `pass:false` because its append-only action-text matcher saw `mutate` inside the explicit guardrail `do not mutate data`; it does not understand negation or scope the check to PostgreSQL `events` rows. No wording retry, bypass, or local commit followed that refusal.
- **2026-10-05 supersession:** the independently reviewed governance remediation was deployed to the MCP with rollback protection. The exact historical Epic 30 checkpoint payload now returns `pass:true`; direct or masked destructive operations against the protected event log remain blocked. This authorizes the local checkpoint only. Push, merge, Cloudflare activation, DNS/public-route changes, and production deployment remain out of scope.
- A protected historical instruction in `CLAUDE.md` still references the retired Clerk direction because the protected-file approval prompt expired. It is not imported or executed by the application. Do not treat it as current architecture; AD-61 and the supersession notes are authoritative.
