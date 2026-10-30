---
title: "Allura beta: reliable daily-agent memory"
date: 2026-10-29
status: proposed-awaiting-owner-implementation-approval
method: bmad-correct-course
mode: batch
scope: proposal-only
baseline_commit: 29e79366e700f31ee7e363fdc41a9fa29897b26d
baseline_branch: local/beta-machine-only
---

# Correct Course proposal: reliable daily-agent memory

## Decision in one page

Recommend a **direct adjustment to existing stories**, not a rebuild, rollback, new epic or weaker approval policy. Improve first-use retrieval guidance, qualify the actual installed Hermes integration, specify a narrow automatic-capture pilot before enabling it, and finish the already-open human acceptance journey on an explicitly approved target.

Sabir authorized Team RAM and Allura to complete this proposal after the recommendation to produce one approval-ready Correct Course artifact. This authorizes the analysis and document, not the new policy choices or implementation described below. The proposal uses Batch mode so the owner receives one coherent decision rather than repeated partial approvals.

The first implementation slice, if approved, is **consumer retrieval/read-back clarity under Stories 5.2/5.3/6.2**. Do not silently add an evidence reader. The next slice is a **controlled reproduction and qualification of Hermes capability refresh**, not a speculative core fix. Automatic capture and actual human acceptance have separate admission gates and need not block the first two slices.

Change size: **moderate**, because product documentation, an external client integration and acceptance sequencing must agree. Planning/documentation effort is low–medium; integration uncertainty is medium. No credible delivery date or hour estimate exists before the Hermes reproduction and pilot decisions. The proposal does not change the MVP, reopen completed local results, claim production readiness or schedule deferred Epics 12–14.

## 1. Trigger, evidence and limits

The trigger was the October 29 laptop reactivation of Troy and Jeeves, followed by Sabir asking how BMAD should address the observed rough edges. It was not a failing story test.

### Observed evidence

- Troy and Jeeves each completed scoped beta search with `outcome=succeeded`, `degraded=false`, and an actual capture/receipt read-back. Troy's receipt is `f6986a16-2dcf-4b7e-9c9f-29b58da0721e`; Jeeves's is `f44158a9-0eb7-45c7-9aa4-cad24e897778`. These identifiers are local acceptance evidence, not credentials or promotion receipts.
- Jeeves's actual agent tool-result rows were independently inspected by the parent after his successful capture/read-back. This establishes that the target agent could invoke the tools, not only that a separate protocol probe could.
- An evidence event ID returned by all-mode search was passed to default semantic `memory_get` and returned `not_found`. Source confirms this is the specified class distinction, not demonstrated data loss.
- Changing Jeeves from read-only to capture in configuration did not immediately expose `memory_add` in running chats. The reported `reload.mcp` response said no server changes; an idle target-profile lifecycle refresh was followed by successful target-agent capture. This establishes a stale-exposure observation and a working recovery, **not its root cause**.
- Both legacy `allura-brain` configurations had `sync_mode=off`. Manual beta acceptance did not qualify automatic provider compatibility.
- The local machine-only beta intentionally denies human enrollment/dashboard/review/deletion surfaces. Telegram/Discord connection and pairing do not qualify an Allura human reviewer or close a human acceptance gate.

Dated parent evidence: `/home/sabira/.hermes/profiles/troy/reports/allura-beta-reactivation-2026-10-29.txt`. Its then-pending Telegram pairing is historical; pairing was subsequently completed and is not a blocker proposed here. Its immutable capture receipts reported indexing pending at capture time; that field is **not a live indexing-health reading**.

### Source-backed interpretation

- `foundation/src/consumer-contract.ts:4,7–11` already discloses the five tools, approved-default retrieval, own receipt lookup, machine deletion denial and unknown timeout outcomes.
- `foundation/src/retrieval-federation.ts:12,45–50` already returns record kind, approval state and content-truncation state; evidence previews are bounded. This proposal must not claim those fields are absent.
- `foundation/src/mcp-api.ts` and `retrieval.ts` dispatch semantic and own-receipt lookup; an evidence-event ID is not automatically a readable semantic ID.
- Hermes source at `/home/sabira/.hermes/hermes-agent/tools/mcp_tool_discovery.py:661–691` compares live server membership during housekeeping reconciliation. Registration filters, agent snapshots and explicit reload have separate paths. This is a reproduction lead only: the exact process revision, RPC routing and cache ownership for the incident remain unproven.
- `spec-6-2-consumer-contracts.md` explicitly excluded installed-agent compatibility from its completed local packed-consumer acceptance. Keep that completion and its historical receipts intact.
- `spec-6-5-core-journey-witness.md:34` and `spec-9-4-operator-acceptance.md:23` already leave actual-human/deployed/hosted/recovery acceptance open. Old exact-build receipts do not qualify today's dirty candidate.

No full application test suite, fault injection, new human study or production audit was performed for this proposal. Team RAM Scout and Jobs performed read-only source/planning reconnaissance; their findings are inputs, not new runtime acceptance.

## 2. Scope, authority and preservation

Repository: `/home/sabira/Allura_Memory-beta-local`, branch `local/beta-machine-only`, baseline HEAD recorded above. The baseline includes existing dirty foundation source/tests, migration `020-embedding-providers.sql` and local verification logs. A separate parent evidence manifest fingerprints the pre-existing tracked/untracked files; it is a preservation receipt, not a work-status database.

This pass creates this proposal only inside the repository. It does not edit the PRD, architecture, epics, implementation specs, protected UX, vendor BMAD installation or source; does not commit/push; does not toggle automatic capture, change credentials/grants or mutate deployed data. The Allura record of this work is an unapproved evidence capture, not an operational work-item transition or semantic approval.

Current `guidelines/ALLURA-BMAD.md` and the October 28 parallel amendment control the existing development method. Team RAM scrutiny of this proposal does **not** reinstate the removed independent developer-review gate. No new writer, worktree, worker service, framework or shadow sprint board is introduced. Existing authorized Epic 10/11 work and their boundaries remain unchanged; this proposal does not preempt a moving writer.

Preserve server-derived tenant/workspace/principal authority, current permission/revocation checks, five public tools, append-only events, immutable receipts/versions/history and independent authorized human semantic approval. Keep the distinction between engine failure, transport/authentication failure, client tool exposure and unsupported lookup clear.

## 3. Impact and options

### Epic and requirement map

| Area | Existing scope | Proposed impact |
|---|---|---|
| Capture policy | 3.1/3.2; FR-A1/A3 | New optional client-side outcome-capture policy; no change to atomic capture or retention by default |
| Proposals | 3.3; FR-B1/B2 | Clarify that automatic evidence capture does not itself invoke proposal generation or approval |
| Retrieval | 5.2/5.3; FR-C1/C2/C3 | Typed identity/read-back guidance and real consumer follow-up tests |
| Evaluation | 5.4; FR-D4 | Later human-use results supplement, never replace, current relevance/isolation evaluation; no invented numeric SLO |
| Operations/consumers | 6.1/6.2; FR-D1/D5/F1 | Separate configured, advertised, exposed and exercised capability; reproduce live-client freshness |
| Release | 6.3/6.4/6.5; FR-F2/NFR-7 | Exact candidate qualification and existing real-human/recovery boundaries remain open |
| Operator UI | 9.1/9.4; FR-E1/E2/E4 | Add first-use confusion/recovery observations to existing witness protocol; preserve design/assets |
| External projection | Epic 7 | Unchanged; Notion delivery is not agent automatic capture |
| Device and modules | Epics 8, 10, 11 | No new scope; preserve credential and module authority ceilings |
| Deferred platform | Epics 12–14 | Remain deferred; this does not require a run engine, board or desktop rebuild |
| Foundational authority | Epics 1–2 | No schema/role/permission change proposed; existing isolation gates stay mandatory |

### Alternatives

1. **Direct adjustment — recommended.** Reuses existing contracts and stories. Low–medium documentation effort; medium integration uncertainty. Adds evidence where earlier local acceptance explicitly stopped.
2. **Rollback — not justified.** Successful scoped capture/retrieval and intentional type separation do not establish an engine regression. Reverting would risk losing useful work without proving a repair. A later operational rollback remains separately authorized and must preserve evidence/history.
3. **MVP reduction/redefinition — not needed.** Leave automation off and optional projection separate while proving the existing governed journey. Do not simplify the demonstration by relabeling saved evidence as approved knowledge.

## 4. Detailed edit proposals: OLD → NEW

These are reviewable edit instructions, **not edits already applied**. Completed-story evidence remains historical; add a dated follow-up acceptance section rather than rewriting its verdict. Section references and quoted OLD text must be revalidated against the current writer's bytes before later application.

### P1. PRD vocabulary and public tool semantics

Target: `prds/prd-Allura_Memory-2026-10-25/prd.md`, §3, current tool table lines 118–121.

OLD:
> `memory_add`: Capture scoped evidence and queue eligible proposals through an authenticated MCP transport; it does not approve semantic promotion and is not a generic REST write
>
> `memory_get`: Read one permitted memory by ID; authenticated scope still applies
>
> `memory_list`: List permitted memories; listing grants no cross-workspace transfer authority

NEW, proposed replacement for those rows:
> `memory_add`: Capture scoped append-only evidence through authenticated MCP and return an exact capture receipt. Capture itself does not generate a proposal or approve semantic knowledge; any eligible proposal workflow is separate. This is not a generic REST write.
>
> `memory_get`: By default, read an authorized current semantic version by its semantic ID; explicit authorized history remains available. `kind=receipt` reads the caller's own exact capture receipt using its receipt ID. Event, receipt, semantic-version and proposal IDs are not interchangeable. Unsupported or unauthorized follow-up does not broaden scope or guess another record class.
>
> `memory_list`: List authorized semantic records with current/history and scoped cursor rules; it is not an evidence-event or capture-receipt listing and grants no cross-workspace transfer authority.

Retain the search row and append this explanation below the table:
> Search defaults to approved current semantic knowledge. Explicit `status=all` can include eligible unapproved evidence. A result's kind, approval state, provenance and truncation state must remain visible to consumers. Guidance identifies a supported authorized follow-up, or explicitly says complete-source lookup is unavailable through that consumer. A receipt lookup proves capture persistence, not full evidence-content retrieval or current indexing/approval state.

Rationale: reconcile the broad PRD wording with the already accepted capture-v1 and consumer-v1 behavior. This does not introduce a new read API or restrict a legitimately approved proposal workflow.

### P2. Retrieval and packed-consumer follow-up acceptance

Targets: `epics.md`, Stories 5.2/5.3; dated follow-up addendum to `../implementation-artifacts/spec-6-2-consumer-contracts.md`.

OLD, Story 5.2:
> Implement current/history lifecycle filtering, get/list/search and authorized graph traversal/provenance; authorize nodes, edge endpoints and all derivatives/cursors/counts/caches before disclosure and re-check before return.

NEW: retain OLD; append:
> Exercise typed search-to-follow-up through actual consumers. Distinguish semantic-version, evidence-event, own-capture-receipt and proposal IDs. Default get/list remain semantic; own receipt lookup remains explicit. Disclose truncation and unavailable complete-source operations without guessing IDs, widening authorization or silently falling back between record classes.

OLD, Story 6.2 bounded contract:
> Explain evidence/semantic identifier differences and separate capture receipt lookup.

NEW follow-up acceptance:
> Demonstrate the distinction in packed SDK/CLI/MCP examples and actual approved agent targets. Capture returns separate receipt/event identities; own receipt lookup uses `receipt_id` with `kind=receipt`; semantic lookup uses the approved semantic-version ID. Search result examples show their existing kind/review/truncation fields and supported or unavailable follow-up. Wrong-kind requests retain documented privacy-safe behavior.

Proposed tests:
- Capture → exact own receipt read-back; stable-key replay yields the original receipt and no duplicate event/index intent.
- Before independent approval, approved-default search does not represent capture as approved knowledge; authorized all-mode may return eligible unapproved evidence.
- Use content longer than the preview bound to prove truncation is disclosed; no example claims a receipt supplies the full content.
- Event/receipt IDs passed as semantic IDs do not trigger permissive type probing. Foreign/other-principal receipts remain denied and do not reveal their existence.
- Recheck current authorization at follow-up, including revocation between search and get. After real authorized approval in the appropriate fixture, retrieve the distinct semantic version and authorized provenance.

Existing test locations: `foundation/tests/consumer-http.test.ts`, `federation.test.ts`, `capture.test.ts`. Existing code seams: `consumer-contract.ts`, consumer client/CLI/MCP guidance, `retrieval-federation.ts`, `mcp-api.ts`, `retrieval.ts`.

Decision: **no new evidence-read variant in the first slice**. If useful complete-source retrieval cannot be served by the existing authorized interface, submit a separately scoped five-tool-compatible API/authorization/compatibility proposal. Do not turn this guidance task into an unreviewed read surface.

### P3. Installed Hermes capability reconciliation

Targets: `epics.md` Story 6.2; dated installed-consumer addendum to `spec-6-2-consumer-contracts.md`; PRD FR-D5/FR-F1 acceptance guidance.

OLD, Story 6.2:
> Inventory separately deployed consumers before compatibility decisions; implement and exercise packed SDK/CLI/MCP/API consumers, exact version/dependency guidance and first-use disclosures. Do not restore old runtime as a prerequisite.

NEW: retain OLD; append:
> For each approved installed-agent target, separately record configured capability, server-advertised tools, session-exposed schema and exercised behavior. Bind the observation to exact client/server revisions where observable, configuration/schema identity, target profile/session and time; mark unavailable provenance unknown. Validate new and existing sessions separately. Report stale exposure without claiming a root cause or an effective refresh from acknowledgment alone.

Isolated reproduction/acceptance matrix:
- Use two disposable profiles and a controlled MCP server. Keep name/endpoint stable; change only tool filtering, then separately test a credential-mode/configuration change.
- Test read-only → capture and capture → read-only through the actual affected reload route; inspect registration, fresh-session and already-open-session exposure, then attempt an authorized/denied invocation.
- Do not rewrite an active turn's tool schema or break prompt caching. Define a safe turn/session-boundary adoption rule; before that boundary, report pending refresh rather than falsely effective configuration. Server-side denial must protect revoked authority independently of stale tool visibility.
- Exercise reconnect failure, concurrent configuration changes and recovery. Another profile's permissions and active conversation must remain unaffected.
- Preserve the original stale and failed observations. A later green test cannot establish the original failure's cause.

Hermes code is a **separate repository and approval target**, not part of an Allura source fix. Read-only diagnosis and isolated test design are proposed first. Any client patch must name its checkout, owned files, revision and test command before implementation; no editing the live parent runtime as an incidental workaround.

No new schema/authority fields are adopted by these observational categories. Safe reports must exclude tokens, private prompts, raw conversation content and foreign identifiers.

### P4. Narrow automatic outcome-capture policy

Targets: proposed policy addendum under `contracts/capture-v1.md` and PRD Feature A, linked to Stories 3.1/3.2/6.2; clarify Story 3.3 without changing existing proposal behavior.

OLD, capture contract:
> Key is not content deduplication; two different keys can capture identical content intentionally. Caller cannot set actor or promote.

NEW: retain OLD; append a clearly **proposed, default-off client policy**:
> Automatic outcome capture remains off until the owner approves named profiles/workspaces, eligible sources/content, exclusions, operation-identity behavior, finite limits and reconciliation. For an opted-in substantive outcome, stable scoped identity and unchanged payload survive retry/restart. Changed payload under the same identity conflicts. Automation creates append-only evidence only; it does not confer proposal, review, promotion or external-transfer authority.

Suggested pilot, not activated here: explicit finalized decisions and verified task outcomes only; exclude credentials, raw transcripts, sensitive personal/customer/HR material without specific consent, transient chatter, speculation and duplicate handoff summaries. One local named profile first; expanding to Jeeves or another workspace requires its explicit scope. Exact numeric limits and the appropriate identity/checkpoint mechanism remain design decisions, not invented requirements.

Required policy decisions before a build that captures real data:
1. Named profile/workspace/source and consent owner; eligibility and exclusions.
2. Stable operation key/checkpoint across retry/restart and semantics for a corrected outcome. Do not derive a new retry key from a regenerated summary.
3. Redaction/sensitivity checks before submission, with fail-closed uncertain cases and no secret logging.
4. Finite rate/size/retry limits, operator disable control and unknown-outcome reconciliation owner.
5. Append-only retention disclosure: disabling future capture does not delete existing evidence; no new TTL or cleanup permission.
6. Evidence-only stopping point. A future proposal-generation policy requires a separate specification and authorization.

Acceptance: default-off/opted-out/excluded cases make no capture call; denied/revoked scope produces no accepted write; exact retry after a lost acknowledgment/restart reuses one receipt; changed-payload conflict is preserved; timeout remains unknown until original-key reconciliation; no implicit proposal/promotion/Notion transfer. Inventory the legacy automatic-sync adapter before compatibility claims—**do not simply toggle its existing setting on**.

### P5. Architecture and first-use/operator guidance

Target: `architecture.md`, State and mutation rules, rule 4.

OLD excerpt:
> Retrieval: current/history filters and equivalent-scope degradation; denial never broadens fallback.

NEW: retain the full existing rule, including graph authorization; append:
> Consumer-visible record identity retains its class. A supported follow-up must preserve current authority and class-specific semantics; an unsupported complete-source operation is disclosed, not emulated through a broader data path. Capture receipt state is immutable decision-time evidence, not a current-stage health probe.

Topology is unchanged. If the automatic pilot is later approved, show it as an external authenticated capture client, not a second memory authority or a core approval worker.

UX target: a dated follow-up under the existing Story 9.1 task/first-use guidance, referencing `docs/allura/DESIGN-ALLURA.md`, “First-use disclosure and review labels.” Protected design/assets/layout remain untouched.

OLD existing rule:
> Empty search, service failure, missing source, authorization denial and unknown review state must lead to an explicit result and a next diagnostic action.

NEW acceptance addendum, retaining that rule:
> Include record kind, supported follow-up and unavailable/truncated-source explanations in task guidance. Observe whether humans can distinguish saved evidence, a receipt, a pending proposal and approved knowledge without coaching. Record manual assistance and recovery effort; do not redesign the dashboard or claim human acceptance from screenshots alone.

### P6. Actual human journey: finish existing gates

Targets: addenda to `spec-6-5-core-journey-witness.md` and `spec-9-4-operator-acceptance.md`, plus the next candidate-specific release packet.

OLD, Story 6.5 unchecked gate:
> Separately authorized hosted CI, actual deployment target/identity onboarding, real-human journey and non-destructive operational rollback witness; then epic6 retrospective.

NEW: retain OLD and its unchecked state; append:
> The actual witness distinguishes saved evidence, pending proposal and approved knowledge; uses the supported ID-specific follow-up; recovers from empty/denied/stale-schema/unknown outcomes without duplicate capture or broader access; and retrieves the exact approved current record in a later authorized agent session. Exercise correction and retained history. Record actual confusion, assistance and recovery, not an invented success score.

Admission requires an explicitly named isolated target/HTTPS origin, resource/onboarding owners, consented participants including a different entitled approving human, exact candidate/CI/package identity and evidence-preserving recovery authority. Hosted CI/publication/deployment remain separately scoped. The existing machine-only installation stays machine-only; no flag or role change is implied.

Reuse the existing release packet's task protocol and operator accessibility/manual checks, but issue fresh receipts for the actual tested candidate. Its old artifact and synthetic-human fixture results cannot close today's actual-human requirement. Story 9.4 remains open for operator evidence; no aggregate core or product release claim follows from agent pairing.

## 5. Implementation handoff and success criteria

These assignments are proposed responsibilities, not claims that implementation workers have started.

1. **Brooks / product owner:** present this proposal, record implementation scope and unresolved policy/target choices. Apply approved textual addenda against current bytes; preserve historical local acceptance and all external gates. Do not invent a shadow sprint-status file or claim a live Allura work transition without its supported API.
2. **Scout then Woz / consumer owner:** implement the smallest P1/P2 guidance-and-test slice after approval. Establish observed RED for any behavior defect; where behavior is already correct, add missing contract/consumer coverage without manufacturing a failure. Re-run the focused real consumers, then applicable current project gates.
3. **Consumer/runtime owner:** reproduce P3 on an isolated target and identify the responsible layer. Only then scope a fix in the correct repository; qualify both privilege gain and removal, real session invocation and neighboring-profile isolation.
4. **Brooks + Sabir:** decide P4 pilot policy. Woz inventories the adapter and proposes its bounded implementation/tests. No live automatic capture until the policy and target are explicit and verified.
5. **Delivery owner + Sabir / actual participants:** satisfy P6 target/identity/recovery authority and observe the existing governed journey. Durham's operator/visual role applies only to the separately authorized UI witness. Agent reports cannot substitute for human participation.

Existing Allura validation entrypoints, verified in `foundation/package.json`: `bun run test`, `bun run test:db`, `bun run typecheck`, `bun run lint`, `bun run check:all`, and exact-revision `bun run ci <revision>`. Use the repository's required discovery and approved disposable resources; do not run production migrations or reuse a dirty working tree's old CI receipt. Runtime pins and the final owned test selection must be verified at slice admission. Hermes reproduction requires its own inspected test command, not an invented Allura command.

For each later slice retain exact input revision/diff, test/environment authority, RED where applicable, final commands/counts/exit codes, known limitations and next concrete gate. Passing a local slice permits only its accepted local conclusion; no automatic deploy, status closure, public release or semantic promotion.

## 6. BMAD checklist disposition

`[x]` means proposal analysis complete, not product implementation. `[!]` identifies a subsequent owner/admission gate.

- 1.1 [x] Trigger: installed-agent first use, mapped to 5.2/5.3/6.2 and existing 6.5/9.4 acceptance; not falsely attributed to a failed story.
- 1.2 [x] Core problem: usability/qualification seams, an unproven runtime freshness cause and a proposed automation policy; no strategic pivot.
- 1.3 [x] Actual observations, source contracts and evidence limits recorded in §1.
- 2.1–2.2 [x] Existing epics remain viable; proposed dated follow-ups rather than a new epic or erased completion.
- 2.3–2.5 [x] Remaining epic impacts and local priority described in §3; existing 10/11 authority preserved, 12–14 not activated.
- 3.1 [x] PRD wording/policy impact: P1/P3/P4, with no MVP redefinition.
- 3.2 [x] Architecture impact: typed consumer boundaries, no topology/authority redesign (P5).
- 3.3 [x] UX impact: guidance and observed confusion only; protected design retained (P5/P6).
- 3.4 [x] Other impacts: consumer/runtime tests, candidate-specific release evidence and integration runbook; no live infrastructure change.
- 4.1 [x] Direct adjustment viable and recommended, with stated uncertainty.
- 4.2 [N/A] Rollback not justified by observed evidence; evaluated in §3.
- 4.3 [N/A] MVP reduction not required; evaluated in §3.
- 4.4 [x] Chosen approach and effort/risk/timeline limits stated.
- 5.1–5.5 [x] Issue, epic/artifact impacts, rationale, ordered action plan and role handoff included.
- 6.1–6.2 [!] Parent validation and Team RAM proposal review must complete against the final frozen document before delivery. Review evidence belongs in the accompanying parent execution receipt, not an invented product test result.
- 6.3 [!] Sabir's approval of the **completed implementation proposal** remains required. His authorization to produce it is recorded, not substituted for this decision.
- 6.4 [N/A now] No epic creation/removal/renumbering or approved live-status transition in this pass. Use the existing authority after approval; do not create a YAML board merely because the generic checklist names one.
- 6.5 [!] Handoff responsibilities and success criteria are specified; implementation starts only within the subsequently approved scope.

## 7. Approval boundary

Requested next decision: approve P1–P3/P5 local follow-up implementation and the associated artifact addenda, with P3 restricted initially to isolated reproduction. Keep P4 live automation and P6 target/deployment/human actions on hold until their explicit admission details are supplied. Alternatively, revise any proposed amendment before implementation.

This proposal does not ask the owner to reapprove established immutable-history, tenant-isolation or independent-human-promotion invariants. It asks for the bounded new consumer work and preserves the genuinely unperformed gates.

## Execution provenance

Method: installed repository BMAD 6.12.4 Correct Course workflow and full checklist. Central config and customization were resolved with the actual repository scripts. `uv` was unavailable; running those same Python scripts with `python3` succeeded. Correct Course prepend/append/facts/on-complete resolved empty; no hidden activation step was skipped. `AGENTS.md` is absent; the retained `guidelines/ALLURA-BMAD.md` supplies the repository method and historical-pointer mapping.

Team RAM: Troy/Brooks is the sole proposal writer; Scout and Jobs returned read-only source/intent findings through native Astra delegation. Proposal review and final preservation/read-back receipts are recorded by the parent separately. No independent development review, application test execution, runtime fix or release is claimed by this document.

Allura start checkpoint, read back by receipt: `13a3a610-d047-4823-b9d9-0274396891f2`, in the existing Team RAM `allura-system` workspace. Final outcome must also be captured/read back as evidence; neither record is semantic approval or operational status.
