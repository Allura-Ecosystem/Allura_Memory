# Epic 30 PR #156 — Machine Closeout Checklist

**Date:** 2026-09-25  
**Candidate PR:** https://github.com/Allura-Ecosystem/Allura_Memory/pull/156  
**Candidate SHA:** `24d9fbe80e01e8716f5e860a6924bd2d75a67c71`  
**State:** automated development readiness achieved; Epic acceptance remains on hold.

## What the AI completed

- [x] Repaired the governed workspace-membership writer, its needed database
  privileges, and the canonical-memory test identity boundary.
- [x] Added the forward migration repair for deterministic PostgreSQL function
  name resolution and single-use messaging-receipt locking.
- [x] Verified a clean disposable PostgreSQL bootstrap with all 83 migrations.
- [x] Verified the confined Epic 30 PostgreSQL/HTTP proof against a temporary
  loopback database. No production database was used.
- [x] Verified the canonical-memory E2E regression: 39 of 39 tests passed.
- [x] Repaired the changed-file ESLint error; its check now has zero errors.
- [x] Verified every hosted PR check green on this candidate SHA, including
  `Confined PostgreSQL and HTTP`, `Hermetic authorization and UI`,
  `MCP Runtime Health Tests`, and `Epic 24 Evidence / Aggregate`.
- [x] Updated protected `main` to require both Epic 30 evidence checks in
  addition to the existing required checks. Force-push and deletion remain
  disabled and administrator enforcement remains enabled.

## Explicitly not completed by automation

The machine checks prove the implementation candidate. They do **not** prove
the human or production gates below. `main` remains protected and this PR must
not be merged or deployed until they are satisfied.

1. **Security and data authority:** an independent security reviewer and data
   owner must approve or amend the exact Story 30.3 authorization contract and
   its threat-row dispositions.
2. **User evidence:** record keyboard, screen-reader, and real 200% zoom
   evidence, then run the five-person uncoached study and remediate/retest any
   failure.
3. **Production decisions:** approve the production read/relationship policy;
   approve a no-training/no-retention Ask provider contract before enabling
   Ask; and approve the restricted-messaging provider and delivery policy.
4. **Independent reviews:** security, maintainability, accessibility,
   migration, and deployment reviewers must record no unresolved BLOCK/HIGH
   finding for the frozen candidate.
5. **Release:** after review, authorize a frozen-SHA release, record origin,
   deployment and rollback receipts, then accept the retrospective or record
   an authorized waiver.

## BMAD handoff prompts

Use these prompts with the named human owners; they are review requests, not
automatic approvals.

### Security and data review

> Review Story 30.3's authorization packet and v2 addendum for PR #156. Record
> your identity, role, threat-row dispositions, required amendments, and the
> exact candidate SHA. Do not grant production access or change story status
> unless every required disposition is complete.

### Accessibility and user study

> Run the Story 30.2/30.12 frozen-candidate protocol: keyboard, screen-reader,
> and real-browser 200% zoom first; then five distinct uncoached participants.
> Record task outcomes, critical errors, unauthorized-disclosure observations,
> and retest evidence. Do not substitute an automated simulation for people.

### Release authority

> After required reviews and study evidence are accepted, verify PR #156's
> protected checks at the frozen SHA. Approve or reject deployment, record the
> origin/main and rollback receipts, and accept the retrospective or document
> an authorized waiver.

## Evidence links

- `_bmad_output/planning-artifacts/epic-30-completion-checklist.json`
- `_bmad_output/implementation-artifacts/30-11-integrated-review-ci-and-controlled-red.md`
- `_bmad_output/implementation-artifacts/30-13-release-evidence-receipts-and-retrospective.md`
- `.github/workflows/epic-30-evidence.yml`

