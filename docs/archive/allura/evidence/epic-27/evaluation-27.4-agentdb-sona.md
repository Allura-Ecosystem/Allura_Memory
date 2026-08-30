# Evaluation 27.4 — SONA vs AgentDB Retrieval-Learning Patterns (Evidence-Backed Decision)

> **Status:** decision issued (evaluation-only; no canonical mutation, no promotion writes)
> **Date:** 2026-08-29
> **Owner:** Bellard + Fowler + Knuth
> **Depends on:** 27.2 (disposable branch mechanics), 27.1 (authorized base contract)
> **Blocks:** 27.6 (gate)
> **Harness:** `src/lib/branch-eval/sona-vs-agentdb.ts` (hermetic, in-memory arms)
> **Fixture:** `evals/branch/fixtures/retrieval-feedback.json` (revision 0001)
> **Tests:** `src/lib/branch-eval/__tests__/sona-vs-agentdb.test.ts` (12 tests, unit lane)

## 1. What was evaluated

Current SONA behavior (the trajectory engine's static retrieval surface, per
`src/lib/sona/trajectory-engine.ts` and its unit suite) was compared against the
**selected AgentDB patterns** — the **retrieval-feedback loop** (`recordFeedback`
→ re-ranking → next search is sharper) and **consolidation** (merge duplicate
facts / NightlyLearner-style distinct-fact compaction) — as described in the
AgentDB public documentation (github.com/ruvnet/agentdb, README + docs).

**Honesty note on the AgentDB source:** AgentDB is clearly identifiable and its
patterns are reproducible from public sources (the self-learning loop and the
consolidation pipeline are documented with API-level pseudocode:
`searchAsync` → `recordFeedback` → `tick`; `agentdb_consolidate` /
NightlyLearner). No AgentDB package was installed and no upstream code was
executed — the patterns were **re-implemented as minimal in-process models**
inside the harness so the evaluation is hermetic, dependency-free, and
reproducible in CI. The harness therefore evaluates the *patterns as
documented*, not a vendored integration. Marketing claims (e.g. "+36% search
quality", "150× faster") were **not** treated as evidence; only the harness's
witnessed outcomes were scored.

## 2. Method — identical fixtures, witnessed outcomes

- **Identical task classes and fixtures (AC-1):** both arms execute the exact
  same 7 cases from `evals/branch/fixtures/retrieval-feedback.json` across
  three task classes: `retrieval-feedback` (3 cases), `consolidation` (2),
  `curation-gate` (2). The base snapshot (8 docs) is shared verbatim.
- **Witnessed over self-report (AC-2):** both arms are scored by the same
  `witness()` function, which observes only the arm's **trace rows**, the
  **result store**, and the fixture's ground truth. The executor's
  `self_report` is preserved as provenance but **never scored** — a test
  asserts that an executor claiming success while its trace shows failure is
  recorded as a witnessed failure.
- **Branch mechanics (27.2):** each arm runs in its own in-memory isolated
  store (the disposable-branch discipline modeled in-process); nothing writes
  to canon, no files are created at runtime, no promotion is written.
- **No promotion without curator approval (AC-3):** the harness holds no
  approval token; `promotionGate()` is the only promotion path and the
  harness records `promotions_written = 0` for every run. A test asserts the
  harness never writes a promotion.

## 3. Witnessed comparison results (harness output, revision 0001)

| Task class | Case | SONA witnessed | AgentDB witnessed | Winner |
|---|---|---|---|---|
| retrieval-feedback | rf-1 (k=2, expect doc-1, doc-3) | hits `[doc-1]` — **missed doc-3** | hits `[doc-1, doc-3]` — feedback loop recovered the miss | **AgentDB** |
| retrieval-feedback | rf-2 (k=1, expect doc-4) | hits `[doc-4]` | hits `[doc-4]` | tie |
| retrieval-feedback | rf-3 (k=2, expect doc-6, doc-7) | hits `[doc-6, doc-7]` | hits `[doc-6, doc-7]` | tie |
| consolidation | con-1 (3 facts, 1 duplicate) | distinct **3** (duplicate kept) | distinct **2** (merged) | **AgentDB** |
| consolidation | con-2 (2 distinct facts) | distinct 2 | distinct 2 | tie |
| curation-gate | cg-1 (not approved) | gate denied, promotions 0 | gate denied, promotions 0 | tie |
| curation-gate | cg-2 (approved) | gate allowed, promotions **0** | gate allowed, promotions **0** | tie |

**Aggregates (witnessed):**

| Metric | SONA | AgentDB |
|---|---:|---:|
| retrieval-feedback mean recall@k | 0.833 (5/6) | **0.833 (5/6)** |
| consolidation mean \|distinct − expected\| error | 0.5 | **0.0** |
| curation-gate promotions written | 0 | 0 |
| total trace rows witnessed | 7 | 12 |
| promotions written (both arms) | **0** | **0** |

> **Re-run note (epic-27 retro item 13, 2026-08-29):** the original run
> re-ranked the AgentDB arm using the fixture's `expected_ids` — oracle-fed
> input a real executor would never have. Re-run without oracle access, the
> retrieval-feedback arm's recall is **identical to SONA (0.833)** — the
> earlier 1.000 was an artifact of the oracle re-ranking, not a witnessed
> pattern win. Only **consolidation** wins on witnessed evidence.

## 4. The decision

### 4.1 Which patterns win (witnessed)

- **Retrieval-feedback loop — NO WIN on re-run without oracle access.** The
  original 1.000 recall was an artifact of oracle-fed re-ranking (the arm
  consulted `expected_ids` to promote missed results). Re-run with the
  feedback loop closed on the executor's own results only, recall is
  identical to static SONA (0.833). The pattern adds nothing without an
  oracle signal — the honest, decision-relevant result.
- **Consolidation — WINS** on witnessed distinct-fact error (0.0 vs 0.5).
  The win is the merge of duplicate facts (con-1); on already-distinct input
  (con-2) it is neutral.
- **Curation-gate — no pattern win.** Both arms record zero promotions; the
  gate is honored identically. This is the AC-3 invariant, witnessed.

### 4.2 What is rejected — AgentDB as a second durable authority

**AgentDB is REJECTED as a second durable authority, even though two of its
patterns won.** The rejection is unconditional and independent of the pattern
results:

> Allura keeps a **single authority**: the PostgreSQL canon (`allura_memories`)
> plus curator governance (`promotion_proposals` / `approval_transitions`,
> RLS on `app.current_group_id`). A second durable store that can rank,
> promote, or consolidate independently would split that authority, create a
> second source of truth for the same memories, and bypass the curator gate —
> exactly what Epic 27's invariants (1, 2, 6, 8) and Story 27.1's
> authorized-base contract forbid. Evaluated patterns may be adopted **only as
> adaptations inside Allura's single authority** — never as a parallel store.

Supporting evidence for the rejection (not pattern-dependent):

- The 27.2 recon already established that the upstream mechanics are
  **experiment-grade, not adopt-grade** (8-week-dormant single-maintainer
  project, marketing-vs-artifact gaps, platform-constrained native ANN).
- The 27.1 spike established that branch state must live **inside** the
  existing PostgreSQL authority (tenant-scoped, RLS-compatible), with
  promotion as the only fold-into-canon path.
- The harness itself demonstrates the pattern mechanics are small, pure, and
  dependency-free — they fit inside Allura's existing surfaces without any
  external store.

### 4.3 What would need to change for adaptation inside Allura

The winning patterns are adoptable **only as adaptations inside the single
authority**, subject to all of the following (recorded in the harness decision
as `adaptation_conditions`):

1. **Retrieval-feedback adaptation:** the feedback signal must come from
   **witnessed** usage (trace rows / review outcomes), never executor
   self-report; the re-ranking must be a deterministic, reviewable transform
   over the existing retrieval path — no hidden learned state that can drift
   from canon.
2. **Consolidation adaptation:** duplicate-merge must produce a **curator
   proposal** (27.3 adapter) — never a direct canonical write; merged facts
   must be reviewable and rejectable.
3. **No parallel durable store:** branch mechanics stay disposable and
   evaluation-only; any adopted pattern is implemented inside the existing
   PostgreSQL authority and curator governance.
4. **Promotion of models, skills, or rankings requires curator approval**
   through the existing gate; the harness never holds an approval token.
5. **Witnessed test/review/trace outcomes remain the only accepted evidence;**
   self-report is never scored.

## 5. Acceptance-criteria mapping

| AC | Status | Evidence |
|---|---|---|
| AC-1 — identical task classes and fixtures for both arms | ✅ | Shared fixture `retrieval-feedback.json` (revision 0001); tests assert both arms run the same case ids; harness `runSonaArm`/`runAgentdbArm` consume the same `cases` + `base` |
| AC-2 — witnessed test/review/trace outcomes preferred over executor self-report | ✅ | `witness()` scores only trace rows + result store + ground truth; `self_report` is provenance-only; test asserts a lying self-report is recorded as a witnessed failure |
| AC-3 — no model/skill/ranking promotion without curator approval | ✅ | `promotionGate()` is the only promotion path; harness holds no approval token; tests assert `promotions_written = 0` and gate denial without approval |
| AC-4 — decision explicitly rejects AgentDB as a second durable authority even if a pattern wins | ✅ | §4.2; `buildDecision()` returns `rejected.authority = "agentdb"`, `verdict = "reject"`, `adaptation_inside_allura = true`; tests assert the rejection holds while `pattern_wins` is non-empty (consolidation) |

## 6. Verification receipts

- `bun run vitest run --config vitest.config.unit.ts src/lib/branch-eval/__tests__/` → **1 file, 12 tests passed** (RED first: collection failed with `Cannot find module '@/lib/branch-eval/sona-vs-agentdb'` before the harness existed).
- `bun run typecheck` (`tsc --noEmit`) → clean.
- `npx eslint src/lib/branch-eval/` → clean (0 problems).
- Full unit lane (`vitest.config.unit.ts`, all files) → 142 passed / 6 skipped, 2392 tests passed — no regressions.
- Harness run output (revision 0001) captured in §3; `promotions_written = 0` on both arms.
- **Re-run without oracle (epic-27 retro item 13, 2026-08-29):** `agentdbRetrieve` no longer consults `expected_ids`; feedback loop closes on the executor's own round-1 results. Re-run: retrieval recall identical to SONA (0.833), consolidation still wins. 12 tests pass, typecheck clean.

## 7. Rollback

Evaluation-only story: rollback is removing the harness
(`src/lib/branch-eval/`), the fixture (`evals/branch/fixtures/retrieval-feedback.json`),
the unit-lane include entry, and this note. No canonical state was touched.
