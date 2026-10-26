# Independent Brooks review — targeted PRD update and placement

**Review time (UTC):** 2026-10-25T04:37:17Z  
**Review mode:** Team RAM Brooks governance/architecture review; independent of the drafting pass  
**Reviewed PRD:** `prd.md`  
**Reviewed PRD SHA-256:** `949a5c86f03df0c61635e18a203e640a0b820699ecaeba6545d59c13f27e6756`  
**Frozen baseline SHA-256:** `b1db0967a7ae36f1dd1e65469d85794c7fb0507e29743545270bffa38828d9c7`  
**Authority boundary:** This review evaluates document preparation and local placement only. It is not Jobs/Sabir acceptance, an Allura status transition, schema/API adoption, implementation verification, deployment approval, or release certification.

## Verdict

**CHANGES REQUIRED for the placement package; PRD content is substantively governance-ready as an unapproved drafting companion.**

The revised PRD preserves all 24 original `FR-A1`–`FR-F4` identifiers, addresses C01–C15 in substance, uses canonical acceptance/requirement identifiers that exist in the six specifications, preserves the five-tool and readiness semantics, and makes no schema or implementation adoption claim. However, the relocation is not complete: twelve active DEV story drafts still link to the removed former PRD path. That prevents a clean placement verdict. A small residual classification ambiguity also remains in the heading used for unresolved items.

**Severity count:** Critical 0 · High 1 · Medium 0 · Low 1.

## Severity findings

### HIGH — P01: twelve active story-draft links still target the removed PRD path

- `README.md:19` says the only inbound planning-artifact repair outside the workspace is `_bmad-output/planning-artifacts/epics.md`; `source-manifest.json:113-117` records that one repair.
- `epics.md:10-12` correctly points to `_bmad-output/planning-artifacts/prds/prd-Allura_Memory-2026-10-25/prd.md`.
- The active story drafts `DEV-00.md`, `DEV-01.md`, `DEV-02.md`, `DEV-03.md`, `DEV-04.md`, `DEV-05A.md`, `DEV-05B.md`, `DEV-06.md`, `DEV-07.md`, `DEV-08.md`, `DEV-09.md`, and `DEV-10.md` each still contain at line 28: `[PRD](../../planning-artifacts/prd.md)`.
- `_bmad-output/planning-artifacts/prd.md` no longer exists, so those twelve links are broken. The moved historical review bundle's old textual citations are intentionally preserved and are not this finding.

**Required correction:** repair only those relocation-dependent inbound draft links (or restore a deliberately documented stable redirect). Do not alter their substantive story content or any canonical source. Re-run the protected-source and link checks afterward.

### LOW — G01: the unresolved-items heading partially re-conflates evidence/contracts with owner choices

- The status ledger correctly separates Accepted, Proposed, Open, Evidence gap, and Deferred states (`prd.md:43-67`).
- Later, `prd.md:246-253` places “DOC-08 curator-first evidence” and “ENT-01–05 open contracts” under **Remaining owner choices**. DOC-08 is already labeled an evidence gap and ENT rows are labeled Open in the ledger, so the heading is broader than the actual states.

**Required correction:** retitle/split that subsection so product choices, proposed engineering decisions, evidence collection, open contracts, and deferred metric budgets retain the ledger's distinctions. No new decision is needed.

## C01–C15 disposition

| Finding | Result | Evidence in revised PRD |
|---|---|---|
| C01 claim ladder | **Addressed** | Exact `intended → specified → implemented → verified → released` lifecycle and non-automatic progression at `prd.md:23`; source snapshot qualifier at `prd.md:21`. |
| C02 state/owner classification | **Addressed with low residue G01** | Explicit state definitions and ledger at `prd.md:43-67`; unresolved section at `prd.md:246-253` needs heading cleanup only. |
| C03 FR acceptance/evidence mapping | **Addressed** | Every FR row includes an `Acceptance / evidence` cell at `prd.md:77-170`; gaps are explicit for FR-F2/F3/F4 (`prd.md:164-170`). |
| C04 six-source authority map | **Addressed** | Exact repository-relative links and ownership at `prd.md:31-40`; all eleven local links in the PRD resolve. Canonical namespaces are cited in FR rows. |
| C05 core outcome/non-goals | **Addressed** | Proposed minimum product outcome and explicit non-goals at `prd.md:175-185`; the dashboard and later platform work stay outside the minimum outcome. |
| C06 DOC-07 fixed vs proposed | **Addressed** | Fixed remote-read-back and immutable-receipt behavior plus AD-68 implementation choices are separated at `prd.md:124-127`, `prd.md:207-209`, and `prd.md:250`. This matches `DESIGN-ALLURA.md:1115-1121` and `DATA-DICTIONARY.md:373-395`. |
| C07 five-tool semantics | **Addressed** | Exact core set and bounded semantics at `prd.md:111-121`; it does not add tools or grant authority through request fields. This matches `BLUEPRINT.md:150-160`. |
| C08 AD-35 status | **Addressed** | Ledger records Accepted intent / partial foundation / deferred full runtime at `prd.md:57`; sequencing preserves that split at `prd.md:219-222`. Canonical state is `DATA-DICTIONARY.md:693-744`. |
| C09 proposed data contracts | **Addressed** | `prd.md:259-264` explicitly states no schema/API/migration adoption and retains AD-65–68 review gates, matching `DATA-DICTIONARY.md:1651-1722`. |
| C10 dirty-source provenance | **Addressed** | `prd.md:21` links the snapshot manifest and frozen input. `source-manifest.json:8-10` explains the dirty-tree boundary and `source-manifest.json:91-95` binds this exact PRD hash. |
| C11 success evidence vs product outcomes | **Addressed** | Product outcomes and verification evidence are separated at `prd.md:229-235`; passing checks cannot advance claim state automatically. |
| C12 accessibility/responsiveness | **Addressed** | Specific keyboard, focus, name, announcement, contrast, no-overflow, and revision-bound evidence requirements at `prd.md:156-158`; required scenario retained at `prd.md:217-218`. |
| C13 operational failure scenario | **Addressed** | Capture/index ambiguity scenario at `prd.md:193-198` distinguishes durable capture from failed/pending index work and forbids outage invention. |
| C14 assumptions/open decisions | **Addressed with low residue G01** | Fixed constraints at `prd.md:242-244` and unresolved items at `prd.md:246-253`; the obsolete free-form assumptions index is gone. Classification should retain ledger terms. |
| C15 Team RAM/authority routing | **Addressed** | Fixed authority lanes and unknown status at `prd.md:27`; Team RAM runtime link at `prd.md:240`; matches `.agents/TEAM-RAM-RUNTIME.md:144-155` and `guidelines/ALLURA-BMAD.md:44-57`. |

## Required semantic and boundary checks

- **Required FR coverage:** PASS. Both frozen and revised PRDs contain the same 24 IDs: `FR-A1`–`FR-A3`, `FR-B1`–`FR-B5`, `FR-C1`–`FR-C3`, `FR-D1`–`FR-D5`, `FR-E1`–`FR-E4`, and `FR-F1`–`FR-F4`.
- **Invented acceptance/requirement IDs:** PASS. Fully qualified PRD references in the `BP-F`, `GM-F`, `DS-F`, `DOC-J`, `DEV-AC`, `BE-AC`, `CF-AC`, `REQ-*`, `AD-*`, `DOC-*`, `ENT-*`, and `MEM-UC*` namespaces were found in the six canonical specifications. The PRD also says it creates no replacement canonical IDs (`prd.md:40`).
- **Invented approvals:** PASS. The document remains `updated-draft-unapproved` and records that Jobs/Sabir acceptance is not recorded (`prd.md:1-10`). Fixed approved items (DOC-01/06/07, routing, AD-35 intent) are distinguished from Proposed/Open/Evidence gap/Deferred rows (`prd.md:43-67`).
- **Schema/API adoption:** PASS. Proposed fields and transaction semantics are bounded drafting detail; `prd.md:259-264` denies adoption, and canonical proposal status is explicit at `DATA-DICTIONARY.md:1651-1653`.
- **Canonical readiness semantics:** PASS. `prd.md:206-222` keeps document preparation, source presence, implementation, verification, release, live acceptance, and operational status separate.
- **Five-tool semantics:** PASS. `memory_add`, `memory_search`, `memory_get`, `memory_list`, and `memory_delete` are the sole core set; capture is not promotion, retrieval is scoped, and deletion does not erase immutable governed history (`prd.md:111-121`; `BLUEPRINT.md:150-160`).
- **MVP boundary:** PASS. `prd.md:175-185` defines a minimum governed memory outcome while expressly excluding autonomous promotion, direct substrate mutation, fabricated live/compliance claims, and expansion into orchestration/work-plane/desktop scope. Now/Next/Later remains deliberate (`prd.md:200-227`).
- **Unresolved questions:** PASS with G01. The ledger and unresolved section keep decision blockers visible; no product choice was silently closed.
- **Source paths/anchors:** PASS for the PRD itself. All eleven relative Markdown links in `prd.md` resolve. The canonical references use existing stable IDs/ranges; there are no broken fragment anchors in the PRD because its canonical links are file-level and the relevant canonical IDs are stated alongside the requirements.

## Integrity and placement evidence

- The configured BMAD location is `prd_output_path = "{planning_artifacts}/prds"` with `run_folder_pattern = "prd-{project_name}-{date}"` (`.claude/skills/bmad-prd/customize.toml:62-66`), matching this workspace.
- The frozen baseline bytes match `source-manifest.json:85-90` at SHA-256 `b1db0967a7ae36f1dd1e65469d85794c7fb0507e29743545270bffa38828d9c7`.
- All ten protected sources listed in `source-manifest.json:12-82` match both recorded before/after hashes. All nine moved review files also match their before/after hashes (`source-manifest.json:96-111`).
- Independent comparison against `/tmp/allura-prd-update-protected-before.json` found **3,446 unchanged, 0 changed, 0 missing** protected entries. Thus no canonical/source/schema/runtime/workflow file was modified by this update.
- The current six canonical hashes are exactly those recorded in `source-manifest.json:12-54`.
- The old PRD and review root paths are absent, while the configured workspace, frozen input, revised PRD, manifest, README, memlog, and intact review bundle are present.
- Historical old-path citations inside the immutable review bundle remain intentionally historical (`README.md:15-17`); they are not treated as current inbound navigation.
- Placement remains incomplete only because of P01.

## Review limitations

- No product tests, live MCP acceptance, deployment checks, database writes, Notion writes, Brain writes, status transitions, schema changes, or code/config changes were performed.
- The dirty working tree and untracked planning artifacts mean Git history alone cannot reproduce this snapshot; the manifest hashes are the review boundary.
- This verdict binds only the PRD SHA-256 shown above. If `prd.md` changes, this review must be re-run or amended against the new hash.
