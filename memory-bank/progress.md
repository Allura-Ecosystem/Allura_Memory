## 2026-05-17: Owner Map Reconciled From Notion

- Project: allura-memory
- Agent: brooks-architect
- Decision: B13 owner-map blocker closed locally from canonical Notion evidence

- Summary:
  - Fetched Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f`.
  - Verified its decision log records Sabir Asheed as accountable owner for all lanes.
  - Verified its content records Captain acknowledgment received 2026-05-11 04:40 EDT.
  - Reconciled `OWNERS.yaml` so every role has `assignee: Sabir Asheed` and `acknowledged: true`.
  - Updated `blocking_list.md`, `docs/goal.md`, `docs/plans/allura-memory-finish-plan.md`, and `docs/plans/phase0-evidence-index.md`.

- Evidence:
  - Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f`
  - Notion owner-map reconciliation comment `3631d9be-65b3-8127-b86f-001d4b6dc281`
  - Notion cash-tracker reconciliation comment `3631d9be-65b3-819e-8435-001d032bf418`
  - Allura Brain receipt `812f4150-3377-47c5-80bf-e99a8f1edcda`
  - `OWNERS.yaml`
  - `blocking_list.md`
  - `docs/plans/phase0-evidence-index.md`

- Remaining:
  - B04 cash tracker remains open. Notion cash tracker contract `35d1d9be-65b3-810e-b080-eddc7e036aee` exists, but its own source state is `SOURCE MISSING / NOT YET POPULATED IN NOTION`.

## 2026-05-17: Cash Tracker No-Claims Evidence Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: B04 remains open, but current source does not appear to fabricate cash tracker values

- Summary:
  - Verified the canonical Notion cash tracker contract exists but remains source-missing.
  - Searched app/source files for cash, runway, burn, balance, financial, finance, spend, forecast, and tracker claims.
  - Read the dashboard KPI component and `/allura` route implementation.
  - Found no current product surface rendering fabricated cash tracker values.
  - Added `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md`.

- Evidence:
  - `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md`
  - `src/app/(main)/dashboard/_components/live-kpis.tsx`
  - `src/app/(main)/dashboard/page.tsx`
  - `src/app/(main)/allura/page.tsx`
  - Notion comment `3631d9be-65b3-817d-b200-001d4e43d28d`
  - Allura Brain receipt `9a12f91a-cb4c-475c-9348-955bb2bea869`

- Remaining:
  - B04 still needs Captain/source owner to populate or link actual cash tracker data, or explicitly mark cash tracker out of scope for Phase 0.

## 2026-05-17: docs/goal.md Completion Audit Recorded

- Project: allura-memory
- Agent: brooks-architect
- Decision: NO-GO for active goal completion

- Summary:
  - Added `artifacts/docs-goal-completion-audit-2026-05-17.md`.
  - Mapped every explicit Phase 0 exit criterion in `docs/goal.md` to concrete evidence.
  - Verified that B04 cash tracker and final Phase 0 closeout remain unresolved.
  - Reconciled `docs/goal.md` Immediate Next Actions to remove stale completed work and list the B04-only closure route.
  - Recorded the NO-GO verdict to Notion and Allura Brain.

- Evidence:
  - `artifacts/docs-goal-completion-audit-2026-05-17.md`
  - Notion finish-plan comment `3631d9be-65b3-817f-bfcf-001d665ee0b9`
  - Allura Brain receipt `3569ae69-6cdf-41aa-887d-eac56ab18dd1`

- Remaining:
  - Captain/source owner must populate or link actual cash tracker data, or explicitly mark cash tracker out of scope for Phase 0.
  - After B04 is resolved, record final Phase 0 closeout in Notion and Allura Brain.

## 2026-05-17: B04 Decision Request Packet Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: B04 remains open; decision request packet is ready for Captain/source owner

- Summary:
  - Rechecked B04 Notion comments, the cash tracker source contract comments, Allura Brain, and local repo evidence.
  - Found no newer Captain/source-owner decision.
  - Added `artifacts/b04-cash-tracker-decision-request-2026-05-17.md` with the two valid closure paths and recommended out-of-scope wording.
  - Reconciled `docs/plans/allura-memory-finish-plan.md` execution order and pending-decision table to remove stale 2.1/CARD-2.4-E/review-debt/3100 route text.
  - Attached the decision request to the B04 Notion work item and finish plan.
  - Logged the decision request to Allura Brain.

- Evidence:
  - `artifacts/b04-cash-tracker-decision-request-2026-05-17.md`
  - B04 Notion comment `3631d9be-65b3-810f-b079-001db1fbc5ad`
  - Cash tracker source-contract Notion comment `3631d9be-65b3-8126-b8eb-001d518455ae`
  - Finish-plan Notion comment `3631d9be-65b3-8173-80cc-001d43715a67`
  - Allura Brain receipt `aaab1b53-6d1c-4f55-9ff1-85a7bd1a568d`

- Remaining:
  - Captain/source owner must choose: populate/link the actual canonical cash tracker source, or explicitly mark cash tracker out of scope for Phase 0.

## 2026-05-17: Phase 0 Final Closeout Template Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: Template prepared; final closeout remains invalid until B04 is resolved

- Summary:
  - Added `artifacts/phase0-final-closeout-template-2026-05-17.md`.
  - Linked the template from `docs/goal.md` final closeout row.
  - Updated the completion audit to name the template as the post-B04 closeout path.

- Evidence:
  - `artifacts/phase0-final-closeout-template-2026-05-17.md`
  - `docs/goal.md`
  - `artifacts/docs-goal-completion-audit-2026-05-17.md`

- Remaining:
  - Do not use the final closeout template until B04 is closed, waived, or deferred by Captain/source-owner decision.

## 2026-05-17: docs/goal.md Current Status Banner Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: Keep active goal visibly NO-GO until B04 is resolved

- Summary:
  - Added a top-level `Current Status` section to `docs/goal.md`.
  - The section states Phase 0 is NO-GO for final closeout and Phase 1 start.
  - The section points to the completion audit, B04 decision packet, and final-closeout template.

- Evidence:
  - `docs/goal.md`
  - `artifacts/docs-goal-completion-audit-2026-05-17.md`

- Remaining:
  - Captain/source owner must choose one B04 closure path before final closeout can be recorded.

## 2026-05-17: Finish Plan Current Status Banner Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: Keep finish plan visibly NO-GO until B04 is resolved

- Summary:
  - Added a top-level `Current Status` section to `docs/plans/allura-memory-finish-plan.md`.
  - Updated the finish-plan status header to `NO-GO pending B04 cash tracker decision`.
  - The section states Phase 0 is NO-GO for final closeout and Phase 1 start.
  - Clarified that B04 is the only open blocker while final Phase 0 closeout remains pending that decision.
  - The section names the two valid B04 closure paths and links the B04 decision packet plus final closeout template.

- Evidence:
  - `docs/plans/allura-memory-finish-plan.md`
  - `artifacts/docs-goal-completion-audit-2026-05-17.md`
  - Notion finish-plan comment `3631d9be-65b3-81ca-ab15-001d7666ca6f`
  - Allura Brain receipt `9ca73751-a8dd-4ef0-8560-f5529be46566`

- Remaining:
  - Captain/source owner must choose one B04 closure path before final closeout can be recorded.

## 2026-05-17: Navigator Current Gate Reconciled

- Project: allura-memory
- Agent: brooks-architect
- Decision: `_bmad/ALLURA-NAVIGATOR-WORKFLOW.md` now reflects the current Phase 0 gate

- Summary:
  - Replaced stale `/allura` brand gate wording that said the route must remain in Review until Ralph Loop passes.
  - Recorded that `/allura` direct evidence is verified and the nested Ralph runtime requirement is waived for Phase 0.
  - Preserved the narrow waiver boundary: it does not close B04, future `3100` cutover gates, or product evidence requirements.
  - Marked the historical Ralph pending section in `artifacts/allura-runtime-trust-evidence-2026-05-16.md` as superseded by the formal waiver.
  - Named B04 cash tracker scope as the active Phase 0 blocker.

- Evidence:
  - `_bmad/ALLURA-NAVIGATOR-WORKFLOW.md`
  - `artifacts/allura-runtime-trust-evidence-2026-05-16.md`
  - `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`
  - `artifacts/b04-cash-tracker-decision-request-2026-05-17.md`

- Remaining:
  - Captain/source owner must choose one B04 closure path before final closeout can be recorded.

## 2026-05-17: Historical Ralph Readiness Marked Non-Authoritative

- Project: allura-memory
- Agent: brooks-architect
- Decision: `ralph_ready_status.json` is historical `contract_unblock` readiness only

- Summary:
  - Added `non_authoritative_for_phase0: true` to `ralph_ready_status.json`.
  - Added a note that its B04/B05 PASS rows are not the current Phase 0 B04 cash tracker or B05 Memory Explorer blockers.
  - Validated the JSON with `python3 -m json.tool ralph_ready_status.json`.

- Evidence:
  - `ralph_ready_status.json`
  - `artifacts/docs-goal-completion-audit-2026-05-17.md`

- Remaining:
  - Current Phase 0 source of truth remains `blocking_list.md` plus `docs/goal.md`; B04 cash tracker remains open.

## 2026-05-17: CARD-2.4-E Approval Guard Evidence Advanced

- Project: allura-memory
- Agent: brooks-architect
- Decision: GO for B09 validation evidence; not closed until review/Notion evidence is attached

- Summary:
  - Restored missing `docs/goal.md` from the latest historical roadmap version because the active thread goal points to that artifact.
  - Ran `bun test src/lib/memory/__tests__/approval-audit.test.ts`; result: 16 pass, 0 fail.
  - Found `requireApprovalBeforePromotion` was only covered in its own module/tests and was not called by real promotion paths.
  - Added guard calls before Neo4j writes in both `processApprovedInsights` and `promoteSingleInsight`.
  - Review found the curator approve API and batch approve script also wrote to Neo4j before a canonical `memory_promotion_approved` event existed.
  - Added `logApprovalEvent` before `createInsight` in `POST /api/curator/approve` and `scripts/batch-approve-proposals.ts`.
  - Updated `scripts/e2e-validation-gate.ts` AC-05 to write and check `memory_promotion_approved` instead of legacy `proposal_approved`.
  - Added HITL policy coverage proving the approval guard appears before `promoteToNeo4j` in both promotion paths.
  - Attached evidence to the Notion CARD-2.4-E page as comment `3631d9be-65b3-817c-8101-001d266fa32e`.
  - Added Brooks-approved Pike/Fowler-style static review substitute at `artifacts/card-2-4-e-static-review-substitute-2026-05-17.md`.
  - Marked B09/CARD-2.4-E `DONE` in `blocking_list.md` for the local repo ledger; Notion remains authoritative for board state.

- Evidence:
  - `src/lib/memory/knowledge-promotion.ts` imports `requireApprovalBeforePromotion`, carries `proposal_id`, and calls the guard before Neo4j promotion.
  - `src/app/api/curator/approve/route.ts` and `scripts/batch-approve-proposals.ts` call `logApprovalEvent` before `createInsight`.
  - `src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts` covers guard ordering.
  - `artifacts/card-2-4-e-approval-guard-evidence-2026-05-17.md` records the review, fix, commands, and remaining gate.
  - Notion comment `3631d9be-65b3-817c-8101-001d266fa32e` on `CARD-2.4-E — Add targeted role/SoD/audit tests`.
  - `bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts`: 21 pass, 0 fail.
  - `bun run typecheck`: pass.
  - `bunx eslint src/lib/memory/knowledge-promotion.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts src/app/api/curator/approve/route.ts scripts/batch-approve-proposals.ts scripts/e2e-validation-gate.ts`: 0 errors; 5 residual warnings from pre-existing route debt and script ignore rules.

- Remaining:
  - Reconcile Notion board state for CARD-2.4-E if the board still shows it outside Done.
  - Continue Phase 0 blockers B01-B08.

## 2026-05-17: Phase 0 Evidence Index Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: B06 evidence-scatter blocker closed locally

- Summary:
  - Reconciled `blocking_list.md` with merged Phase 0 PR evidence from commit `999ce78d89580498f6db6685bbe743eb2e7334c8`.
  - Restored B01, B03, B05, and B07 statuses from the merged local ledger evidence.
  - Created `docs/plans/phase0-evidence-index.md` as the single repo-local evidence map for Phase 0 blockers.
  - Marked B06 `DONE` in `blocking_list.md`.

- Evidence:
  - `docs/plans/phase0-evidence-index.md`
  - `blocking_list.md`
  - PR #33 / commit `999ce78d89580498f6db6685bbe743eb2e7334c8`

- Remaining:
  - B04 needs Captain decision on cash tracker scope.

## 2026-05-17: /allura Ralph Runtime Waiver Added

- Project: allura-memory
- Agent: brooks-architect
- Decision: B02 and B08 waived locally for Ralph runtime only

- Summary:
  - Created `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`.
  - Waived Ralph Loop execution for `/allura` Phase 0 gates because nested runtime fails with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.
  - Preserved direct `/allura` product evidence: browser smoke, benchmark log, Pike/Fowler pass, Notion comments, and Brain receipt.
  - Attached waiver to Notion route parity card and split reachability card.
  - Marked B02 and B08 `WAIVED` in `blocking_list.md`.

- Evidence:
  - `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`
  - Notion comments `3631d9be-65b3-81e4-ad7c-001d58868149` and `3631d9be-65b3-81da-a709-001d7692d4ab`
  - `artifacts/allura-runtime-trust-evidence-2026-05-16.md`
  - `artifacts/allura-playwright-smoke.json`

- Remaining:
  - B04 needs Captain decision on cash tracker scope.

## 2026-05-17: Phase 0 Source-of-Truth Reconciliation Added

- Project: allura-memory
- Agents: brooks-architect + kotler council lens; Pike and Fowler review agents returned evidence
- Decision: NO-GO for broad closure; GO for small reversible slices

- Summary:
  - Recovered from party-mode freeze/abort: Scout task aborted, Pike and Fowler returned usable review evidence.
  - Pike found `/allura` interface and keyboard evidence largely sound, but blocked closure on Notion/evidence completeness and missing Ralph validation.
  - Fowler found the finish plan structurally coherent but drift-prone because current Phase 0 blocker IDs conflicted with older `contract_unblock` blocker history.
  - Added `Current Phase 0 Source of Truth — Reconciliation` to `docs/plans/allura-memory-finish-plan.md`.
  - Updated `blocking_list.md` to clarify that it now tracks Phase 0 finish blockers, not the old `contract_unblock` runtime gate.

- Evidence:
  - `docs/plans/allura-memory-finish-plan.md` now includes timestamped reconciliation table.
  - `blocking_list.md` now includes scope note plus B08/B09 for `/allura` evidence completeness and CARD-2.4-E validation gap.

- Next action:
  - Attach reconciliation note to the Notion finish-plan page.
  - Start smallest executable slice: CARD-2.4-E targeted audit test and promotion guard evidence.

## 2026-05-16: Allura Memory Finish Plan — Phase 0 Documentation Sync

- Project: allura-memory
- Agent: brooks-architect
- Decision: GO (Phase 0 documentation sync complete)

- Summary:
  - Created comprehensive finish plan at `docs/plans/allura-memory-finish-plan.md`.
  - Defined 12-outcome closure checklist with evidence requirements.
  - Documented 7 root causes of stall and explicit resolution paths.
  - Established research + governance source matrix (Allura Brain, RuVix, Notion, Tavily, Exa, Context7, local search).
  - Defined execution rule: every closure must include evidence sources receipt.
  - Deferred future boards (Faith Meats Operations, Lending Compliance) until Phase 0 closure.
  - Open-source sanitization rules: generic board engine + gitignored personal boards.
  - Renamed "Dad's thing" → "Lending Compliance Board".

- Evidence:
  - `docs/plans/allura-memory-finish-plan.md` created with full plan.
  - `memory-bank/progress.md` updated (this entry).
  - `blocking_list.md` updated with current blockers.

- Pending decisions:
  - 3100 target: MCP gateway, dashboard UI, or superseded?
  - Cash tracker: in-scope with source, or out-of-scope?

- Next action:
  - Create Notion page for finish plan.
  - Log planning decision to Allura Brain.
  - Begin Step 2: Close 2.1 Token Audit (IRIS Brand rerun).

## 2026-05-16: Contract-Unblock Unblock Run

- Project: allura-memory
- Agent: execution assistant (Ralph unblock run)
- Decision: NO_GO

- Summary:
  - Executed contract-hygiene unblock step for `contract_unblock` with strict gate shape.
  - Added canonical run contract artifact at `ralph/PROMPT_plan.md`.
  - Created `.opencode/config.json` aligned to canonical scope and required context/skills.
  - Updated `ralph_ready_status.json` and `blocking_list.md` to the exact runtime schema with B04/B05 treated as PASS, B03 as concrete, and one unresolved blocker remaining.

- Evidence:
  - active_notion_contract_scope set to `https://www.notion.so/ce13dc069ff347689fcc7cbe188232c8`.
  - `validation_commands`: `bun test src/lib/validation/group-id.test.ts` (pass noted in status artifact).
  - MCP discovery/activation pinned notion tooling via MCP_DOCKER was recorded as PASS in status artifact.

- Unresolved risks:
  - `B01` remains OPEN until run-time validator accepts one canonical plan binding and sibling plan-like artifacts are treated as non-authoritative without ambiguity.

- Next action:
  - Resolve `B01`, set `blocking_count = 0`, then switch `execution_go` to GO and run `./ralph/loop.sh`.

## 2026-05-16: Runtime model pinned to GPT-5.3 Codex Spark

- Scope: allura-memory / contract_unblock loop
- Decision: mandatory model selection update
- Evidence: `.opencode/config.json` updated to `model: "gpt-5.3-codex-spark"`
- Outcome: model binding for runtime contract now explicitly set to GPT-5.3 Codex Spark.

## 2026-05-16: B01 resolved (single canonical plan artifact)

- Agent: execution assistant (Ralph unblock run)
- Decision: READY_FOR_GO (post-validation)
- Result: `B01` closed.
  - Canonical plan bound to `ralph/PROMPT_plan.md`.
  - `.opencode/config.json` updated with `runtime_contract.canonical_plan_path = "ralph/PROMPT_plan.md"`, matching `canonical_plan_id` and concrete `active_notion_contract_scope`.
  - Legacy plan-like files (`ralph/IMPLEMENTATION_PLAN.md`, `ralph/PROMPT_build.md`, `ralph/PROMPT_ulw.md`) now explicitly carry `NON_AUTHORITATIVE_ONLY` guard.
- Gate output: `ralph_ready_status.json` now all PASS with `execution_go: GO`.

## 2026-04-22: Session Complete

- Project: allura-roninmemory
- Agent: brooks
- Summary: Started with Brain hydration and repo verification, then analyzed and partially advanced the pgvector/HNSW rollout for 4096d embeddings.
- Key changes:
  - Added guarded migration `docker/postgres-init/23-enable-4096d-hnsw.sql`
  - Updated `docker-compose.yml` Postgres image path after discovering `pgvector/pgvector:0.8.4-pg16` does not exist upstream
  - Updated `docker/postgres-init/16-ruvector-memories.sql` comments to match the staged HNSW strategy
  - Validated targeted RuVector tests passed
- Why:
  - To restore an indexed vector retrieval path for 4096-dimensional qwen3 embeddings without assuming unsupported pgvector image tags
- Final state:
  - Live Postgres was recreated on `pgvector/pgvector:pg16` and is healthy
  - HNSW restoration is not yet proven on the live DB
  - Allura Brain was unavailable at session end, so this file is the durable fallback record
- Important lesson:
  - Verify actual `vector` extension version before rollout and never assume new init scripts apply to an existing external volume

## 2026-04-22: Session Complete

- Project: allura-roninmemory
- Agent: brooks
- Summary: Completed documentation and orchestrator alignment for the new Team RAM memory model.
- Key changes:
  - Updated canonical architecture docs to remove the custom monolithic MCP runtime model
  - Updated primary and auxiliary skill docs to align on Brooks/Team RAM orchestration and packaged MCP server usage
  - Pruned noisy temporary summary files from `.opencode/skills/`
  - Updated `src/team-ram/orchestrator.ts` to enforce true staged execution
  - Added/updated orchestrator tests to verify memory-first execution order
- Why:
  - To establish one coherent runtime contract: `neo4j-memory` first, `database-server` second, and `neo4j-cypher` only when needed
- Final state:
  - Canonical docs, core skill docs, and auxiliary skill docs are aligned on the new architecture
  - Team RAM orchestrator now executes in staged order rather than parallel fan-out for mixed memory tasks
  - Remaining follow-up work is focused on legacy runtime/config drift and tightening routing intent inference
- Important lesson:
  - Plan order is not execution order; architecture only becomes real when the runtime contract enforces it

## 2026-04-25: Session Complete

- Project: allura-system / Allura Memory
- Agent: brooks-architect
- Summary: Recovered and validated the canonical MCP Streamable HTTP gateway path after memory tool and runtime drift investigation.
- Key changes:
  - Fixed `src/mcp/canonical-http-gateway.ts` by replacing reused stateless transport with stateful per-session transport management keyed by `Mcp-Session-Id`.
  - Fixed env loading in `env.mjs` and `src/mcp/canonical-tools/connection.ts` so runtime-injected env vars remain authoritative while `.env.local` can override `.env` only when variables are not already set.
  - Updated `docker-compose.yml` MCP/http-gateway secret handling to avoid interpolated secret overrides that bypass `env_file` precedence.
  - Updated `opencode.json` toward canonical HTTP gateway usage instead of local `npx tsx` stdio runtime drift.
  - Added `scripts/validate-env.sh` and updated `.env.example`.
- Why:
  - The governed memory path had multiple ingress surfaces; tool namespace availability did not prove end-to-end health. The canonical HTTP gateway needed real MCP initialize/tools protocol validation, not just `/ready` health.
- Validation:
  - Pruned Docker build cache after Docker reported no space left on device.
  - Rebuilt `mcp` and `http-gateway` containers successfully.
  - `bash scripts/brain-stack.sh wait-ready 120` passed.
  - `RUN_MCP_TESTS=true ALLURA_MCP_HTTP_URL="http://127.0.0.1:5888" bun vitest run src/__tests__/mcp-streamable-http.test.ts` passed: 12/12 tests.
  - `bun run typecheck` passed.
- Final state:
  - Canonical MCP Streamable HTTP gateway at `http://127.0.0.1:5888/mcp` is validated.
  - Chat-harness `allura-brain_memory_add` still fails with stale SASL/password behavior, indicating a separate ingress path remains drifted from the rebuilt canonical gateway.
  - Working tree has uncommitted changes pending review/commit.
- Important lesson:
  - Health probes are not protocol proofs. A castle gate may look sound from the road, yet still fail to lower the drawbridge; validate the actual client path.

## 2026-05-15: Ralph Readiness Blocked — contract_unblock

- Agent: execution assistant (Ralph unblock run)
- Project: allura-memory
- Decision: NO_GO

- Summary:
  - Performed strict plan scan, MCP discovery, and minimal smoke checks.
  - Group-id enforcement remains implemented and targeted tests passed.
  - Gate remains blocked due missing authoritative `PROMPT_plan*` artifact, missing `.opencode/config.json`, unresolved Notion scope input, missing Brain-tool execution path, and notion-server activation authorization failure.

- Evidence:
  - `mcp_find("notion")` returned `notion` and `notion-remote`.
  - `mcp__MCP_DOCKER__mcp_add("notion-remote", { activate: true })` failed with authorization request.
  - `bun test src/lib/validation/group-id.test.ts` passed (44 pass, 0 fail).
  - Notion probe using `mcp__codex_apps__notion._notion_get_teams` returned empty team arrays.

- Unresolved risks:
  - No single authoritative plan file resolved to drive gate-safe Ralph execution.
  - Source-of-truth drift (`.opencode/config.json` missing) may hide other compliance drift.
  - Brain memory search cannot be performed until required session/skill path is activated.
