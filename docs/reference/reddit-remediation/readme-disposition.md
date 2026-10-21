# README disposition and copy receipt

AI-assisted review, 2026-10-20. Owner: Ogilvy; independent production QA remains open. Original inventory: all 29 tracked README.md documents plus BENCHMARK-README.md, at base `28d90e843` with existing working edits. The inventory is complete; remediation is not equivalent to inventory completion.

The [Kotler brief](brief.md) and [Aaker strategy boundary](strategy-receipt.md) support task-specific factual copy and the existing memory-layer identity. This sweep does not assert a new strategy lock or market-positioning approval. Shared setup is maintained in [Getting started](../../user-guide/getting-started.md); code and tests have separate owners.

## Disposition of every tracked README

| Document | Disposition | Observed basis / resulting action |
|---|---|---|
| `.claude/README.md` | Corrected by main runtime-document owner | Now identifies the Claude adapter surface, links canonical local roles and shared first use, and states PostgreSQL/RuVector. Official OpenCode Context7 instruction/permission distinction checked before factual documentation changes; no runtime config changed. |
| `.claude/skills/context7/README.md` | Retain upstream skill documentation | Byte-identical to the OpenCode mirror. Documents library lookup workflow, not Allura product onboarding. No marketing rewrite or command change performed. |
| `.opencode/README.md` | Corrected by main runtime-document owner | OAC directory map retained; backend description corrected and shared first-use task linked. No provider, permission, agent or config semantics changed. |
| `.opencode/command/openagents/README.md` | Keep archived | Explicit ARCHIVED status and instruction not to use nested legacy commands as live surface. Historical purpose is already clear. |
| `.opencode/skills/context7/README.md` | Retain upstream skill documentation | Library-lookup skill workflow mirror; preserved to avoid altering skill invocation semantics during a copy sweep. |
| `README.md` | Separate owner: root entry revision | Main owner handles primary promise, one action, responsibility split and current limits. Human comprehension and publication are separate checks. |
| `_bmad/bmm/planning/profiles/README.md` | Reframed as historical exports by main | Unsupported unrestricted-system, automatic-approval and unauthenticated-onboarding recipes withdrawn. YAML exports preserved unchanged; current authenticated scope and shared guide replace operational instructions. |
| `_bmad/bmm/v6-shims/README.md` | Keep compatibility documentation | Names deprecated skill IDs and forwarding/retained behavior. Upstream compatibility purpose; no product-entry copy is needed. |
| `_bmad/core/v6-shims/README.md` | Keep compatibility documentation | Lists legacy review-ID forwarders and removal expectations. Retained rather than rewriting upstream promises. |
| `docs/archive/allura/superpowers/README.md` | Keep archived | Dated 2026-08-28 and explicitly non-authoritative. Preserve workflow lineage. |
| `docs/design/command-center/README.md` | Rewrite factual handoff | Removed assumed file-open intent, pixel-perfect mandate and prohibition on rendering; identifies historical prototype, exact approval dependency and current design references. |
| `docs/plugins/bumblebee/README.md` | Reframe; retain specialist history | Added operator task/next step and optional-module boundary. Original upstream attribution, implementation detail and historical counts preserved inside a deliberate details section. |
| `docs/portfolio/allura-agentic-framework-harness/README.md` | Rewrite entry path | Removed three screenshots and six infographic panels from the default reading path; one synthetic walkthrough action plus task-specific evidence links. |
| `docs/portfolio/allura-agentic-framework-harness/evidence-infographics/README.md` | Rewrite collection purpose | Optional engineering illustrations with SVG/PNG/alt-text references; no live-view, universal-control or certification implication. |
| `docs/portfolio/allura-agentic-framework-harness/interactive-demo/README.md` | Rewrite specimen task | One synthetic review task, clear boundary from real memory setup, actual source/evidence links. Removed external deploy recipe and unsupported current-host behavior claims. |
| `docs/reference/persona-rollout-20261018/README.md` | Keep dated release evidence | Records pinned source commits, checks, handoff and limitations from a specific release. Not product onboarding; preserve historical receipt. |
| `examples/controlled-research-agent/README.md` | Rewrite as scenario reference | Fixture identities/tool responses and expected outcomes separated from observed behavior. All three attempted cases failed before scenario completion on the unavailable PostgreSQL connection. |
| `examples/engineering-review-agent/README.md` | Rewrite as scenario reference | A declared approval breakpoint is not an observed human decision. Maintained CLI link, shared setup pointer, expected fixture cases and actual failed execution state. |
| `examples/quickstart/README.md` | Separate owner: technical first use | Woz owns SDK identity/search correction, maintained example and real two-session runner. This copy owner links to that maintained guide instead of duplicating it. |
| `examples/regulated-document-quality/README.md` | Rewrite as scenario reference | Synthetic document/approval fixtures kept distinct from customer deployment, real human promotion and compliance evidence. Failed runner attempts recorded. |
| `packages/mcp-server/README.md` | Rewrite scaffold boundary | Registry and scope filtering are source-backed; no claim that resolveInjectedScope authenticates callers. Missing hosted-design link replaced by source and current architecture. |
| `packages/rbac/README.md` | Rewrite helper boundary | Explains canApprove is role/scope logic rather than proof of human identity or full runtime authorization; replaced missing hosted-spec link. |
| `packages/ruvector-adapter/README.md` | Rewrite scaffold boundary | Optional disabled scaffold separated from the production graph adapter; source functions, limits and attribution linked. |
| `packages/sdk/README.md` | Rewrite developer entry | Removed nonexistent token config property, incomplete laneArgs sample, npm instruction and broad package guarantees. Links current authToken/types, maintained quickstart and source-specific operations. |
| `packages/types/README.md` | Rewrite type/runtime distinction | Type shape and group format do not authenticate or enforce tenant/workspace isolation. Source and current data dictionary replace missing hosted-spec link. |
| `src/__benchmarks__/BENCHMARK-README.md` | Correct measurement and authority claims | Score threshold now classified separately from human approval. Current fixed benchmark credential contract replaces invented run tenants; event-purge advice removed. Suite not run. |
| `src/lib/graph-adapter/vendor/README.md` | Keep provenance; flag verification gap | Workstation-gated native addon doc explicitly contains placeholder SHA and future hash verification. It is not proof of a verified binary; preserve vendor/build scope and opt-in status. |
| `src/lib/session/README.md` | Reframe; retain historical design | Current maintainer task/source links precede original long design, retained under a historical details label. Removed six-month reliability guarantee from active opening; retired backend/port recipes not recommended. |
| `tests/fixtures/docs-sample/docs/roninmemory/README.md` | Keep test fixture | Explicit snapshot-parser fixture; legacy name is fixture data, not an active tenant recommendation. Altering it would change the test corpus. |
| `tests/load/README.md` | Rewrite as blocked evaluation source | Performance figures are targets, no current measurements. Records hardcoded scope and runner token-printing limitation; removes ready-to-copy unsafe production setup recipe. Load test not run. |

## Observed scenario checks

The CLI source defaults to simulated tool responses, but the process still requires backing-service persistence. The nine cases below were invoked from the repository root with `bun run scripts/harness.ts <scenario>`. Each exited 1 with `ECONNREFUSED 127.0.0.1:5432` before a scenario result or receipt. This is an infrastructure/runner failure, not the expected policy-denial result of a negative scenario. No database configuration, credentials, tenant, runtime or source was changed to work around it.

| Scenario | Fixture expects | Observed |
|---|---|---|
| `examples/controlled-research-agent/scenarios/prompt-injection.json` | `failed` | Runner exit 1; no scenario outcome |
| `examples/controlled-research-agent/scenarios/recovery.json` | `completed` | Runner exit 1; no scenario outcome |
| `examples/controlled-research-agent/scenarios/success.json` | `completed` | Runner exit 1; no scenario outcome |
| `examples/engineering-review-agent/scenarios/policy-denial.json` | `failed` | Runner exit 1; no scenario outcome |
| `examples/engineering-review-agent/scenarios/recovery.json` | `completed` | Runner exit 1; no scenario outcome |
| `examples/engineering-review-agent/scenarios/success.json` | `completed` | Runner exit 1; no scenario outcome |
| `examples/regulated-document-quality/scenarios/cross-tenant-denial.json` | `failed` | Runner exit 1; no scenario outcome |
| `examples/regulated-document-quality/scenarios/recovery.json` | `completed` | Runner exit 1; no scenario outcome |
| `examples/regulated-document-quality/scenarios/success.json` | `completed` | Runner exit 1; no scenario outcome |

Local scenario commands can emit receipt files on successful runs; none was produced in these attempts. The initial attempt from a temporary directory first failed to locate the cwd-relative schema. Rerunning from the documented repository root reached the distinct PostgreSQL connection failure above. Neither attempt proves an application or human-review success. No benchmark or k6 workload was run.

## Validation and limits

- All local link targets in the sixteen changed READMEs and this receipt were checked for existence; anchors and external published state require separate checks.
- Whitespace was checked only for owned changed files, preserving unrelated working changes.
- Runtime/configuration, upstream skill, compatibility, archive, vendor and fixture documents were reviewed but not rewritten outside the copy task's authority.
- Existing historical session/Bumblebee detail remains visible on deliberate expansion; its older paths and claims are not reinstated as current acceptance criteria.
- Human comprehension, five-person task success, actual source/review state in a later session, clean install, independent QA and publication remain open.

A task-focused entry does not prove an easier product. [The study kit](usability-study.md) and [requirements matrix](../../allura/REQUIREMENTS-MATRIX.md) define the separate evidence needed.

## Outcome trace

Governed Brain outcome `bf3f4b80-00b0-4f4d-a59b-64adcc8917aa` was written and read back in `allura-system` at `2026-10-20T22:27:40.298Z`. The add receipt reports episodic storage and pending review; no human approval or semantic promotion was requested.

## Main-owner integration refresh

After Ogilvy's bounded sweep, the main owner corrected the three runtime/profile READMEs identified above. Their current text was re-read: Claude now identifies its adapter role and PostgreSQL/RuVector; OpenCode retains its OAC map with the backend corrected; the BMAD profile README retains historical exports while withdrawing unsupported operational recipes. No runtime settings, YAML profile exports or permissions changed.

| Additional current surface | Producer / disposition | Evidence boundary |
|---|---|---|
| `docs/readme/first-use/README.md` | New educational collection README, produced by Glaser; task-specific choices and text alternatives | Independent [Munari review](visual-qa.md) passes for scoped educational draft readiness only. It does not establish production publication approval, live first use or human comprehension. |

Current checked surface coverage is **31 documents: the original 30 plus the new explainer README**. Of the original 30, **21 are modified and 9 retained** in the current working tree; Ogilvy authored 16 of those revisions and the main/technical owners authored the others. These are inventory/change counts, not user-test pass rates. Root, quickstart and shared-guide changes retain their separate implementation/evidence responsibilities.

## Connected-agent guide integration

Following Sabir's steering that the existing connection is `mcp.faithmeats.org`, the shared [first-use guide](../../user-guide/getting-started.md) now starts with the Allura tools already available to the agent. It gives a short save instruction, asks the reader to retain the returned ID, and provides a fresh-session search instruction in the same authorized project scope. Cloning, supplying a developer token and the explicit two-session SDK/runner check are behind a deliberate developer-reference expansion. The hostname is not a tenant selector or authorization grant.

The [configured connector evidence](connector-evidence.json) establishes a successful save and exact-ID fetch. Both include-evidence searches missed that saved record. The guide therefore calls this a testable journey, not a verified later-session search, and labels exact fetch as reconciliation rather than search success. An omitted review state remains unknown; no human approval, distinct transport session or clean installation is inferred. No connection, credential, server, source code, configuration or infrastructure changes were made for this editorial integration.


Connected-agent guide integration outcome `069da703-9a92-4b80-98fc-e498712d1608` was written and read back in `allura-system`. The add tool reported `stored: both`; read-back reported semantic storage attributed to `auto-curator`. No promotion was requested by the agent, and this observed storage label does not establish an independent human approval. The editorial work makes no approval claim from it. The two integration documents passed 13 local-target existence checks and owned whitespace checks.
