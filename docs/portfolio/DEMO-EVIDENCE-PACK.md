# Demo Evidence Pack — Agentic AI Framework and Harness

**Captured:** 2026-09-01 · **Stack:** local portfolio demo (`bun run portfolio:up`)
**Target role:** Principal Engineer, Agentic AI Framework and Harness

Every claim below was produced by running the system on this date. Raw output is
in `artifacts/portfolio-demo/`; dashboard captures are in
`artifacts/dashboard-demo/` with a per-route `manifest.json`.

---

## How the job's requirements map to demonstrable artifacts

| Job requirement (from the posting) | Artifact | Status |
|---|---|---|
| "simulator harnesses and execution testbeds… repeatable testing, scenario simulation, policy validation" | `allura run` over 3 core scenarios + 3 reference integrations | **Demonstrated** |
| "deterministic workflow design… predictability, traceability" | `allura replay` → `Replay identical: true` | **Demonstrated** |
| "policy hooks and runtime interception points that enforce governance… and enterprise controls" | RLS `forced=true` on 4 tables; live denial captured | **Demonstrated** |
| "eval integration… benchmark design, regression detection" | `eval:portfolio --live` → **all 9 lanes measured** through a NOBYPASSRLS role, plus a falsifiability suite | **Demonstrated — see §7b** |
| "short-term and long-term context strategies, state persistence, retrieval interfaces" | Governed memory pipeline, PostgreSQL + graph backend | **Demonstrated** |
| "robust tool calling abstractions, interface contracts" | 14 MCP tools over streamable-HTTP; `tool_contract_validation` lane | **Demonstrated** |
| "SDK, API, and CLI design for enterprise adoption" | `allura` CLI (9 commands), `packages/sdk`, `packages/cli` | **Partial** — see Open Items |
| "highly regulated environments with strong SDLC and control requirements" | Fail-closed auth, append-only audit, HITL promotion gate | **Demonstrated** |

---

## 1. Fail-closed authentication (`01-failclosed-no-auth.log`)

The MCP gateway **refuses to start** with no authentication configured:

```
PrincipalAuthError: No MCP authentication configured.
reasonCode: "CONFIG_MISSING"   httpStatus: 500
  at resolveHttpAuthConfig (src/lib/auth/mcp-authenticator.ts:201)
```

This is the designed behavior, not a failure: production cannot boot anonymously.
Booting with an explicit dev-local principal yields
`auth_enabled: true, auth_mode: "dev_local"` with rate limiting active.

**Why it matters for a bank:** the control cannot be skipped by omission. The
common failure mode — "auth is disabled when the token env var is unset" — was a
real defect in this codebase and was removed (Story 24.2).

## 2. Environment health gate (`02-doctor-green.txt`)

```
✅ Runtime (Bun): v24.3.0
✅ PostgreSQL: 16.15
✅ Migrations dir: ok
✅ MCP gateway: status=healthy auth=true
```

`allura doctor` exits non-zero if any check fails.

## 3. Database-enforced tenant isolation (`03-rls-enforcement.txt`, `04-rls-denial-proof.txt`)

Row-Level Security is enabled **and forced** — meaning it applies even to the
table owner, which is the difference between a real control and a decorative one:

| Table | RLS enabled | RLS **forced** |
|---|---|---|
| `events` | true | **true** |
| `allura_memories` | true | **true** |
| `canonical_proposals` | true | **true** |
| `audit_documents` | true | **true** |

Two-layer policy on `events`: a PERMISSIVE `tenant_isolation_policy` plus a
RESTRICTIVE `workspace_scope_restrictive_policy`.

**Live denial, captured from the PostgreSQL server log** — a `memory_add` issued
through the gateway without proper workspace scope was refused by the database:

```
ERROR: new row violates row-level security policy
       "workspace_scope_restrictive_policy" for table "events"
```

This is the strongest artifact in the pack: isolation is enforced by the
database, so an application-layer bug cannot silently defeat it.

## 4. Policy denial in the harness (`06-scenario-summary.txt`, `receipts/`)

Cross-tenant scenario, principal `viewer-1`, tenant `allura-test-tenant-a`:

```
status: failed
policy_decisions: [{ policy_id: "pol-001", decision: "deny", step: 1 }]
tool_calls:       [memory_search (step 0), memory_add (step 1)]
```

The receipt carries `scenario_digest`, `definition_revision`,
`config_fingerprint`, `checkpoint_transitions`, `side_effect_keys`, and
`evidence_hashes` — a tamper-evident record of what ran and what was decided.

## 5. Deterministic replay

```
allura replay tests/scenarios/governed-memory-success.yaml.json <receipt>
→ Status: completed
→ Replay identical: true
```

## 6. Reference integrations

Three domain agents each completed with receipts written:
`engineering-review-agent`, `controlled-research-agent`,
`regulated-document-quality`.

## 7. Evaluation lanes (`05-eval-lanes.txt`)

```
portfolio evaluation: PASS (9 metrics)
  retrieval_relevance_p@5       1     (threshold 0.7)   pass
  approved_only_recall          1     (threshold 0.85)  pass
  policy_violation_block_rate   1     (threshold 1)     pass
  cross_tenant_isolation        1     (threshold 1)     pass
  promotion_correctness         1     (threshold 1)     pass
  audit_completeness            1     (threshold 1)     pass
  deterministic_replay_match    1     (threshold 1)     pass
  tool_contract_validation      1     (threshold 1)     pass
  latency_p95_ms                5000  (threshold 5000)  pass
```

## 7b. Measured evaluation — all nine lanes (`09-eval-live-9-lanes.txt`)

Section 7 above is the **offline** suite: its executor validates that a case is
well formed and nothing more, so every well-formed case passes and each lane
scores 1.0 by construction. That proves the harness is wired. It measures
nothing.

`--live` runs the same nine lanes through real executors against PostgreSQL:

```
$ bun run eval:portfolio --live
Seeded 20 labeled retrieval documents.
portfolio evaluation: PASS (9 metrics, live)
  retrieval_relevance_p@5       1  (threshold 0.7)   pass [measured]
  approved_only_recall          1  (threshold 0.85)  pass [measured]
  policy_violation_block_rate   1  (threshold 1)     pass [measured]
  cross_tenant_isolation        1  (threshold 1)     pass [measured]
  promotion_correctness         1  (threshold 1)     pass [measured]
  audit_completeness            1  (threshold 1)     pass [measured]
  deterministic_replay_match    1  (threshold 1)     pass [measured]
  tool_contract_validation      1  (threshold 1)     pass [measured]
  latency_p95_ms                7  (threshold 5000)  pass [measured]
```

**Three things make this evidence rather than assertion:**

**1. `latency_p95_ms` moves.** It read `5000` under the offline executor —
exactly its threshold — because the lane returned `Math.max()` of the *declared*
per-case budgets. Measured, it reads single-digit milliseconds and **varies run
to run** (8 on one run, 7 on the next). A fixture cannot do that.

**2. The connection cannot bypass the controls** (`11-app-role-nobypassrls.txt`):

```
  rolname   | rolbypassrls | rolsuper
 allura     | t            | t
 allura_app | f            | f
```

Executors connect as `allura_app`, not the owner. Because RLS is FORCED (§3),
the evaluation path is subject to exactly the same tenant and workspace
isolation as production. An eval that ran as the owner would silently prove
nothing about isolation.

**3. The lanes can fail** (`10-falsifiability-suite.txt`):

```
$ bun x vitest run src/lib/evals/__tests__/live-executors.falsifiability.test.ts
Test Files  1 passed (1)
     Tests  5 passed (5)
```

A metric that cannot fail is not a metric. These tests feed each lane inputs
that *should* fail and assert that it reports failure. `--live` also fails
closed when the database is unreachable — it errors rather than reporting 1.0s.

**Honest limits.** Retrieval is lexical (`content_tsv` / `ts_rank_cd`); no
embedding service runs here, so the hybrid vector path is not exercised and no
claim is made about it. Corpora are synthetic and small — 20 documents, 6
queries for retrieval. Thresholds are met, not stress-tested at scale.

## 8. Governed operator dashboard (`artifacts/dashboard-demo/`)

7/7 routes HTTP 200, no redirects, **zero console or page errors**, per
`manifest.json`. The Curator "Command Center" is the one to show: a review queue
of scored proposals (91% mainstream, 87% adoption, 64% emerging), an evidence
panel with server reasoning and `event #80` provenance, and human decision
controls behind an explicit **RATIONALE REQUIRED** gate — approve, request more
evidence, or reject. Promotion is human-in-the-loop by construction.

---

## Open items — state these before you are asked

Credibility in this interview comes from knowing exactly where the seams are.

1. **Corpora are synthetic and small.** All nine lanes are now genuinely
   measured (§7b), which closes the original finding C5 from the 2026-08-22
   adversarial review and GitHub issue #91. What remains is scale: 20 documents
   and 6 retrieval queries, thresholds met rather than stress-tested, and
   lexical retrieval only. Say this before you are asked.

1b. **The deck carries no honesty qualifiers.** An audit of all ten slides found
   zero occurrences of "specimen", "synthetic", "illustrative", "fixture", or
   "proposed". It also makes no numeric claims at all — no percentages, no
   latency figures — so nothing in it is currently overclaimed. The risk is
   narration: if you present the Epic 25 mockup from this deck without saying
   "specimen", the deck will not say it for you. The mockup's own banner does
   ("Synthetic fixtures only — no live connection, authorization, decision,
   health, or production status is represented"); lead with it.
2. **Harness scenarios are fixture-backed.** `allura run` exercises the
   orchestration, policy, checkpoint, and receipt machinery deterministically —
   it does not drive live model calls. That is the correct design for a
   repeatable testbed, and worth saying out loud.
3. **Six remediation issues are open** (#89–#94) from that same review, covering
   24.4–24.9. Epic 24's own verdict is recorded as *accepted-with-open-items*.
   Owning this is stronger than claiming completion.
4. **No independent re-review was obtained** — the review names it a mandatory
   closure gate and records that two attempted independent passes failed to
   produce a verdict.
5. **`allura eval` measured the wrong thing until today.** It ran the eval
   runner's unit tests rather than the scored lanes. Fixed in this session.

## Defects found and fixed while producing this pack

Worth mentioning as evidence of how you work:

- `allura doctor` hardcoded `localhost:5432`, ignoring `POSTGRES_*` env vars, so
  step 3 of the documented demo failed against the stack `allura up` creates.
- `allura eval` invoked `vitest` against the eval-runner's unit tests instead of
  the scored evaluation suite — the demo script promised 9 lanes and the command
  delivered 12 unit-test results.
- `scripts/seed-test-proposal.sql` was broken three ways: text into a `uuid`
  column, text into a `bigint` `trace_ref` that is a foreign key into `events`,
  and an invalid `tier` value. It also never set `workspace_id`, so a proposal
  would not have appeared in the workspace-scoped review queue even if it had
  inserted.

## Reproduce

```bash
bun run portfolio:up
set -a; . ./.env.portfolio; set +a
export ALLURA_MCP_HTTP_PORT=5888 ALLURA_MCP_DEV_AUTH=true
bun run mcp:http &
bun packages/cli/src/index.ts doctor
bun packages/cli/src/index.ts run tests/scenarios/unauthorized-cross-tenant-access.yaml.json
bun packages/cli/src/index.ts eval
bun run dev &
bun run dashboard:browser

# the one measured lane, and the proof it can fail
# all nine lanes, measured, as the non-bypassing app role
bun run eval:portfolio --live
bun x vitest run src/lib/evals/__tests__/live-executors.falsifiability.test.ts
```

> Running `--live` seeds 20 labeled documents, so the dashboard Overview shows
> real memory counts rather than zero.
