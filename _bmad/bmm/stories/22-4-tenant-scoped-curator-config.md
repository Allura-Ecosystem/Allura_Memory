# Story 22.4 — Tenant-Scoped Curator Config

**Status:** ready-for-dev
**Owner:** Brooks → Knuth + Woz
**group_id:** allura-system
**Epic:** 22

## User Story

As the Allura admin, I need each tenant to have its own curator configuration (promotion threshold, auto-approval mode, schedule), so that different businesses can tune their memory curation independently.

## Context

- The watchdog (`src/curator/watchdog.ts`) uses a global `scoreThreshold` from env or CLI flag
- The content-aware curator (`scripts/content-aware-curator-v2.ts`) uses hardcoded thresholds per category
- The `tenants` table (Story 22.1) has a `config` JSONB column for per-tenant settings
- Different businesses may want different rules (nonprofit: conservative threshold, business: aggressive auto-promotion)

## Acceptance Criteria

- [ ] AC-1: The `tenants.config` JSONB supports: `{ promotion_threshold, auto_approval_mode, curator_schedule_hours, drift_audit_enabled }`
- [ ] AC-2: The watchdog reads tenant config from the `tenants` table instead of global env vars — falls back to defaults if config is empty
- [ ] AC-3: The content-aware curator reads tenant config for score thresholds per category
- [ ] AC-4: `PATCH /api/tenants/:group_id` can update the config (from Story 22.2)
- [ ] AC-5: A change to tenant config takes effect on the next watchdog/curator cycle — no restart required
- [ ] AC-6: Unit tests verify: per-tenant thresholds work, defaults apply when config is empty, config changes are picked up on next cycle

## Tasks

1. Add `getTenantConfig(group_id)` function in `src/lib/config/tenant-config.ts`
2. Update `src/curator/watchdog.ts` to read tenant config
3. Update `scripts/content-aware-curator-v2.ts` to read tenant config
4. Create `src/__tests__/tenant-curator-config.test.ts`
5. Run `bun run typecheck && bun test`

## File List

- `src/lib/config/tenant-config.ts` (NEW)
- `src/curator/watchdog.ts` (MODIFY — read tenant config)
- `scripts/content-aware-curator-v2.ts` (MODIFY — read tenant config)
- `src/__tests__/tenant-curator-config.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |