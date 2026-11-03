# Live Notion planning reconciliation — Allura PRD

- **Review mode:** read-only source reconciliation; no Notion, Brain, status, approval, or canonical-document writes
- **Retrieved:** 2026-10-25T04:11:19Z
- **PRD reviewed:** [`../prd.md`](../prd.md), status `authoring-draft-unapproved`, updated 2026-10-25, source revision `fcf4a33f025f69a5bc3fd120e974dd079dc65c52`
- **Canonical local authorities:** [`docs/allura/RISKS-AND-DECISIONS.md`](../../../docs/allura/RISKS-AND-DECISIONS.md) and [`guidelines/ALLURA-BMAD.md`](../../../guidelines/ALLURA-BMAD.md)
- **Method:** Docker OAuth `notion-remote` through `notion-fetch` and `notion-search` only. Page recency and successful authentication were treated as access evidence, not approval or reconciliation proof.

## Source coverage and metadata

| Source | URL | Notion metadata / status | Coverage and completeness |
|---|---|---|---|
| Allura Documentation Hub | https://app.notion.com/p/3ca1d9be65b3818c8680cef760371320 | Last edited / fetch snapshot `2026-10-18T22:30:49.576Z`; verification state `unverified` | Fetched. Current authority, publication, DOC-01/06/07, active/superseded-page map, and archive boundary reviewed. Response closed the page/content tags and carried no truncation marker. The connector did not expose an explicit `truncated` boolean. |
| Allura Memory — Engine | https://app.notion.com/p/33b1d9be65b38045b6b0fa8c48dbc17b | Last edited `2026-10-21T12:51:20.468Z`; fetch snapshot `2026-10-21T12:51:31.901Z`; verification state `unverified`; path `Faith Meats HQ` | Fetched. Current header, memory-write hold, six-document index, architecture, DOC-01/06/07, planning links, and preserved historical toggle reviewed. No truncation marker; no explicit connector `truncated` field. |
| Allura Blueprint — private working reference | https://app.notion.com/p/be31d9be65b3828cb46e81b1d1078f3a | Last edited / fetch snapshot `2026-10-18T22:30:51.624Z`; verification state `unverified` | Fetched because the Hub identifies it as the selected private working Blueprint. Current product intent, reference journey, boundaries, and historical toggle reviewed. No truncation marker. |
| Risks and Decisions: Allura | https://app.notion.com/p/33c1d9be65b3817988eae1752da36cdb | Last edited / fetch snapshot `2026-10-18T22:31:00.349Z`; verification state `unverified` | Fetched because it is the Engine's current private decision/risk navigation page. Current reconciliation findings and preserved historical toggle reviewed. No truncation marker. |
| Requirements Matrix: Allura | https://app.notion.com/p/df7e57400a574c619f60442834fed2d5 | Last edited / fetch snapshot `2026-10-18T22:30:58.439Z`; verification state `unverified` | Fetched because it is the Engine's current private acceptance/evidence navigation page. Current claim-state and acceptance boundary reviewed. No truncation marker. |
| Allura Memory Finish Plan | https://app.notion.com/p/3631d9be65b381d58d05f66eaadc946e | Last edited / fetch snapshot `2026-08-02T08:27:52.400Z`; verification state `unverified` | Fetched as the directly linked closure/blocker plan. Its May–August status, architecture, dashboard, and board claims are materially dated. No truncation marker. |
| Workspace searches | Query results for `Allura PRD product requirements` and `DOC-09 Allura board synchronization` | Search executed 2026-10-25; all returned pages were `unverified` | Used to distinguish active pages from archived/recovery duplicates and identify coverage gaps. Search did not return a current Allura product PRD that supersedes the repository draft. |

**Fetch failures:** none. All six selected page fetches and both searches returned successfully. This does not prove that unvisited descendants, private discussions, database rows, or linked evidence are complete or approved.

## Agreements with the PRD

1. **Authority split is aligned.** The Hub says, exactly: “**Notion is the private authority for strategy, planning, approvals, and working decisions. It is not the published engineering truth.**” The current Engine says it “**does not define a competing architecture, API schema or deployment contract**.” This agrees with PRD §§0 and 7 and with `ALLURA-BMAD.md`: GitHub's six documents own engineering truth; Notion holds private planning; Allura owns operational work-item status; Brain provides governed continuity.

2. **The product boundary and core journey agree.** The private Blueprint says: “**Allura provides governed memory for AI agents and human operators: capture evidence, review proposals, retrieve scoped knowledge and retain an audit trail.**” It defines “**capture → human review → retrieval**,” matching PRD vision, UJ-1/2/3, and Features A–C.

3. **PostgreSQL-only durable architecture is consistent.** Current Blueprint and Engine both state that PostgreSQL stores episodic events, proposals, semantic records, lineage, and RuVector/pgvector retrieval, while Neo4j is retired under AD-50. This agrees with PRD §§1, 5, and FR-F2. Historical Neo4j language remains only inside explicitly superseded toggles.

4. **Independent human promotion remains mandatory.** Current Blueprint: “**A score or the legacy `auto` mode does not authorize semantic promotion.**” This supports PRD FR-B1/B2 and NFR-4; it does not support any historical auto-promotion wording.

5. **DOC-06 is represented correctly and remains an implementation gap.** Current pages repeat: “**A new approval must bind to the exact proposal version the human reviewed. If that version changed, reject without approval effects and require refresh and review.**” They also say the reviewed-version check is not implemented. This agrees with PRD UJ-2 and FR-B3.

6. **DOC-07 is represented correctly and remains unverified remotely.** Current pages state: “**Report Notion as synced only after confirmed remote delivery and read-back evidence for the intended destination and revision. Local outbox delivery alone is not remote synchronization.**” This agrees with PRD UJ-5 and FR-D2.

7. **Evidence-state separation is aligned.** The current Requirements page says: “**Keep intended, specified, implemented, verified and released separate.**” This directly agrees with PRD §§0, 2, 4, and 6. Notion's dated checks, counts, and implementation claims therefore cannot promote the PRD or prove release readiness.

8. **The PRD correctly preserves unresolved product scope.** Current private pages do not provide an approved buyer/commercial persona, numeric product SLOs, retrieval budgets, or a new approved visual reference. The PRD properly leaves those as owner decisions or non-adopted targets.

## Conflicts, stale notes, and reconciliation consequences

### Current-page conflicts

No material conflict was found between the **current top-level sections** of the Hub, Engine, private Blueprint, private Risks page, and private Requirements page and the PRD's authority, architecture, governance, DOC-06, or DOC-07 statements.

### Preserved historical text that must not guide the PRD

1. **Historical board/status authority conflicts with the current approved routing.** The Engine's preserved June snapshot says “**Notion Work Board remains canonical for human/team status**.” The current repository contract says operational status belongs to Allura and DOC-09 remains unresolved. The Engine labels the block “Historical snapshot — superseded working content — not current specification”; therefore it is stale evidence, not a contrary approval.

2. **Historical sync-direction claims conflict with DOC-01.** Preserved Blueprint/Engine text says “**Notion → repo only**,” proposes a GitHub Action to push docs into Notion, and calls Notion a source of truth. Current pages explicitly supersede those tables and say no automatic overwrite or sync is established. The PRD correctly follows current DOC-01 rather than these historical instructions.

3. **Historical Neo4j and auto-promotion claims conflict with current canon.** The preserved Blueprint, Risks, Requirements, and Finish Plan include dual-store, Neo4j, and threshold/`auto` promotion descriptions. Current pages mark them superseded; AD-50 and mandatory HITL govern. The PRD correctly excludes them.

4. **The Finish Plan is not current product or release status.** Its page was last edited 2026-08-02 and includes May-era claims such as “Phase 1 ACTIVE,” port 3100, dashboard rebuild, Neo4j data sources, and Notion/Brain status receipts. These conflict with later architecture and authority decisions. Its useful surviving planning signal is only the direction to “**Finish the Allura Memory System first… Defer new board work until the memory system is stable**,” which is compatible with the PRD's `Now/Next/Later` ordering but is not a current status receipt.

5. **The current Engine still carries mixed historical dashboard directions.** Its preserved body includes AionUI, Control Center sunset, fork, and old board plans. The current Blueprint correctly says old Mission, AionUI, or AlluraBoard directions “**do not choose a current design**.” PRD FR-E1–E4 and DOC-02/09 gating are therefore safer than selecting any historical shell.

6. **Notion has not mirrored the 2026-10-20/22 development-readiness packet.** The fetched current navigation pages focus on the 2026-10-18 repair and DOC-06/07. They do not enumerate proposed AD-65–68, DEV-AC01–12, RK-36–40, AD-69/RK-41, or the later backend/preview findings now present in canonical GitHub. Under DOC-01 this is planning/index lag, not a competing contract. The PRD correctly derives these requirements from the canonical repository, but Notion readers may miss them.

7. **Memory-write hold is active and does not alter product approval.** The Engine's 2026-10-21 header says: “**Memory write hold remains active… proposal/approval lineage is unverified… Read-only audit views returned no matching entries; that does not prove underlying approval absence.**” This supports the review's no-Brain-write boundary and is an operational caution, not evidence that the PRD or any semantic record is approved.

## Unresolved owner decisions

The Notion review does not close any of the following canonical owner decisions:

- **AD-65–68:** capture replay/projection contract, vector workspace authority, governed correction/single-head concurrency, readiness/maintenance evidence and budgets. Status remains **Proposed** in `RISKS-AND-DECISIONS.md` dated 2026-10-20/22.
- **DOC-02:** exact approved visual reference/revision/assets for the first UI story.
- **DOC-03:** restore/rollback behavior versus immutable lineage.
- **DOC-05:** canonical duplicate behavior across distinct approved proposals.
- **DOC-08:** evidence for the curator-first route/delivery decision.
- **DOC-09:** authoritative operational board, sync direction, and conflict rules. The approved routing—Allura status, Notion planning, Brain continuity—does not choose a native board/sync implementation.
- **ENT-01–05:** workspace-specific roles/confidentiality, live restricted-role/RLS proof, complete administration/device/audit flows, production identity/session evidence, and responsive/accessibility evidence.
- **Metric/product budgets:** retrieval quality, latency, scale, admission/retry/retention, and release thresholds.
- **Buyer/commercial persona and pricing/packaging:** absent from the reviewed canonical/private planning set.

**Owners preserved from the canonical decision record:** Sabir owns product choices and approval boundaries; Brooks specifies architecture/boundaries; Woz implements after decisions; Pike/Knuth/Fowler/Hightower and other named lane owners supply independent security, data, quality, and deployment review/evidence. Assignment is not execution or approval.

## Coverage gaps and limits

- The `Allura Work Items` databases linked from the Engine were **not queried**. Their rows could provide planning context, but DOC-09 is unresolved and database status must not be treated as operational authority.
- `Allura Projects` and `PRD: Team RAM — Real Actual Masters v1.0` were **not fetched** because they concern team/plugin delivery rather than the bounded Allura Memory product PRD. The Engine's current header supplied the only directly relevant memory-write-hold note.
- Historical/recovery duplicates and archive descendants were not fetched after search and Hub lineage identified them as superseded.
- Comments, discussions, external GitHub PR checks, deployment targets, live databases, Brain records, and work-status systems were not inspected. No conclusion about current implementation, deployment, release, or operational status follows.
- The connector responses included complete-looking closing tags and no truncation notices, but did not expose an explicit truncation flag; inaccessible nested content cannot be ruled out.

## Verdict

**Notion planning supports the PRD's core product contract and authority boundaries, with no current-page contradiction requiring a PRD rewrite.** The PRD is still an **unapproved authoring draft**: Notion confirms the October 18 DOC-01/06/07 planning decisions and the October 21 memory-write hold, but does not approve the PRD, close the canonical owner decisions, establish operational status, or prove implementation/release. The main reconciliation action is to keep historical Notion bodies explicitly non-authoritative and surface the October 20–22 canonical readiness packet to future Notion readers without creating a second engineering specification.