# Applied Correct Course — all 14 epics, local scope

**Disposition:** already-approved direction applied to documentation; detailed 12.1 local design adopted under delegated engineering authority. No implementation, story closure, live-status transition or release acceptance. Batch mode; installed repository `bmad-correct-course` plus its complete checklist, interpreted through the current [adapter](../../guidelines/ALLURA-BMAD.md). Admission: clean `7f3b9065d30a78f8d4b20a17392cafd8bf9c02b4`, branch `local/beta-machine-only`, 2026-10-31.

## 1. Issue, trigger and approval provenance

The older planning spine still excludes/defer-labels Epics 12–14 and carries reset-era implementation/next-story tables. Those do not represent current source/evidence or Sabir's subsequent direction. This is a stakeholder scope adoption at the 12.1 boundary, not a failed implementation or permission to rebuild completed work.

Owner decision record: `/home/sabira/.hermes/profiles/troy/workspace/allura-all14-scope-decisions-2026-10-31.md` (2026-10-31 current Troy conversation). Exact recorded instructions:

- “ok have team ram use this skils and complete all 14 epics” — adopt existing 12–14 for local product development, retaining actual 1–11 evidence and functional/security prerequisites.
- “Allura owns live status; Notion is planning only” — Allura PostgreSQL is the sole writable operational work-status authority; no two-way board sync or assumed Notion write-back.
- “Linux first, connecting to the existing Allura server” — remote-connected Linux-first shell; no assumed local runtime supervisor or other-OS acceptance.

The current delegation additionally records Sabir's later “we dont need the tunnel atm”; tunnel and network infrastructure remain untouched, not a local build dependency. The current explicit task is: “Team RAM Brooks/Woz: apply the already-approved all-14 local scope amendment and adopt the prepared Epic 12.1 durable-run contract. Bounded documentation-only canonical writer; deliver validated exact diff and first implementation handoff, no commit or story closure.” This supplies application approval, not merely permission to draft. No repeated board/OS/trigger/mode question is needed.

Ordinary engineering decisions are delegated by the adapter's existing direct-build authority. The prepared candidate `/home/sabira/.hermes/profiles/troy/workspace/allura-12-1-contract-candidate-2026-10-31.md`, SHA-256 `56adfdc304a5c6019d1079e521c174772863528e989d1db35e30031513b06897`, is adopted as [durable-runs-v1](contracts/durable-runs-v1.md), with explicit adoption/first-RED/DTO wording clarifications. Its defaults are not represented as user quotations. Parent released its historical compiler freeze after the compiler-witness commit; this documentation task still excludes all compiler source/specs/reports and existing evidence.

## 2. Impact analysis

| Scope | Applied disposition | Retained gate |
|---|---|---|
| Epics 1–11 | Preserve actual source, local evidence and prior acceptance; no stale-table reset | Actual incomplete local/security requirements and 6.5/9.4 release/human/hosted/deployed gates remain open |
| 12.1 | Concrete unmet run use case, immutable provenance, authority/DTO/storage/API/failure contracts adopted | Documentation adoption is not runtime behavior, accepted story completion or full methodology execution |
| 12.2–12.3 | Dependency-ready local bounded implementation now in scope; one artifact-check/pause/resume/handoff tracer first | Real RED/GREEN; current revocation; restricted SQL; crash/replay/fence/concurrency/cancellation/drift/unknown evidence; full story AC not collapsed into first slice |
| 13.1 | DOC-09 ownership/direction settled: only Allura PostgreSQL writable live status; Notion planning | Exact work-item transactions, revisions, conflicts, audit/receipts and actual supported status capability |
| 13.2–13.3 | Local native governed work plane/workspace adopted, no board-sync adapters | Scoped transitions, stale/concurrent state, evidence links, real retained UX and human acceptance |
| 14.1 | Linux-first remote-connected existing-server target adopted | Framework/package, verified server identity/authentication, secure store, updates/rollback, offline/read-only/reconnect/deep-link and UX contracts |
| 14.2–14.3 | Bounded Linux shell integration and platform evidence adopted locally | Exact-build Linux packaging/security/accessibility/update/recovery witnesses; no automatic release or other-OS support |

**Architecture:** reuse the existing Bun/TypeScript/PostgreSQL and core gateway; runs outside Brain, no new service/runtime/dependency or second authority plane. Candidate executable anchors still match; migration inventory is 001–024 ending `024-selected-client.sql`. The later implementation may reserve 025 only after rediscovery. Separate immutable definition/policy/input/evidence from mutable runtime projections. Existing Action union, authentication, machine/client ceilings, semantic approval and shared transaction semantics remain unchanged.

**UX:** inspected retained `docs/allura/DESIGN-ALLURA.md` and `docs/design/command-center/operator-surface-contract.md`; no new run screen is necessary for the initial API tracer. Protected UX/brand/assets stay unchanged. Later workspace/desktop flows must bind existing references and exact loading/denied/stale/unknown/accessibility states; this amendment neither redraws nor accepts them.

**Infrastructure/testing:** no source/test/CI/DB/deployment/infrastructure changes in this task. The later handoff explicitly names test registration, nonzero required-case discovery, owned disposable DB and exact migration-inventory expectations; it does not weaken shared runners. No tunnel work, remote MCP retries, credential access, remote governance claim, Brain/Notion writes or operational-status probe. Brain outage is not a local-work veto under current repository authority.

## 3. Chosen path and alternatives

**Direct adjustment, moderate scope**: apply additive controlling sections to owned planning/adapter documents; retain historical content and evidence, adopt the prepared precise contract, hand one bounded RED slice to the sole Woz writer after parent inspection. Documentation effort is low; subsequent durable-run implementation risk is medium because transactions, current revocation, crash recovery and exact replay require real boundary evidence. No elapsed delivery estimate or completion date is invented.

Rollback is not justified: it would discard useful verified 1–11 work without resolving this scope mismatch (high preservation risk). Reducing/restarting the core MVP is unnecessary and contrary to the settled local all-14 direction. The core memory journey and its release gate do not expand into automatic whole-roadmap acceptance. Separate local work from actual deployment/platform/human gates so progress does not depend on repairing unrelated infrastructure. No new epic or renumbering is needed.

## 4. Exact before → after changes

All six existing files receive only scoped additive sections; old text/frontmatter/tables remain byte-preserved when those insertions are removed. New wording is controlling only for these settled changes.

| Artifact and location | OLD (preserved historical wording) | NEW controlling addition and rationale |
|---|---|---|
| `guidelines/ALLURA-BMAD.md`, direct-build authority | “No broader deferred-epic adoption” in the 2026-10-30 correction | New `Controlling all-14 local scope amendment — 2026-10-31`: adopts 12–14 locally, settles board/OS, forbids tunnel work, adopts 12.1, preserves STOP/direct-self-check/Brain-outage and security boundaries. Current approval overrides only conflicting older scope. |
| `epics.md`, following title | “Durable governed run kernel (deferred)”; “PostgreSQL work plane and operator workspace (deferred)”; “Governed desktop shell and release evidence (deferred)” | New `Controlling local all-14 adoption — 2026-10-31`: names 12.1 adoption, next bounded 12.2 RED, 13.1–13.3 single-authority work-plane requirements, 14.1–14.3 Linux remote-connected requirements. Historical status tables are not rewritten. |
| `architecture.md`, following title | “Full run/work plane/desktop remain deferred”; DOC-09 “Product decision before native board/sync” | New `Controlling architecture scope amendment — 2026-10-31`: concrete run boundaries and authority/storage model, settled work-plane direction and desktop target, precise remaining contracts. Existing core diagram unchanged; no actual topology change. |
| `readiness.md`, following title | “Epic 1 is NOT complete”; “Next is 1.2” reset narrative | New `Controlling bounded readiness amendment — 2026-10-31`: preserve actual later evidence, documentation-ready 12.1, clean admission/hash/migration provenance, next RED and open release/platform/human gates. No fabricated runtime readiness. |
| `brief.md`, following title | “Full governed run/product surface, PostgreSQL work plane, operator workspace and desktop shell” under Later/deferred | New `Controlling product-scope amendment — 2026-10-31`: local all-14 adoption, concrete handoff use case, owner board/OS choices and unchanged core/product boundaries. |
| Nested `prds/prd-Allura_Memory-2026-10-25/prd.md`, following title | FR-F3 “Full runtime and BP-F53–55 work plane remain deferred”; DOC-09 “Needs a decision” | New `Controlling local all-14 scope and decision amendment — 2026-10-31`: resolves scope/ownership/direction/target, adopts FR-F3 detailed run design, leaves work-item mechanics and desktop security/package contracts open. Stable requirement IDs unchanged. |
| New `contracts/durable-runs-v1.md` | Candidate outside canonical repository, explicitly proposed under then-active freeze | Canonical adopted 12.1 local design; source candidate remains immutable. Updates adoption/freeze language, names first RED separately from full tracer, clarifies typed failed measurement/public lease omission/private projections and smallest build subset. |
| New `../implementation-artifacts/spec-12-1-durable-run-contract.md` | No canonical 12.1 adoption receipt | Contract provenance, final design choices, evidence boundary, exact first RED and future implementation file allowlist; no runtime completion/status claim. |

The final evidence packet contains the exact unified diff including new files plus per-path before/after SHA-256. It is a documentation verification receipt, not a shadow operational board.

## 5. Installed workflow and completed checklist

Both prescribed commands actually ran from the explicit repository root with exit 0:

```text
uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/bmad-correct-course --project-root . --key workflow
uv run _bmad/scripts/resolve_config.py --project-root .
```

Resolved activation prepend/append/facts are empty; no extra activation steps exist. Config resolves project `Allura_Memory`, user `Sabir`, communication/document language `English`, skill level `intermediate`, planning `_bmad-output/planning-artifacts`, implementation `_bmad-output/implementation-artifacts`, knowledge `docs/allura`. Actual local datetime is recorded by the command receipt; filenames use the approved 2026-10-31 date. Installation manifest is BMAD 6.12.4 and the real catalogue includes Correct Course and Build. `AGENTS.md` is absent (optional); nested PRD and current epic catalog were fully read. No legacy sprint-status or deleted dictionary/runtime is recreated. Adapter maps missing historical context to current planning; raw vendor/TOML bytes stay unchanged. No additional remote governance/reviewer ceremony is invoked.

| Checklist item | Disposition / evidence |
|---|---|
| 1.1 | [x] Triggering boundary 12.1; stakeholder adopts all existing epics, not a failed code story |
| 1.2 | [x] Scope mismatch plus settled product authority/target choices; section 1 |
| 1.3 | [x] Exact instructions, decision record, pinned candidate and clean admission |
| 2.1 | [x] Epic 12 remains viable with concrete durable-handoff contract |
| 2.2 | [x] Adopt existing 12–14 locally, no added/removed/renumbered epics |
| 2.3 | [x] Preserve 1–11; 13 work-plane and 14 desktop dependencies retained |
| 2.4 | [x] No invalidated epic; eliminate assumed two-way board sync/local supervisor from current scope |
| 2.5 | [x] Continue dependency-ready local work; do not use deferred release-only 6.5/9.4 as blanket veto |
| 3.1 | [x] PRD FR-F3/FR-E3/DOC-09 and platform scope addendum, core journey unchanged |
| 3.2 | [x] Run storage/authority/replay/API and work-plane/desktop separation, section 2 |
| 3.3 | [x] Protected design inspected; no initial UI change; later fidelity/accessibility gates retained |
| 3.4 | [x] Registration/migration-inventory implications named for later build only; infra untouched |
| 4.1 | [x] Direct adjustment viable; low docs effort, medium later implementation risk |
| 4.2 | [N/A] Rollback rejected; no failed implementation needs reversal |
| 4.3 | [N/A] Core MVP reduction/restart rejected; adopted local extensions remain separately accepted |
| 4.4 | [x] Direct adjustment selected with preservation/bounded-evidence rationale |
| 5.1 | [x] Issue summary and approval in section 1 |
| 5.2 | [x] Epic/artifact impacts in sections 2 and 4 |
| 5.3 | [x] Rationale/alternatives in section 3 |
| 5.4 | [x] Core boundary unchanged; contract → RED/GREEN → separate release acceptance |
| 5.5 | [x] Brooks canonical docs; parent inspection/commit/build admission; Woz sole implementation writer |
| 6.1 | [x] All applicable checklist items addressed; runtime/external obligations explicitly unperformed |
| 6.2 | [x] Direct document self-check, exact diff/hash/preservation/reference validation; no independent reviewer claim |
| 6.3 | [x] Already-approved direction and explicit apply/adopt instruction recorded in section 1 |
| 6.4 | [N/A] No sprint-status.yaml: current adapter and owner require Allura-only operational status; no live capability invoked |
| 6.5 | [x] Exact next RED/file bounds in section 6 and 12.1 spec; no invented delivery schedule |

## 6. Implementation handoff and completion boundary

**Brooks/docs:** applied these scoped additive edits and adopted the detailed contract; no application implementation or closure. **Parent:** inspect exact changed bytes/evidence, commit if accepted under existing local authority, then admit one Woz writer using installed `bmad-build` plus the current adapter/direct-self-check method. **Woz:** first RED is `run HTTP start persists one immutable scoped admission receipt` in `foundation/tests/runs-http.test.ts`; registration-only change to `foundation/scripts/test-db.ts`. Use existing `createCoreGateway`/lifecycle fixture and a real signed human admin. Assert HTTP200 before checking persisted receipt; current absent route should yield actual 404, not an import/schema failure. Run `bun run test:db` from `foundation/` through the owned-target runner, with exact nonzero case evidence. RED is expected, not yet observed here.

Then build start → artifact check/pause → exact approval → fresh-process resume → one local handoff incrementally. The adopted contract specifies subsequent positive/denial/fault/fence/revocation/recovery cases and full registration/command/file limits. An admission-only GREEN is not tracer acceptance or completion of 12.2/12.3. Keep current authorization, immutable original receipts, fail-closed drift and unknown reconciliation; never promote semantic memory or update live work status as a run side effect.

Documentation acceptance uses resolver exit codes, local Markdown target checks, changed-file allowlist, byte-preservation of all nonallowed tracked paths, additive-only historical preservation, `git diff --check`, new-file whitespace checks and an exact diff including untracked documents. Product tests are unrun because this task is docs-only. Active runner STOP is checked without mutation; parent must recheck before implementation. Current source/hash checks expose no conflicting prerequisite to this documentation adoption. Actual external release/platform/human gates remain outstanding, not passed or repaired.

At completion run the prescribed `workflow.on_complete` resolver and retain raw output/exit code in the evidence packet; an empty value adds no terminal action. Evidence lives only under `/home/sabira/.hermes/profiles/troy/workspace/allura-all14-adoption-evidence/`. No commit, source mutation, story closure, reviewer delegation, remote governance/state write, or claim that all 14 epics are complete.
