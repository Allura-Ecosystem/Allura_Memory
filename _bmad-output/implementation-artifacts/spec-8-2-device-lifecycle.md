---
title: '8.2 Device enrollment, current owner authority and credential lifecycle'
type: feature
created: 2026-10-27
status: in-progress
route: dispatch
baseline_commit: 2a2a0a3360f3930d7b9edc82fd6ed065b782f824
---
# Intent

Implement [accepted8.1](spec-8-1-device-contract.md) against restricted PostgreSQL and signed HTTP, not client-side grants. Direct Woz-guided implementation/Brooks integration in sole writer; no independent review. Approved Correct Course preserves open6.5 release gate and permits this local work. No deployment/live grants/production credentials.

## Code map and dependency order

1. `foundation/tests/device-authority.test.ts`: red real restricted PostgreSQL cases for owner role attenuation, active owner/binding/grant/membership, current generation, device-only identity and transactional revocation.
2. NEW `foundation/migrations/013-device-authority.sql`: private device→human owner/identity/grant/current credential linkage; constrain same-scope device/human FKs; extend current authority/lookup/locks without changing001–012. Baseline functions remain private implementation helpers; no app bypass. Both service checks and existing RLS see attenuation; no machine human privileges.
3. `foundation/src/persistence.ts`: append migration; `foundation/scripts/test-db.ts`: mandatory discovery; recovery test verifies13 migrations. Full DB/package/restore regression before proceeding.
4. Subsequent NEW014 migration for ten-minute enrollment, atomic approved exchange, idempotency/rotation/revocation and redacted immutable audit; `foundation/src/devices.ts` uses actual scopedTransaction. Locks owner/current device, exact generation; no automatic authority restoration. Complete schema/service tests for every7 command before transport.
5. `foundation/src/device-api.ts` and actual core gateway composition: human-only POST routes, same-origin/CSRF, strict bounded8.1 parser; supplied scope resolved not trusted, owner-only operations plus current explicit admin approval/revoke. No extra MCP tool or anonymous endpoint.
6. `foundation/tests/devices.test.ts` + real HTTP tests: lifecycle/replay/conflict/expired proof/rotation/revocation/demotion/foreign/malformed/concurrent/audit failure. All required by database lane, then full checks/exact-source CI.8.3 subsequently supplies actual OS store, not simulated here.

## Acceptance

- [x] Given a device, CURRENT owner and device state, exact scope and current credential generation constrain every service and RLS action; missing links, inactive human/binding/membership/grant, owner viewer demotion, revoked/expired tokens, locked/foreign scopes fail closed. Device cannot approve semantic memories or manage grants.
- [x] Given an authorized enrollment+admin approval+owner verifier exchange, commit one complete device/credential/grant/link/audit/receipt set; pending/expired/changed payload/foreign approvals never mint authority.8.1 cap8 and bounded deadline/actions hold under concurrency.
- [x] Given exact retries/competing exchanges/rotation/revocation, stable receipts and one winner; all old generations remain invalid, even on replay; audit/commit faults roll everything back.
- [x] Given actual signed HTTP, auth before body, CSRF/scope/privacy/limits and no secret logs/errors/receipts hold; service/machine cannot invoke human enrollment functions.
- [ ] Nonzero required tests, typecheck/lint/full native PostgreSQL/packed recovery and exact clean-source CI pass. Only then locally accept8.2; never infer8.3 platform or6.5 deployment acceptance.

## Scope of current slice

Admission14 supplied013 authority-link boundary; admission15 implemented014 lifecycle, service and actual composed human POST `/api/devices/command`. Seven strict commands; approve adds grants-management authority; all use current signed-human scope, not browser-supplied roles or anonymous polling. Lifecycle mutations serialized per workspace under bounded transaction locks;8-slot quota and current owner/admin rechecks. Hashes only for secret material; immutable redacted audit and public replay receipts. List is owner-only,100 newest maximum, explicit truncated; historical receipts never prove current validity. No automatic device issuance or new MCP tool.

Admission15 red lifecycle import and HTTP404 ran before respective implementation. First full service run exposed SQL record-variable/table-alias collision in list, corrected by distinct aliases. Additional duplicate-token regression exposed Bun SQL errors use errno=23505, not generic code=ERR_POSTGRES_SERVER_ERROR; both device and existing access handlers corrected, no raw errors exposed. Focused actual disposable PostgreSQL runs exercised the fix and deferred COMMIT rollback. `admission15-http-full.log` passed169/1441; expanded HTTP rotation/reconnection test then `admission15-device-final-full.log` (`bun run check:all`) exit0 at2026-10-27T13:54:00-04:00:169tests/1445assertions, unit42/376, restricted DB127/1069, typecheck/lint and required discovery green. Native model, packed core/consumer and14-migration recovery remain exercised.

Actual HTTP witness enrolls via signed owner/admin, completes with proof, restarts server, authenticates device through real MCP SDK, captures evidence without promotion, rotates and rejects old token, reconnects replacement and revokes it. Schema tests cover stale/foreign/machine/expiry/ceiling, exact replay, quota concurrency, competing exchange/rotation, private tables/helpers and immediate/deferred audit faults. No actual OS secure-store/client acceptance (8.3), deployed witness or human onboarding claim. Tests use synthetic signed identities/disposable resources. Exact clean-source CI remains the final open8.2 gate before local acceptance.
