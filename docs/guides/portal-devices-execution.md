# Portal devices follow-up — execution ledger

Scope: user-approved allura-branded device-first portal, clients, reusable built-in profiles and documentation. This is a follow-up to the Clients UI, not a reopening or completion claim for Epic 29 external runtime gates.

- Baseline: `5509b07c` on `feat/portal-clients-ui`.
- State: local source/UI validation complete; production release held.
- Commit scope: source/tests/docs only; Allura commit governance passed (`audit_logged: false`). The local commit carrying this ledger is identified in git history.
- Next release gate: resolve the documented Clerk/security and device-client integration gates before production deployment; none are waived by this local delivery.
- Guard: no push, deployment, secret change, runtime permission change or production device/token/schema mutation.

## Verified receipts

| Gate | Actual result |
|------|---------------|
| Focused regression suite | 61 passed in 15 files; final controller rerun after review/build |
| Typecheck | `bun run typecheck`, exit 0 |
| Production build | `NODE_OPTIONS=--max-old-space-size=1536 bun run build`, exit 0; compiled, TypeScript finished, 69/69 static pages generated |
| Independent review | Initial findings reproduced with RED tests and remediated; delta review passed with no security concerns or logic errors. See [verdict](portal-devices-review.json). |
| Real-component browser preview | 1440×1024 desktop and 390×844 mobile; approved logo loaded, two example devices, six client choices, no page errors or page-level horizontal overflow |
| Browser authority boundary | Device-specific setup showed the adapter gate and no unbound issuer; zero non-GET requests sent. These are HTTP fixtures, not live Clerk/device proof. |
| Documentation | User guide, initial Clients guide, requirements matrix and data dictionary synchronized |

Focused command:

```sh
bun run test:unit src/lib/portal src/lib/auth/__tests__/dev-auth-production-guard.test.ts src/lib/auth/__tests__/web-principal.test.ts src/lib/mcp-token src/app/dashboard/device-pairing/__tests__/page.test.tsx
```

## Review remediation

- Confirmation binds to device ID plus operation and is cleared on section navigation.
- Keyboard focus enters confirmation context and returns on cancel/back.
- Device-linked credentials are inspection-only; confirmed device controls revoke access.
- Account-key revocation requires confirmation, guards duplicate requests and locks both navigation levels while pending.
- Inventory failures do not assert an empty success; labels match the actual filter and retry is explicit.
- The initial principal-name finding was disproved by migration 62, which immediately returns for unpaired tokens; the independent reviewer withdrew it after seeing the real contract. Unpaired agent identity and authenticated `created_by` remain separate.

Nonblocking follow-ups are recorded in the review JSON: stricter missing-linkage metadata handling, issuance completion/unmount and ambiguous-response hardening, and additional client-to-credential-view focus coverage. They are not claimed implemented.

## Resource failure and recovery

The first build compiled but its TypeScript worker was kernel OOM-killed. A 1024 MB heap retry failed at the V8 heap limit. Both attempts are failures, not receipts. Process ancestry established that Troy's own task-spawned TypeScript language-server/checker was consuming memory; only those two processes were terminated and their exit verified. No portal, MCP or other live service was stopped. The isolated 1536 MB heap build then passed, including TypeScript; no check was disabled and no source/config workaround was added.

## Contract and release limits

The UI reuses `GET /api/device-pairing/devices`, confirmed `POST /api/device-pairing/{revoke,mark-lost}`, existing admin token inventory/revocation, and unpaired account-token issuance. No schema/backend service changes or production mutations were needed; no new live-DB receipt is claimed.

Device-bound enrollment still requires the target computer's key proof. Native adapters and independent per-client device credentials remain unimplemented; the existing one-active-token-per-device index is preserved. Profiles are built-in permission presets, not persisted custom profile records.

The prior deployment denial remains in force. Clerk secret rotation, three-user sign-in/isolation acceptance, actual secure-store/device runtime, per-client integration and production release remain open gates. The running portal has not been replaced by this work.
