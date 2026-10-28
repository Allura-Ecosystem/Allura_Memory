# Epic 7 Context: Confirmed external projection

## Goal
Deliver an honest, durable projection of an independently approved immutable semantic version to an explicitly authorized destination. Local success and HTTP acknowledgements are not proof of remote synchronization. This adopted local extension is separately releasable; the owner authorized only disposable destination fixtures, not actual external transfers.

## Stories
- Story7.1: Delivery identity, authority, canonical digest and bounded reconciliation contracts.
- Story7.2: Atomic eligible handoff and separate persisted delivery observations.
- Story7.3: Actual destination read-back, ambiguity, concurrency, revocation and local acceptance.

## Requirements & Constraints
Only actual destination read-back matching page/destination/source revision/content may produce synced. Decision receipts remain byte-identical to their original decision-time snapshot, including not_requested. Pending proposals, approval scores and local delivery events cannot be exported as canonical knowledge. Current tenant/workspace and source-to-destination transfer authority are separate from page access. Revoke authority before new outbound work; retain prior evidence rather than deleting remote records or rewriting history.

Ambiguous timeout/crash/transport/commit results remain unknown and require read-back reconciliation before any new remote mutation. A stable delivery identity, immutable source binding, due time, attempt ceiling and exclusive claim fence must survive process restart. Stale workers cannot overwrite successful state or reopen delivered work. All storage/observation keys and foreign keys carry tenant/workspace. No client role, actor, status, digest or destination URL mints authority. Restrict logs to safe bounded codes and references; no credentials, content or foreign identifiers.

## Technical Decisions
Preserve the existing approval intent and immutable receipt/semantic version as source evidence. New migration/service contracts belong to this epic, not restored legacy code or the absent historical Data Dictionary. Current design specifies Notion projection; exact target authority is not present in inspected local artifacts, and Brain recall is unavailable. Choose conservative bounded local defaults and record them as delegated engineering choices, not historical user mandates. No live destination enrollment or credential lookup is authorized.

Current approved order preserves owned10.1 and prioritizes local7 before remaining10/11. Real external destination, actual independent-human deployment journey, hosted CI and operational recovery remain open; they do not stop independent local implementation. Deferred12–14 remain excluded. Direct self-checks and real tests replace developer reviewer agents, never independent authorized human semantic approval.

## UX & Interaction Patterns
Expose delivery observation separately from approval receipt. Distinguish not configured, queued, synced, failed/conflict/denied and unknown; report observed time and exact intended source. Do not display health/sync from outbox counters. Retain approved shell and interactive Memory Map if adding controls; browser-exercise actual controls and denial states, not previews. No new operational board.

## Cross-Story Dependencies
Local4 supplies immutable approval/semantic intent and current lifecycle;2 supplies authenticated authority/restricted PostgreSQL;6 supplies bounded operations and truthful outcomes.7.1 settles concrete contracts before7.2 persistence;7.3 proves actual local integration and retrospective before remaining10/11. Fixture evidence must never be relabeled deployed external acceptance.
