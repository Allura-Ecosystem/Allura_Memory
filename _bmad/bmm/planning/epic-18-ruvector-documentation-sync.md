# Epic 18 — RuVector Documentation Sync — Promote Archive to Canon

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Goal:** The RuVector graph cutover is 90% built behind `GRAPH_BACKEND` flag (AD-029), but the canonical 6-file doc set still says "pgvector bridge, not full RuVector." This epic promotes the archived AD-49/RK-15 and the RuVector integration boundary into the canonical docs, updates the readiness boundary with the actual cutover path, and prepares the receipt shapes for when native activates.

**Why now:** The code is ahead of the docs. AD-49 has been drafted in `docs/archive/allura/` since 2026-06-24 but is AD-33-gated for promotion. Sabir chose Path B (ruvnet Rust crate), and the spike passed (Bun loads the `.node` addon). The docs need to catch up to reality before Team RAM can execute the cutover work.

**Stories:**

- **18.1** Promote AD-49 (RuVector graph cutover) + RK-15 into canonical `RISKS-AND-DECISIONS.md`
- **18.2** Update `SOLUTION-ARCHITECTURE.md` §3.4.0 — expand readiness boundary with cutover path + graduation criteria
- **18.3** Update `DATA-DICTIONARY.md` — add `GRAPH_BACKEND` flag, RuVector graph tables, expand `ruvector_status` object
- **18.4** Update `REQUIREMENTS-MATRIX.md` — add REQ-RV-001..005 (RuVector cutover requirements)
- **18.5** Update `BLUEPRINT.md` §2 + §8 — RuVector graph posture, port confirmation, capability inventory
- **18.6** Update RK-21 mitigation — add graduation criteria (pgvector_bridge → full_ruvector label upgrade)

**Exit gate:**
- All 6 canonical docs reflect the actual RuVector graph adapter state (AD-029, AD-49)
- AD-49 and RK-15 are in canonical `RISKS-AND-DECISIONS.md` with correct numbering
- Graduation criteria for the `pgvector_bridge` → `full_ruvector` label upgrade are documented
- `GRAPH_BACKEND` flag and RuVector graph tables are in the Data Dictionary
- TALON can validate the doc set is internally consistent
