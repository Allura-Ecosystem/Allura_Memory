---
title: "Correct Course: Faith Meats internal team MCP beta"
status: approved-planning-amendment-applied-build-in-progress
created: 2026-10-30
mode: batch
scope: moderate-delivery-and-client-acceptance-adjustment
baseline_commit: 7365f9fc2f320401be1e85c3d0eb9a14d8e866e6
operational_status: not-asserted
goal_execution: revised-goal-active-by-explicit-user-resumption
---

# Correct Course — internal team MCP beta

## Subsequent approval and current authority

After ending the old goal, Sabir explicitly directed: “go now use team ram and bmad to finish the new goal.” This approves the delivery correction and bounded implementation toward the revised goal. The planning qualifiers below are applied to the PRD, epic catalog, architecture, current adapter and 6.5/9.4 evidence notes. The new native goal is active under the current session with the remaining prior allowance, not an unlimited budget. Its verified receipt is `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/goal-resumed-team-mcp.json`.

All following references to an ended goal, dormant handoff, unapplied proposals or pending approval describe the earlier CC snapshot and are superseded by this adoption paragraph. They remain historical evidence, not current stop instructions. This approval does not establish working client authentication, permit identity impersonation, grant blanket production mutation authority or close 6.5/9.4. Exact target/compatibility/security gates and genuine human consent remain mandatory. Team RAM Scout performs read-only investigation; the canonical source writer then receives a bounded test-first slice through the installed BMAD build route. No developer-review ceremony overrides the current adapter; actual product human approval remains required.

## Decision summary and stop boundary

Sabir requested: “cc and end goal for now.” This authorizes this bounded analysis/proposal and ending the current native goal. It does not approve implementation of the detailed edits below, restart autonomous execution, close release stories, or authorize further deployment/access changes.

Recommended approach: direct adjustment of the delivery goal, consumer acceptance and handoff. Preserve the working code, current product requirements, verified tests and recovery evidence. No product restart, scope reduction, new desktop product, or rollout of an incompatible backend under an existing URL.

The native goal for session `20261030_134133_6ae657` was archived and cleared through GoalManager.clear(), then independently reloaded: status `cleared`, active `false`. This is a user stop, not successful product completion. No replacement goal is active. Evidence is in `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/correct-course/goal-ended-verification.json`.

## 1. Issue summary

### Trigger

The standing goal narrowed the outcome to Sabir signing into an owner-only dashboard. Sabir clarified the actual beta audience and use: an open-source project being used and tested internally by Sabir, Gabe and Sam, with private Faith Meats access through Cloudflare.

Confirmed intended setup:

- Home desktop runs Gilliam's Hermes agents; Sabir uses ChatGPT Desktop there.
- Gilliam previously had SSH access to a laptop for deployment. This is user-supplied topology, not a verified current connection to the replacement Dell.
- Work laptop uses Claude Desktop.
- Application access uses `https://mcp.faithmeats.org/mcp`, restricted to the Faith Meats team. Deployment SSH and application authentication are different paths.

The temporary local-only/sample-sandbox direction was superseded by the later explicit Cloudflare/team MCP direction. No sample sandbox was completed and it is not the current goal.

### Root cause

This is primarily a misunderstanding of delivery intent and inadequate client-specific acceptance, with real integration gaps—not a change in the core product strategy. PRD §1 already says MCP/API-first for developers and connected-agent teams; §1.3 explicitly rejects requiring a dashboard for routine save/search. An owner dashboard gate was incorrectly treated as the whole beta outcome.

### Evidence and limitations

- Archived native goal required a dedicated owner-only HTTPS dashboard and actual Sabir browser navigation. Its boundary text remained stale after the staging route was parked.
- Existing Cloudflare Access app inventory lists the exact team emails `sasheed@faithmeats.com`, `gabec@faithmeats.com`, `samuel.m@faithmeats.com`, plus existing service-auth policies. An edge allow-list is not an Allura workspace grant or completed onboarding.
- Existing public endpoint witness: HTTP 200 initialize, 26 listed tools and HTTP 200 non-error scoped memory_list using Troy's existing machine credentials. See private report `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/public-authenticated-read-witness.json`. This is legacy-service evidence, not new-beta or ChatGPT/Claude acceptance. No team member's credentials were borrowed.
- Initial tunnel inventory reported down; later inventory reported healthy and the actual authenticated request succeeded. This investigation did not start that connector; no causal repair claim is made.
- The fresh consumer is a different five-tool prerelease. Story 6.2 documents incompatible legacy selectors, IDs, pagination, capture keys and deletion semantics. Existing public endpoint success cannot be relabeled fresh-beta success.
- Story 8.3 verifies Linux Secret Service, not Windows/macOS support. Native ChatGPT/Claude integrations may have their own credential flow; do not assume they use that Linux SDK or require building an Allura desktop shell.
- ChatGPT setup is not verified: the app's current dynamic-registration configuration has no ChatGPT redirect allowlist entry; actual ChatGPT callback is not obtained; browser automation remained at a verification interstitial. Earlier OTP delivery trouble is unresolved. A callback-only fix would not prove origin authorization compatibility.
- Current Dell inspection found no SSH listener, SSH server configuration or authorized_keys for the current user. That does not disprove the user's historical desktop-to-laptop SSH setup or identify its old target.
- The isolated newer beta's public staging route was parked earlier. This CC does not restore it. The earlier exact hosted-green candidate and local test evidence remain historical receipts, not proof of current team access.

## 2. Impact analysis

### Product and artifacts

| Area | Finding | Proposed impact |
|---|---|---|
| PRD §§1, 1.3, FR-A1/A2, FR-F1/F2 | MCP-first, scoped and self-hosted intent already fits | Add an internal-beta delivery clarification; no FR/NFR removal or new promotion policy |
| Architecture: design paradigm, invariants, authority boundary | Human, machine and device identities must stay separate | Add a deployment/client diagram and explicit OAuth-to-origin compatibility gate; no silent JWT-to-machine conversion |
| Epic 2 / authority-v1 | Real current binding, membership and workspace grants remain necessary | Consume existing authority contracts; a new delegated-client mechanism, if required, needs an explicit bounded design amendment and tests before implementation |
| Epic 6 / 6.2 | Packed local consumers are verified; installed external clients were explicitly excluded | Add a client rollout acceptance addendum; preserve existing local completion evidence |
| Epic 6 / 6.4–6.5 | Protected staging and core-journey/recovery acceptance are separate | Reconcile old pending CI/onboarding statements with exact receipts; retain remaining actual-human, journey and operational acceptance gates |
| Epic 8 / 8.3 | Linux-only local secure-store witness | Add an actual-client/platform capability matrix; no unsupported platform claim, no plaintext workaround |
| Epic 9 / 9.4 and operator UX | Dashboard/human review remains necessary for its governed tasks | Preserve real-human and accessibility/visual acceptance. Do not make all independent machine-client work wait on dashboard login |
| Epics 7, 10, 11 | Projection, bounded plugins and experiments | No changes to adopted scope, transfer authority or acceptance |
| Deferred Epics 12–14 | Run/work plane/native desktop shell | Remain deferred. Connecting existing ChatGPT/Claude/Hermes apps does not activate these epics |
| Goal and handoff/runbooks | Owner-only outcome and stale route assumptions | Replace only after approval/resume; separate deployment access, app access and product acceptance |

Epics 1, 3, 4 and 5 retain their contracts and verified local work. No epic is removed, renumbered, declared obsolete or automatically reopened. No independent development-review ceremony is added; direct self-checks remain the current methodology. Independent authorized human semantic decisions remain mandatory.

### Technical and UX consequences

Cloudflare account-management authorization, Cloudflare application login, Allura authorization and client tool execution are separate gates. Browser OAuth success cannot imply memory:capture, workspace access or human promotion authority. The current fresh authority contract explicitly forbids turning a browser JWT into a machine credential. A service bridge that injects Troy's token or shared administrative identity is not an acceptable shortcut.

The user-facing connection journey must say which endpoint/build is connected, which person/application is acting, what workspace is authorized, whether read/write is supported, and whether a failure is login, grant, transport or tool execution. Preserve the approved operator design, graph, accessible controls and evidence-first presentation; no visual redesign is proposed.

## 3. Options and recommendation

1. Direct adjustment — recommended. Documentation effort low; actual integration effort medium with potentially high security impact at identity/compatibility boundaries. Preserve useful implementation and focus the next bounded work on actual clients and deployment identity. No reliable completion date exists until the real client/auth paths are inspected.
2. Roll back completed implementation — not justified. Effort and regression risk high relative to benefit. Wrong acceptance framing does not invalidate working governed services or hosted tests. Keep targeted release rollback as an operational safety requirement, not a product reset.
3. Reduce/redefine MVP — not needed. The core PRD already supports the intended audience. Internal beta availability is a narrower delivery milestone, not permission to weaken authentication, evidence, independent promotion or final acceptance.

Classification: moderate delivery/acceptance adjustment. A new identity delegation mechanism, if demonstrated necessary, is a separate architecture/security decision—not implicitly approved by this proposal.

Timeline impact: no new calendar commitment. User has ended goal execution. Resume only on explicit instruction, retaining bounded runtime budgets and existing evidence rather than restarting completed engineering.

## 4. Detailed proposed edits — NOT APPLIED

### CC-01 — Native goal and completion contract

OLD outcome (archived goal):
> Sabir can open and sign in to a working protected Allura beta. This beta milestone is separate from final independent product acceptance and closure of Stories 6.5/9.4.

NEW proposed outcome:
> Make the approved Allura beta usable for internal testing by Sabir, Gabe and Sam through private Faith Meats Cloudflare access. Verify the intended Gilliam/Hermes, ChatGPT Desktop and work-laptop Claude Desktop connections against the explicitly identified backend/build and current scoped authority. Verify the intended SSH deployment path separately. Preserve current services/data and keep beta availability distinct from final product acceptance.

NEW proposed verification:
- Identify legacy service, original beta and exact fresh candidate separately; attach each client result to the actual runtime and protocol revision.
- Verify deployment origin and actual SSH controller/target without overwriting keys, assuming historical IPs or broadening host access.
- Verify each named client with its supported authentication method, actual initialization/tool discovery, scoped read and a named durable capture/receipt read-back where authorized and supported. Do not accept a read-only client as proof of write support; disclose any client-plan/platform limit and obtain scope disposition if it prevents a required outcome.
- Demonstrate current identity/workspace authorization, foreign/anonymous/expired/revoked denial, and independent human promotion separation. Use bounded test records only with approved data scope.
- Bind team onboarding to real identities and explicit grants. Faith Meats email membership alone does not grant application content access. Do not reuse Troy's credentials for another client/person.
- Preserve exact candidate/CI/artifact evidence and a verified rollback/cutover path; do not replace the legacy endpoint with incompatible fresh semantics without target-specific migration acceptance.
- Keep operator dashboard sign-in and real-human product tasks visible as separate remaining gates. They may be prerequisites for actions that truly require a human session; they do not block unrelated authorized engineering.

Constraints retained: no anonymous exposure, fabricated identity/assertion, production DevAuth, credential sharing, unapproved source-history publication, destructive data change, scope fallback, semantic self-promotion or budget bypass. A changed source build requires its own exact-revision verification; do not reuse old hosted-green identity for new bytes.

Execution NOW: no replacement goal. The old goal is cleared at user request; this text is saved for a later explicitly authorized resumption.

### CC-02 — PRD §6: add internal-beta delivery clarification

OLD: §6 defines preparation order and later/separately gated scope, but does not name the concrete internal team/client rollout milestone.

NEW proposed insertion:
> Internal Faith Meats beta is a private deployment/use milestone for Sabir, Gabe and Sam using connected clients. Cloudflare protects remote application access; verified SSH is an operator deployment path. Existing ChatGPT Desktop, Claude Desktop and Hermes clients are integration targets, not authorization to build the deferred Allura desktop product. Routine authorized MCP use does not require general dashboard acceptance; actions requiring independent human authorization retain that requirement. This milestone does not close final core/operator acceptance or authorize public source-history publication.

Rationale: align delivery with already-existing §1/§1.3 intent. Preserve all FR/NFR IDs.

### CC-03 — Epic catalog: append rollout qualifier to Epic 6 and Epic 8

OLD 6.2:
> Inventory separately deployed consumers before compatibility decisions; implement and exercise packed SDK/CLI/MCP/API consumers, exact version/dependency guidance and first-use disclosures. Do not restore old runtime as a prerequisite.

NEW: retain that sentence and append:
> Internal team rollout additionally records actual Gilliam/Hermes, ChatGPT Desktop and Claude Desktop client versions, authentication capabilities, endpoint/backend identity, scoped positive/negative results and limitations. Packed local acceptance is preserved, not relabeled installed-client acceptance. A separate additive rollout specification owns these new checks.

OLD 8.3:
> Exercise real clients and platform secure stores, cross-tenant negatives, concurrency and credential-leak tests. Simulator/in-memory keystores cannot satisfy platform acceptance.

NEW: retain that sentence and append:
> Retain the accepted Linux platform boundary. For each external desktop client, verify its actual supported remote authentication/storage path instead of inferring Windows/macOS support from the Linux SDK or silently falling back to plaintext.

No status flip is proposed for completed local 6.2/8.3 work. Name the additive rollout spec only when implementation is authorized; do not invent a new completed story.

### CC-04 — Specs 6.5 and 9.4: append evidence reconciliation, not closure

OLD: unchecked release bullets combine hosted CI, deployment, human tasks and operational recovery; historical paragraphs still say a fresh hosted run is required.

NEW proposed append-only note:
> Later private hosted candidate receipts and isolated staging/rollback observations must be reconciled individually to exact source trees, artifacts and environments. Credit only the gates their evidence satisfies. Actual named-client team access is a distinct rollout witness; legacy service calls and synthetic humans cannot satisfy it. Real-human core journey and operator acceptance remain open, and status remains in-progress. Dashboard-specific tasks stay under 9.4; no security prerequisite is removed from a client flow that actually depends on human authentication.

Rationale: do not rerun completed work merely because old prose is stale, and do not conflate successful CI/staging with independent product acceptance.

### CC-05 — Architecture and operator handoff

OLD diagram: `Client[Agent / API / CLI / optional UI] → Authenticated transport → Server-resolved scope`.

NEW proposed annotation (retain service/storage structure):
> Gilliam/Hermes, ChatGPT Desktop and Claude Desktop enter through the approved Cloudflare-protected application boundary. Verify transport-specific OAuth/service/device behavior and explicit stable principal/workspace mapping before invoking the same governed services. SSH from the verified deployment controller reaches the server management plane only and grants no MCP content authority. Preserve separate human-review flows; no arbitrary token translation or email auto-linking.

Add a connection matrix to the future rollout runbook with client/version, OS if relevant, exact endpoint/build, actor, tenant/workspace, auth mechanism, read/capture capability, positive/negative witness and rollback. Unknown cells must remain unknown. No brand/layout/mockup changes are proposed.

## 5. Implementation handoff — dormant until approval and resume

- Sabir: approves the full proposed edits and decides when to resume; completes genuine consent/sign-in where required. No further topology interview is needed to retain his stated setup.
- Troy: owns evidence reconciliation, compatibility/client inventory, scoped implementation coordination and truthful reporting. Discover retrievable configuration before asking Sabir for technical details.
- Gilliam: intended desktop-side deployment/client verification partner, subject to verified reachability and actual authorization. This document is not a claim Gilliam received a message or ran a command.
- Gabe and Sam: named internal participants; verify actual identities/grants and their intended client use before claiming onboarding. Their app choices are not invented.
- Existing canonical development owner: one writer for any later application changes, using installed BMAD build, TDD/direct self-checks and exact-revision tests. No code work is started by this proposal.

Suggested sequence after approval/resume: reconcile candidate/legacy identities and installed clients → establish compatible auth and scoped onboarding contract → verify deployment access → implement only demonstrated gaps → run actual named-client acceptance and denial tests → perform separately authorized cutover with read-back/rollback → report remaining 6.5/9.4 product gates honestly.

Do not start SSH installation, generate keys, change Cloudflare callbacks/policies/routes, mint credentials, alter databases, configure other profiles, resume agents, commit or push under this stopped task.

## 6. Checklist disposition

| Check | Disposition |
|---|---|
| 1.1 triggering story | Done: delivery boundary across 6.2/6.5, 8.3 and 9.4; trigger is Sabir's clarified audience/clients |
| 1.2 core problem | Done: delivery-intent misunderstanding and client-specific acceptance gap |
| 1.3 evidence | Done: archived goal, user statements, scoped MCP witness, Access inventory, local SSH observations and current contracts |
| 2.1 current epic | Done: Epic 6 remains viable with additive installed-client acceptance |
| 2.2 epic changes | Done: qualifiers/addendum proposed; no epic removal/renumbering |
| 2.3 remaining epics | Done: dependencies mapped above; 7/10/11 unchanged, 12–14 deferred |
| 2.4 invalidation/new epics | Done: none justified; auth design amendment only if needed |
| 2.5 priorities | Done: client rollout before general dashboard acceptance, retaining genuine auth prerequisites |
| 3.1 PRD | Done: already MCP-first; delivery clarification only |
| 3.2 architecture | Done: identity separation and origin/client compatibility gate retained |
| 3.3 UX | Done: connection-state disclosure; no approved visual changes |
| 3.4 other artifacts | Done: goal, evidence reconciliation, client/runbook/deployment matrix affected |
| 4.1 direct adjustment | Viable: recommended; medium integration effort and security-sensitive boundaries |
| 4.2 rollback | Not recommended: no evidence completed features should be discarded |
| 4.3 MVP review | Not needed: retain core scope and security invariants |
| 4.4 selection | Done: direct delivery/acceptance adjustment |
| 5.1–5.5 proposal components | Done: issue, impact, recommendation, exact edits and dormant role handoff above |
| 6.1 checklist review | Done: unfinished approvals/verification are explicit |
| 6.2 proposal accuracy | Done: existing source bytes preserved; no stale release claim converted to fact |
| 6.3 implementation approval | Action-needed later: user authorized CC and ending the goal, not execution of these detailed edits |
| 6.4 sprint-status.yaml | N/A: repository forbids a competing tracker; no file created or live work status asserted |
| 6.5 handoff | Prepared for review, not dispatched; user stop remains controlling |

## Inputs and validation boundary

Read current PRD, full epic catalog, architecture, authority-v1, actual 6.2/6.5/8.3/9.4 specs, operator surface contract, CC skill/checklist and repository adapter. No root AGENTS.md or planning *ux* file was found; the referenced approved operator contract supplies relevant UX context. Resolver output confirms English, current planning path and empty activation/on_complete additions. Prescribed uv resolvers were executed successfully; earlier plain-Python discovery is not the final resolver receipt.

Pre-edit checkout was clean at the baseline SHA. The validation receipt compares all pre-existing tracked-file hashes and records the added proposal only. No application test suite is rerun because no application code/configuration changed; document consistency/preservation checks are not product acceptance. Existing private reports are read as dated evidence, not refreshed live claims. No Allura operational-status transition, semantic promotion or database write is made by this CC.
