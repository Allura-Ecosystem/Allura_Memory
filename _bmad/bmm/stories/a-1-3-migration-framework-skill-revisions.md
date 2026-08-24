# Story A-1.3 — Migration Framework — Skill-Revisions Schema

**Status:** Planned
**Owner:** Knuth + Woz
**Depends on:** A-1.1
**Blocks:** —

## Outcome

Migration 001 is applied, the skill-revisions schema is versioned, and rollback is tested.

## Acceptance Criteria

- [ ] Migration `001-skill-revisions.sql` is applied successfully.
- [ ] Schema is versioned — a `schema_version` table tracks applied migrations.
- [ ] Rollback is tested — `001-down.sql` reverses the migration cleanly.
- [ ] Migration is idempotent — running it twice produces no errors.
- [ ] Migration framework supports future migrations (002, 003, etc.).

## Evidence

- Migration application output.
- Rollback test output.
- Idempotency test output.

## Rollback

Run `001-down.sql` to reverse the migration. Schema returns to pre-migration state.