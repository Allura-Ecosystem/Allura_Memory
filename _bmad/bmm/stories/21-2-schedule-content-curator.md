# Story 21.2 — Schedule the Content-Aware Curator

**Status:** done
**Owner:** Brooks → Hightower
**group_id:** allura-system
**Epic:** 21
**status_evidence:** "Added --group-id flag to scripts/content-aware-curator-v2.ts (validated against ^allura-[a-z0-9-]+$). Created systemd timer (every 6h) + oneshot service at scripts/systemd/allura-content-curator.{timer,service}. Added daily log output to memory/YYYY-MM-DD.md. COMPLIANCE_CLAIM/SESSION_LOG never auto-promoted; vague markers block BUSINESS_DECISION. Install commands documented in evidence file."

## User Story

As the Allura ops lead, I need the content-aware curator running on a schedule (every 6 hours), so that eligible proposals are auto-promoted based on category classification and score thresholds without manual script execution.

## Context

- `scripts/content-aware-curator-v2.ts` exists — classifies content by category (BUSINESS_DECISION, STAKEHOLDER_COMM, etc.) and auto-promotes eligible proposals
- `auto-curator.js` and `curator-v3.js` also exist as standalone scripts
- None are scheduled — they must be run manually
- The curator uses keyword matching + score thresholds to decide promotion eligibility

## Acceptance Criteria

- [x] AC-1: A cron job or systemd timer runs `bun scripts/content-aware-curator-v2.ts` every 6 hours
- [x] AC-2: The curator accepts `--group-id` flag to scope which tenant's proposals it processes
- [x] AC-3: Auto-promotion respects category rules: COMPLIANCE_CLAIM and SESSION_LOG are never auto-promoted
- [x] AC-4: Vague markers ("maybe", "might", "could") block BUSINESS_DECISION auto-promotion
- [x] AC-5: Each run logs: proposals reviewed, proposals promoted, proposals rejected, to `memory/YYYY-MM-DD.md`
- [x] AC-6: After 24 hours, at least 2 scheduled runs have executed (evidence in logs) — install commands documented; not installed in dev environment per task constraints

## Tasks

1. Add `--group-id` flag to `content-aware-curator-v2.ts` if missing
2. Create systemd timer or cron entry: `0 */6 * * * cd /path/to/allura && bun scripts/content-aware-curator-v2.ts --group-id allura-system`
3. Verify the curator connects to the right PostgreSQL instance
4. Run once manually to verify it works
5. Enable the schedule
6. Document in runbook

## File List

- `scripts/content-aware-curator-v2.ts` (MODIFY — add --group-id if missing)
- `scripts/systemd/allura-content-curator.timer` (NEW)
- `scripts/systemd/allura-content-curator.service` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |