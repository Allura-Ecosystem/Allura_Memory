# Story 29.1 — Schema — device_enrollments, paired_devices, mcp_tokens.paired_device_id

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want the additive schema for enrollment transactions, paired devices, and the device link on MCP tokens,
So that the server can store pairing state with correct tenant isolation, SECURITY DEFINER access control, and DB-enforced invariants.

## Outcome

The database can hold a PENDING enrollment (no tenant authority), an APPROVED paired device (all authority NOT NULL), and a device-issued MCP token linked to its paired device — with no INSERT path that can leave authority empty.

**Scope:** Create migrations 060, 061, 062, 063 per architecture §3.1, §3.1b, §3.2, §3.3, §3.4a. No API routes, no service layer — schema only. Migration 063 includes `resolve_device_route()` SECURITY DEFINER function.

**Dependencies:** None — first implementation slice.

**Blocks:** Story 29.2, Story 29.3, Story 29.4, Story 29.5, Story 29.6, Story 29.7, Story 29.8, Story 29.9, Story 29.10, Story 29.12, Story 29.15, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-06 (partial — schema stores only public keys), AC-10 (partial — schema supports count + advisory lock).

**Architecture/ADR references:** §3.1, §3.1b, §3.2, §3.3, §3.4a, §3.4 (rollback), AD-61.

**Source code and migration touchpoints:**
- New: `docker/postgres-init/60-device-enrollments.sql` (logical schema version `060`; table + 5 SECURITY DEFINER functions + REVOKE/GRANT + indexes)
- New: `docker/postgres-init/61-paired-devices.sql` (logical schema version `061`; table + RLS policy + indexes including `idx_paired_devices_rotation_idem` cross-device unique, `grace_exchange_count` column)
- New: `docker/postgres-init/62-mcp-tokens-paired-device.sql` (logical schema version `062`; ALTER ADD `paired_device_id` + partial unique index `idx_mcp_tokens_one_active_per_device` + DEFERRABLE CONSTRAINT TRIGGER `trg_mcp_tokens_device_agent_name` + `verify_device_token_agent_name()` function)
- New: `docker/postgres-init/63-device-challenges.sql` (logical schema version `063`; table + RLS + indexes + `resolve_device_route()` SECURITY DEFINER)
- No changes to existing migrations 00/18/27/28/29/36/37.

**Correct-course note (approved 2026-09-08):** Source filenames use the repository's established two-digit sequence (`60`–`63`) because fresh installs and CI apply `docker/postgres-init/*.sql` in `LC_ALL=C` filename order. Three-digit filenames (`060`–`063`) would sort between migrations `06` and `07`, before prerequisite migration `17-schema-version.sql`. The append-only `schema_versions.version` values remain `060`–`063`, preserving the approved logical migration IDs.

**Required tests:**
- `src/lib/device-pairing/__tests__/migrations/060-enrollments-schema.test.ts` — CHECK constraints: PENDING row has no post-approval columns; APPROVED row has all; CONSUMED has `consumed_at`; EXPIRED has no consumed code. SECURITY DEFINER functions callable by `allura_app`; direct table access rejected.
- `src/lib/device-pairing/__tests__/migrations/061-paired-devices-schema.test.ts` — all authority NOT NULL; `lifecycle_state` CHECK rejects invalid values; `enrollment_id` has no `REFERENCES` clause; RLS policy permits only `app.current_group_id` match.
- `src/lib/device-pairing/__tests__/migrations/062-agent-name-trigger.test.ts` (also listed under AC-26) — DEFERRABLE trigger rejects mismatched `agent_name` at COMMIT; non-device token (`paired_device_id IS NULL`) unaffected.
- `src/lib/device-pairing/__tests__/migrations/063-challenges-schema.test.ts` — `purpose` CHECK excludes `pairing_complete`; `group_id` CHECK + RLS enforceable; `resolve_device_route()` returns only `group_id` for APPROVED devices, NULL otherwise.
- All migration tests run under `RUN_E2E_TESTS=true` against real PostgreSQL (integration lane).

**Governance/security evidence:**
- `group_id` CHECK constraint `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$` on `paired_devices`, `device_challenges` (NFR3).
- `device_enrollments` has no RLS and no direct table access — SECURITY DEFINER only (AR1).
- `events` immutability (migration 37) not modified (NFR4).
- Rollback strategy documented: ordered 063→062→061→060, no CASCADE, rollback-marker row in `schema_versions` (AR7, §3.4).

**Rollback or failure behavior:** If migration fails, PostgreSQL rolls back the DDL transaction. No partial schema. Rollback requires operator-approved signed migration-down document per §3.4. No casual CASCADE.

**Definition of Done:**
- Migrations 060–063 apply cleanly on a fresh PostgreSQL 16 instance.
- All CHECK constraints, RLS policies, SECURITY DEFINER functions, indexes, and the DEFERRABLE trigger exist and enforce their invariants.
- `schema_versions` rows 060/061/062/063 inserted.
- All migration tests pass under `bun test src/lib/device-pairing/__tests__/migrations/` with `RUN_E2E_TESTS=true`.
- `bun run typecheck` passes.
- No existing migration is modified.

**Non-goals:**
- No API routes (`/enroll`, `/approve`, `/complete`, `/challenge`, `/exchange`).
- No service layer / repository code beyond the SQL DDL and SECURITY DEFINER functions.
- No token mint logic.
- No audit event emission from application code.
- No Clerk integration.

## Implementation Evidence

- **BMAD dev-story:** migrations 060–063, four migration test files, live-DB inventory registration, data dictionary, and requirements traceability completed.
- **Live PostgreSQL 16:** `RUN_E2E_TESTS=true bun test src/lib/device-pairing/__tests__/migrations/` — **27 passed, 0 failed**.
- **Typecheck:** `bun run typecheck` — passed after dependency restoration.
- **BMAD code review:** final independent review **APPROVED** with zero BLOCK, HIGH, or MED findings. The duplicate paired-device index was removed; the trigger’s SECURITY INVOKER/RLS boundary is explicit and contract-tested.
- **Scope:** no existing migrations changed; no API route, service, token minting, deployment, secret, merge, or push occurred.

---
