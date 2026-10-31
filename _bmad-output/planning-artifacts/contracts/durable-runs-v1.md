# Story 12.1 adopted contract — bounded durable local runs

**Disposition: adopted detailed local design under delegated engineering authority; specified, not implemented or runtime-verified.** Canonical adoption baseline: `7f3b9065d30a78f8d4b20a17392cafd8bf9c02b4`, branch `local/beta-machine-only`, 2026-10-31. Source candidate: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-1-contract-candidate-2026-10-31.md`, SHA-256 `56adfdc304a5c6019d1079e521c174772863528e989d1db35e30031513b06897`, prepared against `0ff7f87ff4c600c24039d5276b7934538d914825`. Candidate preserved unchanged outside the repository; its historical freeze is released by the parent, not a current blocker.

Apply the [approved local all-14 amendment](../sprint-change-proposal-2026-10-31-all-14-local.md) and [controlling adapter](../../../guidelines/ALLURA-BMAD.md). Adoption evidence and the next bounded RED handoff are in [Story 12.1 specification](../../implementation-artifacts/spec-12-1-durable-run-contract.md). This is not story closure, a live-status ledger, an independent developer review or permission to bypass the active direct-build STOP. Tunnel work is excluded; no tunnel, remote MCP, credentials, services, grants or network infrastructure are touched. Allura live status remains unknown.


## 1. Controlling scope and source map

Paths below are relative to the canonical repository unless absolute. Citations `[Sx]` identify source paths and line ranges in the pre-adoption candidate snapshot, not historical implementations named inside them. Additive planning amendments shift those historical line numbers; file paths remain authoritative. Six executable anchors and the 001–024 migration inventory were reverified at adoption.

| Ref | Current source and relevant boundary |
|---|---|
| S1 | `/home/sabira/.hermes/profiles/troy/workspace/allura-all14-scope-decisions-2026-10-31.md:5–24`: local adoption of existing Epics 12–14; Allura PostgreSQL sole writable live-work-status authority; Notion planning only; Linux-first remote-connected shell, no assumed local runtime supervisor; historical compiler evidence freeze, released before adoption. |
| S2 | `guidelines/ALLURA-BMAD.md:19–23,29–91`: current source over stale reset labels, mapped missing inputs, security invariants, exact evidence, separate production authority. Older exclusions of 12–14 are superseded **only for local scope** by S1. |
| S3 | `_bmad-output/planning-artifacts/prds/prd-Allura_Memory-2026-10-25/prd.md:60–93,148–179`: FR-F3 run/policy/runtime separation outside Brain; FR-D1 stage truth; NFR isolation, integrity, reliability, redaction, reproducibility. The nested PRD is the input, not a nonexistent top-level PRD. |
| S4 | `_bmad-output/planning-artifacts/architecture.md:15–45,66–77,103–105`: governed service-owned PostgreSQL transactions, immutable evidence, current authority, no second status plane. Historical implementation-state prose is not a current inventory. |
| S5 | `_bmad-output/planning-artifacts/epics.md:166–194`: 12.1 use case/provenance/definitions; 12.2 durable journal/attempts/approval/continuation; 12.3 crash/parallel/cancel/checkpoint/drift/doctor/API; 13.1 retains detailed work-item conflict contracts; 14.1 retains secure connection/update/platform contracts. |
| S6 | `docs/allura/RISKS-AND-DECISIONS.md:316–369`; `docs/allura/BLUEPRINT.md:402–405`; `docs/allura/REQUIREMENTS-MATRIX.md:426–441`: AD-35/41, BP-F49–52. Former process-engine paths are historical, not reusable current source. |
| S7 | `_bmad-output/planning-artifacts/contracts/authority-v1.md:13–26,38–45,59–63`; `foundation/src/authority.ts:9–16,37–79`: roles, explicit human promotion, current resolution, machine ceilings. No run action exists in the current Action union. |
| S8 | `_bmad-output/planning-artifacts/contracts/persistence-v1.md:38–58`; `foundation/src/persistence.ts:6–26,29–67`: restricted role, checksummed ordered migration registry, scopedTransaction, authority locks/rechecks, local transaction context, honest SQL trust limit. |
| S9 | `foundation/migrations/001-authority.sql:13–97`; `foundation/migrations/021-client-authority.sql:28–109`; `foundation/migrations/024-selected-client.sql:1–35,49–69`: separate owner-linked, device and selected-only ceilings. Do not rewrite them to admit runs. |
| S10 | `foundation/src/gateway.ts:14–19,57–129`; `foundation/src/core-api.ts:24–29`: one bounded gateway, auth before body, mixed-identity rejection, CSRF, post-handler recheck, unknown on ambiguous failures. |
| S11 | `_bmad-output/implementation-artifacts/spec-6-1-operations.md:8–26`; `foundation/src/operations.ts:11–34`; `foundation/src/work-budget.ts:1–22`: redacted stage truth, existing admission/deadlines, no premature slot release, append-only observations. Historical pass counts are not new evidence. |
| S12 | `foundation/src/projection.ts:9–60`; `foundation/migrations/015-projection.sql:63–174`: operation-key replay, private guarded functions, claim fencing, write-started ambiguity and separate observations. Reuse patterns, not projection authority or external adapters. |
| S13 | `foundation/tests/lifecycle-fixture.ts:6–38`; `foundation/tests/persistence.test.ts:43–178`; `foundation/tests/decision-atomic.test.ts:15–66`; `foundation/tests/client-authority.test.ts:82–106`: real restricted app connections, genuine signed identities, rollback/termination, attributable database blocking. |
| S14 | `foundation/scripts/test.ts:6–230`; `foundation/src/ci-contract.ts:1–29`; `foundation/tests/ci-contract.test.ts:20–40`; `foundation/scripts/test-db.ts:4–76,360–370`: exact unit registry/JUnit/assertion floors, matching CI inventory, no selection overrides, owned disposable DB and required named cases. |
| S15 | `foundation/package.json:11–20`; `foundation/src/recovery.ts:18,34,50,72`; `foundation/scripts/pack-core.ts:13`; `foundation/tests/recovery.test.ts:35`; `foundation/tests/core-release.test.ts:81–95`: actual commands, dynamic pack/recovery inventories, two exact migration-count assertions. |
| S16 | `docs/design/command-center/operator-surface-contract.md:12–67`; `docs/allura/DESIGN-ALLURA.md:59,231`; S5:139–144: protected evidence-first UX; no new run screen is necessary for this slice. |
| S17 | `.agents/skills/bmad-architecture/SKILL.md:7–35`; `.agents/skills/bmad-architecture/references/headless.md`; `.agents/skills/bmad-spec/SKILL.md:7–9,65–126`; `_bmad/custom/bmad-architecture.toml`: brownfield invariants, assumptions, capability/success pairs and preservation review. The original source scout used these as methodology references, **not** completed vendor workflows; its one-file/no-execution boundary was historical. The present adoption executes installed Correct Course with actual resolvers under the current adapter, not architecture/spec workflows or extra reviewer/network/writeback ceremony. Missing old architecture/dictionary/runtime references use S2's mappings; they were not restored. |
| S18 | `foundation/migrations/009-index.sql:31,43`; `foundation/migrations/023-selected-version-sharing.sql:90`: existing database SHA-256 and normalized JSON digest patterns; no new crypto dependency needed. |

**Settled user choices:** S1's local all14 adoption, sole PostgreSQL live-status authority, Notion planning only, Linux-first connection to the existing server. These do not need another board/OS question. No Story 13 board mechanics, desktop framework, update service, live credentials, deployment, external transfer or semantic promotion follows.

**Adopted ordinary technical defaults:** everything newly named below (DTOs, SQL tables/functions, human-admin-only v1 admission, linear definition, exact budgets, retry schedule, API names and implementation slice). They are adopted by this canonical Brooks/Woz documentation pass under the delegated design authority in the controlling adapter, not presented as Sabir's historical choices or quotations. No new vendor runtime, package, queue, service or second database is selected. The first slice uses the existing Bun/TypeScript/PostgreSQL stack [S8–S15].

## 2. Five-field kernel and concrete unmet use case

**Why:** An operator must be able to prepare an evidence handoff, stop for an explicit human decision, lose the requesting process, and continue without recreating already committed evidence or inventing completion. Capture receipts, memory decisions and projection claims exist, but none is a generic durable run/checkpoint/approval continuation service [S5,S8,S11,S12]. A retrieval result or a BMAD compiler receipt does not satisfy this use case [S3,S5].

**Capabilities and success:**

- **R12-C1 — Pinned local run:** start one same-workspace run against an immutable definition/input; a same-key retry returns the original start receipt; changed input conflicts without writes.
- **R12-C2 — Evidence and explicit stop:** execute one allowlisted local step; persist its measured result/effect receipt and a pending approval request atomically; no later step executes while approval is missing, stale or rejected.
- **R12-C3 — Durable continuation:** a fresh process, with fresh current authorization, resumes the first incomplete eligible step using the database checkpoint; it does not repeat a committed effect, including after a lost response or expired lease.
- **R12-C4 — Truthful inspection:** expose exact definition, journal, actors, approval, attempts and outcome. Missing evidence, revocation, drift, cancellation, known failure and unknown commit are never presented as successful completion.

**Constraints:** run records/journals stay outside Brain in the existing PostgreSQL database; current authenticated scope is checked at every operation; immutable evidence and original receipts survive recovery; protected 1–11 code/UX is preserved; no implicit work-item transition; run approval is not semantic promotion [S1–S12,S16].

**Non-goals:** arbitrary shell commands, network adapters, LLM/agent dispatch, DAG scheduling, new machine credentials, new role grants, autonomous daemon, Brain writes, Notion sync, Git mutations, local desktop supervision, UI redesign, deployment, or claims that a supplied document proves CI/release acceptance.

**Success signal:** a real restricted-role test drives `start → prepare → paused_approval → independent run approval → fresh-process resume → local handoff receipt`, proves a single receipt for each committed effect, verifies current revocation and fault rollback, and observes no semantic-version, memory-proposal, projection or work-item mutation. This is run-conformance evidence only, not completion of Epics 12–14.

### Smallest useful definition: `local-evidence-handoff`, revision 1

Use one trusted built-in **data-only** definition, no user definition upload:

1. `prepare`: `local-artifact-check-v1`. Read bounded UTF-8 artifact text supplied at start; compute actual SHA-256 and byte count; compare to the supplied expected digest; append a local preparation receipt. Gates are `artifact_nonempty` and `artifact_digest_match` with recorded measured values. Store no arbitrary command, evaluator or callback name from the caller.
2. `review`: explicit approval breakpoint, bound to the prepared receipt and complete definition/input digest. It cannot execute itself. An independent designated human examines the same evidence and approves/rejects with a bounded rationale.
3. `handoff`: `local-handoff-receipt-v1`. Append a local handoff receipt referencing the prepared effect, approval decision, and input/definition digests. It performs **no external write**.

These gates verify local artifact integrity, not the truth of prose inside the artifact. A claimed test pass, exit code or source SHA inside that text remains caller-supplied evidence. No API accepts `passed=true`, `outcome=succeeded`, a replacement gate threshold, or an externally asserted effect receipt. Real CI/skill execution adapters require later bounded design and real execution evidence. This keeps the slice useful as a durable approval/handoff tracer without pretending to build a methodology runtime [S3,S5,S6].

## 3. Shared contracts — adopted v1

All JSON objects are strict: reject unknown keys, null for non-null fields, wrong primitive types, duplicate IDs, unsupported versions and invalid UTF-8/NUL. UUIDs use current validation conventions; SHA-256 is lowercase 64 hex; source revision, when present, is lowercase 40 hex; operation keys are `[A-Za-z0-9._:-]{1,128}`. Positive revisions/fences/sequences fit a safe positive 32-bit integer and **fail closed on exhaustion**, never wrap. Timestamps are database UTC ISO strings. Caller-selected group/workspace never constitutes authority [S7–S10,S12].

```ts
type UUID = string;
type Sha256 = string;
type Instant = string;
type RunScope = Readonly<{ groupId: string; workspaceId: UUID }>;
type DefinitionRef = Readonly<{
  id: 'local-evidence-handoff'; revision: 1; digest: Sha256;
}>;
type RunPolicyV1 = Readonly<{
  version: 'run-policy-v1';
  allowedHandlers: readonly ['local-artifact-check-v1', 'local-handoff-receipt-v1'];
  approvalStep: 'review'; independentReviewer: true;
  gates: readonly ['artifact_nonempty', 'artifact_digest_match'];
  maxAttemptsPerEffect: 3; leaseMs: 10000; stepDeadlineMs: 2000;
  maxArtifactBytes: 16384; maxJournalRows: 128;
  maxRunAgeMs: 86400000; approvalTtlMs: 86400000;
}>;
type RunDefinitionV1 = Readonly<{
  version: 'run-definition-v1'; id: 'local-evidence-handoff'; revision: 1;
  engineContract: 'run-engine-v1'; handlerBundleDigest: Sha256;
  policy: RunPolicyV1;
  steps: readonly [
    { id: 'prepare'; kind: 'local'; handler: 'local-artifact-check-v1' },
    { id: 'review'; kind: 'approval'; dependsOn: 'prepare' },
    { id: 'handoff'; kind: 'local'; handler: 'local-handoff-receipt-v1'; dependsOn: 'review' }
  ];
}>;
type StartRunV1 = Readonly<{
  operationKey: string; definitionId: 'local-evidence-handoff'; definitionRevision: 1;
  goal: string; reviewerPrincipalId: UUID;
  artifact: { text: string; expectedSha256: Sha256; sourceRevision: string | null };
}>;
type RunRecordV1 = Readonly<RunScope & {
  version: 'run-record-v1'; runId: UUID; definition: DefinitionRef;
  policyDigest: Sha256; inputDigest: Sha256; ownerPrincipalId: UUID;
  reviewerPrincipalId: UUID; goal: string; createdAt: Instant;
  expiresAt: Instant; journalRef: { runId: UUID };
}>;
type RunPhase = 'ready' | 'running' | 'paused_approval' | 'blocked' | 'terminal';
type RunOutcome = 'succeeded' | 'failed' | 'partial' | 'unknown';
type RunReason = 'none' | 'approval_required' | 'approval_rejected' |
  'approval_expired' | 'authority_unavailable' | 'definition_drift' |
  'lease_expired' | 'retry_due' | 'attempts_exhausted' | 'gate_failed' |
  'cancelled' | 'deadline' | 'commit_unconfirmed' | 'inconsistent_evidence';
type RunRuntimeStateV1 = Readonly<{
  version: 'run-runtime-v1'; runId: UUID; revision: number; phase: RunPhase;
  outcome: RunOutcome | null; reason: RunReason;
  nextStepId: 'prepare' | 'review' | 'handoff' | null;
  checkpointSeq: number; cancelRequested: boolean; updatedAt: Instant;
}>;
type RunStepStateV1 = Readonly<{
  stepId: 'prepare' | 'review' | 'handoff';
  state: 'pending' | 'leased' | 'waiting_approval' | 'completed' | 'failed' | 'blocked';
  attempts: number; fence: number; dueAt: Instant | null;
  leaseId: UUID | null; leaseUntil: Instant | null; effectReceiptId: UUID | null;
}>;
type RunCommandV1 = Readonly<{
  runId: UUID; expectedRevision: number; operationKey: string;
}>;
type RunDecisionV1 = Readonly<RunCommandV1 & {
  approvalRequestId: UUID; reviewedEvidenceDigest: Sha256;
  decision: 'approve' | 'reject'; rationale: string;
}>;
type ApprovalRequestV1 = Readonly<{
  id: UUID; runId: UUID; stepId: 'review'; definition: DefinitionRef;
  inputDigest: Sha256; preparedReceiptId: UUID; evidenceDigest: Sha256;
  requestedAtRevision: number; reviewerPrincipalId: UUID;
  createdAt: Instant; expiresAt: Instant;
}>;
type ApprovalDecisionV1 = Readonly<{
  id: UUID; requestId: UUID; runId: UUID; reviewerPrincipalId: UUID;
  reviewedEvidenceDigest: Sha256; decision: 'approve' | 'reject';
  rationale: string; journalSeq: number; createdAt: Instant;
}>;
type RunEffectReceiptV1 = Readonly<{
  version: 'run-effect-v1'; id: UUID; runId: UUID;
  stepId: 'prepare' | 'handoff'; effectSlot: 'local-result';
  definitionDigest: Sha256; inputDigest: Sha256;
  actorPrincipalId: UUID; attempt: number; fence: number;
  preparedReceiptId: UUID | null; approvalDecisionId: UUID | null;
  artifactSha256: Sha256; artifactBytes: number;
  measuredGates: readonly { id: 'artifact_nonempty' | 'artifact_digest_match'; passed: boolean }[];
  journalSeq: number; committedAt: Instant;
}>;
type RunOperationReceiptV1 = Readonly<{
  version: 'run-operation-v1'; id: UUID; operationKey: string;
  command: 'start' | 'advance' | 'decide' | 'resume' | 'cancel';
  runId: UUID; actorPrincipalId: UUID; requestDigest: Sha256;
  acceptedRevision: number; journalSeq: number; acceptedAt: Instant;
  phaseAtAcceptance: RunPhase;
}>;
type RunJournalEventV1 = Readonly<{
  runId: UUID; seq: number; eventId: UUID; actorPrincipalId: UUID;
  stepId: 'prepare' | 'review' | 'handoff' | null;
  kind: 'started' | 'claimed' | 'effect_committed' | 'approval_requested' |
    'approval_decided' | 'resumed' | 'retry_scheduled' | 'blocked' |
    'cancel_requested' | 'terminated';
  attempt: number | null; fence: number | null;
  receiptId: UUID | null; reason: RunReason; createdAt: Instant;
}>;
type RunInspectionV1 = Readonly<{
  record: RunRecordV1; runtime: RunRuntimeStateV1; steps: readonly RunStepStateV1[];
  approval: ApprovalRequestV1 | null; decision: ApprovalDecisionV1 | null;
  effects: readonly RunEffectReceiptV1[];
  journal: readonly RunJournalEventV1[]; hasMore: boolean; afterSeq: number;
  observedAt: Instant; doctor: readonly RunReason[];
}>;
```

`leaseId` is internal execution data and omitted from public inspection; public steps expose the other fields. Immutable identity/binding snapshots (issuer/subject) needed for current owner/reviewer checks remain private DB columns, not returned DTOs. `sourceRevision` is provenance supplied by the requester, not a verified build claim. `goal` and decision rationale are 1–1000 UTF-8 bytes after nonempty validation, preserved exactly. Input artifact text is 1–16384 UTF-8 bytes, preserved exactly. The journal reference is a structured logical reference, **not a filesystem path or second authoritative journal**.

### Definition and digest rules

- The running process supplies only the shipped definition. Start selects its literal ID/revision, never caller policy/handlers. On first use, store its scoped immutable definition; a matching ID/revision with different bytes is a conflict, not an update. New behavior needs a new revision; existing runs keep their exact revision [S6,S8].
- Database-normalized `jsonb::text` UTF-8 SHA-256 is the authoritative digest for definition, policy, input and command envelopes; compute and persist in SQL using the existing `encode(sha256(convert_to(...,'UTF8')),'hex')` pattern [S18]. Do not compare a JavaScript JSON.stringify digest to PostgreSQL's serialization. Artifact hash uses **raw UTF-8 text bytes**, not JSON normalization. Add fixed cross-boundary test vectors.
- Definition digest includes policy, ordered steps and the exact shipped handler-bundle digest. The server derives the latter from owned handler source bytes, not request JSON. Before claim and completion compare the installed registry to the pinned definition. Missing old handler or differing bytes yields `blocked/definition_drift`, not silent upgrade/replay under new code. Existing core packing includes source/migrations dynamically [S15].
- Evidence digest binds `(runId, definitionDigest, inputDigest, preparedReceiptId, exact prepared receipt digest, reviewerPrincipalId)`. Approval is of that evidence snapshot, never a mutable display or "latest" revision.

## 4. Actor/scope/action matrix and revocation

**Minimal v1 authority choice:** keep the current Action union and all credential/grant schemas unchanged. Follow the already-used bounded human-administration service pattern [S7,S9,S12]. This is an adopted local design default, not proof an admin title currently operates runs.

| Operation | Existing gateway/transaction admission | Additional run-specific predicate |
|---|---|---|
| Start | human `workspace:grants:manage` | Owner is current authenticated principal. Designated reviewer is a different active, bound human with current same-workspace `workspace:grants:manage` and `audit:read`. Exact built-in definition only. |
| Advance / resume / claim / finish | human `workspace:grants:manage` | Caller is immutable owner; definition allows this step; current owner binding/grant valid; fresh exact approval and current designated-reviewer authority if crossing review. Internal executor uses the **current request identity**, never a stored JWT. |
| Decide | human `workspace:grants:manage` | Caller is the designated independent reviewer, not owner, preparation actor or definition/input producer. Current `audit:read`, exact request/evidence/run revision, unexpired pending breakpoint. |
| Cancel | human `workspace:grants:manage` | Any current same-workspace human admin may stop it, including after owner loses authority. This never confers resume/approval authority. |
| Inspect / doctor / journal / receipt lookup | human `audit:read` | Current workspace entitlement, bounded exact selector; private actor binding/lease data excluded; hidden and missing IDs share not_found. Inspection need not require the old owner's continued membership. |
| Viewer, curator, org-only admin | none | Deny run operations; org title alone exposes no run/goal/evidence/count. A curator's separate `review:approve` does not grant run approval. |
| Service, worker, device, owner-linked OAuth client, selected-only client | none in v1 | Deny all run commands and run inspection, even an owner-linked client with `audit:read`. No machine endpoint or widening of device/client ceilings. |
| Anonymous / mixed identity / forged principal | none | Deny before body/protected work [S10]. |

The function-level human check is mandatory even when a service is called without HTTP. SQL independently enforces human kind plus `context_allows` and the run predicate; it must not trust a role string, run owner field or supplied approved flag. Use the current issued Identity/Authority mechanism; plain object lookalikes fail [S7–S9].

**Current authority:** use `scopedTransaction` unchanged for each short transaction. Its caller locks/rechecks remain; additionally lock the relevant immutable run participant identities and current principal/tenant/membership/workspace/grant/binding rows for owner and reviewer before depending on them. Acquire additional participant rows in stable principal/key order, with share locks and no grant updates or lock upgrades in run functions. Revalidate exact stored bindings after waiting. Take run-state/step locks only after authority locks. Deadlock/timeout is rollback or unknown transport outcome, never permission to retry an effect blindly [S8,S9,S13].

Both revocation orders require tests: protected transaction first commits before revocation, and revocation first causes waiting operation to deny after revalidation. Do not hold authority locks across pause, lease lifetime, human review or subprocess lifetime. Recheck each fresh call, lease completion and public disclosure. Revocation does not erase old decisions/receipts; it stops new effects. A persisted approval cannot stand in for the reviewer's current authorization when the next effect is admitted. If authority cannot be read, fail closed without a fake durable "revoked" claim.

**No semantic promotion:** do not import/call capture, proposal, decideProposal, correction, projection or memory-experiment submission from the run executor. Run approval consumes no `review:approve` entitlement and creates no semantic rows. A future writeback candidate is just a scoped reference; actual memory capture/pending proposal and independent semantic review retain their separate services and receipts [S3,S7,S12].

## 5. State transitions and truthful results

Transitions are server-derived; no public state setter. Every accepted change increments run revision once, appends its journal events, and stores an operation receipt in the same transaction. Multiple events in one transaction use consecutive journal sequences; `checkpointSeq` is the last committed sequence.

| Starting state | Event and preconditions | New state / facts |
|---|---|---|
| Absent | Valid start and capacity admission | `ready`, next `prepare`, outcome null; immutable run/definition/input and started event/receipt. |
| Ready, due | Owner advances first eligible incomplete local step | `running`; durable lease, incremented attempts/fence, claimed journal and immutable advance receipt. No effect yet. |
| Running prepare | Current matching lease; both measured gates pass | One prepare effect, completed prepare, immutable approval request, `paused_approval`, next `review`, reason approval_required. All atomic. |
| Running prepare | Definitive gate failure | No successful effect receipt; measured failure journal, step failed; terminal failed if no earlier committed effect. |
| Paused approval | Exact designated reviewer approves | Immutable approval decision, review completed, `ready`, next handoff. **No handoff execution in the decision request.** |
| Paused approval | Reviewer rejects | Immutable rejection; terminal partial if prepare effect committed, otherwise failed. Reason approval_rejected. |
| Ready after approval | Fresh owner resume; approved snapshot still current/eligible | Reconcile receipts, then ready for handoff; one bounded handoff execution may be triggered after resume commit. Original prepare never reruns. |
| Running handoff | Current lease, valid current approval and participants | One handoff receipt; all required evidence linked; terminal succeeded, next null. |
| Running, expired lease | Receipt exists | Reconstruct checkpoint from that exact receipt; do not invoke handler again. |
| Running, expired lease | No receipt, local atomic-effect contract, DB read succeeds | No local effect committed; bounded new attempt only when due and currently authorized. Old fence remains unusable. |
| Any nonterminal | Drift, inconsistent evidence, expired approval, or reconciliation cannot establish result | Blocked with precise reason; unknown only where result is genuinely unestablished. Never mark terminal success. |
| Any nonterminal | Accepted cancel | `cancelRequested=true`, fence incremented, lease invalidated, cancel journal. Terminal failed if known zero committed effects; terminal partial if some effects committed. If any effect is genuinely unresolved, remain blocked/unknown until reconciliation. |
| Terminal | New ordinary command | Conflict, except idempotent exact operation replay/inspection. No resurrecting, revising or overwriting old receipts. |

`outcome=null` means a nonterminal run with no aggregate conclusion; it is not success. `unknown` means unresolved durable effect/commit, not merely awaiting human approval. `succeeded` requires all declared steps, measured gates, exact valid approval and required receipts. `partial` requires known completed effects and known incomplete/failed/cancelled remainder. An unknown effect takes precedence over partial. Approval rejection, exhausted retries, cancellation and expiry never translate to Done [S3,S5,S11].

Approval expiry uses database time and is capped by run expiry. No automatic approval renewal or reviewer substitution. A blocked expired/rejected run can be cancelled; changed input/reviewer/policy requires a new run. Continuing an unresolved effect means reconcile the **same** run/effect identity, not start a replacement and hope it was rolled back.

Inspection derives doctor findings without writing during GET: pending approval, stale lease, failed/incomplete step, missing pinned handler, inconsistent receipt linkage, expiry and exhausted attempts. Terminal success with a missing required immutable receipt is an integrity failure and must be surfaced, not silently repaired. A DB outage is an unavailable inspection with unknown current state, not an invented empty run. Persisted state can only change through an authorized command.

## 6. Transactions, journal, operation replay and effect identity

### Adopted additive migration and storage

Observed inventory is exactly **001–024**, ending `024-selected-client.sql`, and the current explicit migration list matches it [S8,S9]. Reserve **`foundation/migrations/025-durable-runs.sql`** for the later implementation slice **only if it is still next at implementation admission**. Adoption rediscovered exactly 24 files ending at 024; rediscover again before writing. Never rename/rewrite 001–024; no down migration. No migration is authored or executed by this documentation adoption.

Use existing schema/database `allura`, not Brain `events` as a surrogate run engine and not a new schema service. Adopted tables:

| Table | Key / immutable versus mutable contract |
|---|---|
| `run_definitions` | PK `(group_id,workspace_id,definition_id,revision)`; canonical definition text/JSON, definition/policy/handler hashes; immutable. Insert from trusted built-in registry only. |
| `run_records` | PK `(group_id,workspace_id,id)`; definition composite FK, owner/reviewer and private original binding identities, goal, bounded artifact/input digest, created/expiry time; immutable. Composite membership references; owner ≠ reviewer. |
| `run_state` | PK/FK scoped run; revision, phase, outcome, reason, next step, checkpoint, cancel flag, timestamps; mutable only through guarded command functions. |
| `run_steps` | PK `(group_id,workspace_id,run_id,step_id)`; state, attempt/fence, due time, internal lease id/holder/expiry, effect receipt link; mutable guarded projection. |
| `run_journal` | PK `(group_id,workspace_id,run_id,seq)`; unique scoped event ID; exact typed append-only event, actor, reason and receipt linkage. No arbitrary log payload. |
| `run_operation_receipts` | PK scoped receipt; UNIQUE `(group_id,workspace_id,actor_id,operation_key)`; command/request digest, exact immutable `receipt_text`, run/revision/seq/time. This namespace spans commands, so reusing a start key for cancel conflicts. |
| `run_effect_receipts` | PK scoped receipt; UNIQUE `(group_id,workspace_id,run_id,step_id,effect_slot)`; exact immutable receipt text and dependency links. Not keyed by attempt or lease. |
| `run_approval_requests` | PK scoped approval request; UNIQUE `(group_id,workspace_id,run_id,step_id)` for this single fixed breakpoint; prepared effect/evidence digest/reviewer/expiry. Immutable. |
| `run_approval_decisions` | PK scoped decision; UNIQUE scoped request ID; decision/evidence/rationale/actor/time/seq; immutable. No update from reject to approve. |

Every child FK includes group/workspace/run where applicable; effect/request/decision links cannot splice another run's or workspace's receipt. Receipt↔journal links may be DEFERRABLE INITIALLY DEFERRED so both commit or neither. CHECK constraints enforce the allowed enums, nullability combinations, bounds, state/outcome combinations and exact step IDs. Successful effect receipts are not written for failed gates. Failed measurements live in bounded typed journal evidence (the two allowed gate IDs, actual byte count/hash and expected digest), not arbitrary provider text. Extend the journal DTO with this typed optional `measurement` field only on the prepare-failure event; SQL rejects it on other kinds. No free-form payload dictionary.

Enable and FORCE RLS on all scoped run tables; revoke all PUBLIC/table mutation rights. Give `allura_app` SELECT only for the content-free journal/state/receipt projections where a human `audit:read` policy is appropriate; private definition/input/binding data is accessible only through bounded guarded read functions. App has no direct INSERT/UPDATE/DELETE/TRUNCATE on run tables. Use fixed-search-path SECURITY DEFINER command functions with explicit context checks; revoke helper execution from PUBLIC and app, grant only exact entry functions. Immutable tables use the existing append_only trigger including TRUNCATE; mutable tables are never app-owned [S8,S9,S12]. A migration owner is privileged fixture/migration authority, not a runtime account. GUCs still express trusted-server context; do not claim they cryptographically authenticate a stolen DB login [S8].

### Command/effect boundary

1. Authenticate and admit request before body; validate strict finite inputs. Start is one short scoped transaction: current authority, scope capacity/advisory lock, normalized digest, operation-key lock, replay/conflict check, immutable definition/run/input + projections + journal + operation receipt; commit before reporting acceptance.
2. Existing-run commands: caller authority locks; participant locks/rechecks as needed; operation-key advisory lock; replay lookup; run row lock; expectedRevision comparison; command preconditions. Exact replay is checked **before** stale-version rejection but **after** current authority. A valid old receipt never grants a new effect or resurrects a cancelled run.
3. Claim is a short transaction that selects only the first incomplete eligible step, increments fence/attempt, persists lease/claim/advance receipt and commits. No handler invocation before durable claim. The receipt means admission, not effect completion.
4. Execute only the shipped bounded handler. For this local slice the actual artifact check/local receipt insertion and `run_steps`/journal/checkpoint/outcome change occur in **one transaction**, under matching live lease/fence, run lock and current participant authority. No arbitrary I/O inside it. Check abort/deadline before commit; use existing SQL statement/lock limits [S8,S10,S11].
5. Approval decision atomically writes immutable decision, review completion, journal and operation receipt. Resume is a separately replayable command. After committed resume, the request may drive at most one local claim/effect; loss before that leaves a resumable ready checkpoint.
6. Return immutable operation receipt separately from a freshly authorized inspection, or require a subsequent GET. Do not embed a mutable snapshot inside stored receipt text. An advance replay returns its original accepted/running receipt even if the run is now terminal; inspection returns current truth.

Request digest includes version, authenticated actor, scope, command, exact run/definition/input selectors, expectedRevision and decision data as applicable; the key is not part of semantic identity. Do not lowercase/trim artifact/goal/rationale to mask changed requests. Scoped key-lock plus UNIQUE constraint resolves concurrent duplicates; changed digest returns conflict with zero domain writes. Original `receipt_text` is returned byte-for-byte by service-level replay; HTTP JSON reserialization is not advertised as byte-identical unless the actual route preserves it. API field equality and service receipt-byte equality are separate tests [S8,S12,S13].

**Unknown acknowledgement:** arbitrary SQL/socket/HTTP failure is not proof of rollback. Respond unknown, instruct same-key reconciliation under current authority. Reconnect to this same PostgreSQL authority: receipt exists → return it; successfully confirmed absence plus eligible state → safely retry the command. If DB cannot establish absence, remain unknown. Never issue a fresh key automatically. No per-process cache determines whether an effect happened.

**Effect guarantee:** exactly one committed local effect receipt per `(scope,run,step,effectSlot)` is enforceable because all effects in v1 are PostgreSQL-local and transactional. This is not exactly-once execution of arbitrary external effects. A future external adapter must durably mark intent before dispatch, use a stable remote idempotency identity, and reconcile authoritative destination read-back; after ambiguous dispatch it may only reconcile, never blindly write again [S12]. V1 rejects such handlers outright.

## 7. Leases, concurrency, cancellation, retries and retention

These are **adopted local safety bounds under delegated design authority**, not measured product SLOs or user-set budgets. Existing HTTP 16/5000ms/65536-byte request/131072-byte response and SQL 5000ms statement/2000ms lock ceilings remain unchanged [S10,S11].

- Linear v1: one executing step per run; no DAG/parallel step support. Concurrent requests/processes contend on the same scoped run/step. Across different runs, admit at most 4 active leases per workspace and process budget capacity 2/2000ms using existing work-budget semantics. A scope-local quota/admission lock makes DB lease limits atomic across processes. No global capacity counts are disclosed.
- Lease duration 10000ms; no renewal/heartbeat in this short-step slice. Server-generated lease UUID and invocation UUID; monotonic fence. Claim and finish bind owner identity, run, step, fence, lease and database expiry. Stale/expired completion is conflict and writes no effect. Cancel increments fence even if no lease is active. All lease time comparisons use database time; clock/client sleeps never authorize work.
- A process timeout/cooperative AbortSignal does not prove work stopped. Keep process admission occupied until the underlying work settles, as work-budget already does [S11]. An abandoned claim becomes recoverable only after lease expiry/current authorization. New process has no authority merely because it knows a lease ID.
- Retry only definitive rollback/transient local contention or an expired claim with **confirmed no local receipt**. At most 3 claims per effect; retry delays after attempts 1 and 2 are 1000ms and 2000ms, persisted as dueAt using DB time. No busy loop, auto-reset, clock override, retry on forbidden/invalid/stale/failed gate, or new run/key to bypass limits. Attempt exhaustion with known no additional effect is terminal failed/partial according to completed effects; unestablished effect remains blocked/unknown.
- Journal cap 128 events/run, with space reserved at admission for a terminal/cancel/blocked event; never trim immutable events to admit another attempt. Maximum run age and approval TTL 24 hours, bounded by expiresAt. Expiry is not proof of an aborted effect; reconcile first, then known failure/partial or unknown.
- Default workspace retention cap: 256 total retained runs, 32 nonterminal runs, 16 immutable definition revisions, 128 journal rows/run, 16KiB artifact/run, 100 journal events/page. These constants are checked transactionally and count retained terminal rows. Saturation refuses new admission before work; it does not delete evidence. No automatic purge, TTL deletion, overwrite, log export or remote telemetry. This is finite-storage admission, **not** a legal retention period. Long-term archival needs a separately adopted preserve-receipts policy; v1 may eventually require authorized archival before new runs.
- Raw artifact/goal/rationale remain private scoped content; operational logs contain only allowlisted stage/outcome/reason and safe correlation. No tokens, credentials, issuer/subject, filesystem path, arbitrary error, SQL text, private document content or foreign identifiers in diagnostics. Never infer secret detection is reliable: initial fixture accepts synthetic evidence only; later real use must apply the application's content classification policy. Inspection is no-store and paginated; artifact preview requires the same authorized human run inspection path, never a public file URL [S8,S10,S11].

## 8. Necessary API only

Use one `createRunRoutes(sql)` factory composed into the **existing** core gateway; no nested gateway/admission reset and no additional listener/service [S10]. Adopted routes:

| Route | Input/output |
|---|---|
| `POST /api/runs/start` | StartRunV1 → immutable RunOperationReceiptV1. |
| `POST /api/runs/advance` | RunCommandV1 → immutable admission receipt; drives at most one eligible local step after claim. |
| `POST /api/runs/decide` | RunDecisionV1 → immutable operation receipt; approval decision available by inspection. |
| `POST /api/runs/resume` | RunCommandV1 → immutable resume receipt; reconcile first, then at most one eligible local step. |
| `POST /api/runs/cancel` | RunCommandV1 → immutable cancellation receipt. |
| `GET /api/runs/inspect` | Exactly group_id, workspace_id, run_id; optional after_seq (integer ≥0), limit (1–100, default 20) → RunInspectionV1. |

All POST routes accept only group_id/workspace_id query selectors; all GET parameters reject duplicates/unknowns. Human-only mutators use `workspace:grants:manage`, inspection uses `audit:read`; current run predicates still apply. No caller actor/scope override fields. Preserve gateway CSRF, assertion/cookie and Bearer separation, bounded streaming, post-return recheck, error/privacy handling [S10]. Add RunError to the existing known error mapping: invalid→400, forbidden→403, not_found→404, conflict→409, unavailable/unknown→503. Do not extend GatewayReply to fake completion or invent a task-status HTTP API. Machine-only runtime leaves these human routes unavailable. Five MCP memory tools remain unchanged.

The initial operator can exercise this through the existing authenticated API boundary. A run tab, inspector redesign, board, work-item linkage and desktop UI are not necessary to prove 12.2. Later inspection UI must retain S16's design, state and accessibility contracts. No task is marked Done by these routes.

## 9. Acceptance contract — actual behavior, not source-string checks

Every case must execute real production services/functions with the restricted `allura_app` login; owner connections are for synthetic setup, controlled failure injection, observation and cleanup only [S13]. Use at least two populated workspaces and a second tenant with nonempty foreign sentinels. The matrix below is adopted required evidence, **not runtime results from this documentation task**.

| AC | Concrete proof and negative control |
|---|---|
| R12-AC01 Provenance | Pin exact definition/policy/input/handler hashes; fetch through real inspection; no mutable latest lookup. A changed definition under the same revision conflicts. Missing/changed handler blocks claim/finish. Source revision string does not become CI verification. |
| R12-AC02 Positive tracer | Real human owner start/advance; actual nonempty/hash gate measurements; one prepare receipt; paused approval; handoff absent; different designated human reviews exact digest; fresh-process resume; one handoff; terminal succeeded. Inspect actual journal and FK links. Verify semantic/proposal/projection tables unchanged. |
| R12-AC03 Current authority | Real signed owner/reviewer; unauthenticated/forged/mixed human+machine, foreign IDs, wrong role, org-only admin, self-review, another admin posing as designated reviewer, current tenant disabled/membership removed/workspace locked/binding deactivated/grant demoted all deny. Cached Identity objects do not bypass rechecks. Assert zero new domain/audit-success rows and zero content/metadata leakage. |
| R12-AC04 Restricted SQL | Verify login not owner/superuser/BYPASSRLS, FORCE RLS enabled; app cannot mutate private tables or execute private helpers; absent/malformed/foreign context exposes no rows. Cross-scope/run FK splice fails. UPDATE/DELETE/TRUNCATE immutable records fail even accidental owner DML. Pool reuse A→B→no-context does not retain A. Preserve the disclosed GUC trust boundary. |
| R12-AC05 Run approval | Missing/stale expectedRevision, wrong request, input/evidence digest, changed reviewer, expired request, request for different run, replayed reject-as-approve all fail with no mutation. Exact committed same-key replay returns original receipt after later run progress. Run approval leaves memory semantic counts unchanged and grants no review:approve. |
| R12-AC06 Concurrent replay | Six concurrent identical starts and advances create one run/claim/effect identity; changed payload/key collision conflicts; two different commands sharing a key conflict. Competing decisions/revisions yield exactly one accepted transition. DB constraints, not an in-memory mutex, own the result. |
| R12-AC07 Crash/commit | Trigger failure before each insert/update boundary and a deferred constraint-trigger failure at commit leave prior projections/receipts/journal unchanged. Terminate actual app backend during effect transaction; reconnect and reconcile same key, no partial effect. Kill fresh executor child after durable claim but before effect; expiry recovery completes once. Drop real response **after** real handler commit; same-key replay returns original receipt and no duplicate effect. A missing module import is not behavioral RED. |
| R12-AC08 Fencing/parallel failure | Two separate processes contend for same run; show one live lease. Hold/expire A, claim B, allow late A: only B can commit. Cancel-versus-finish both orderings preserve already committed effects and reject fenced late work. Failure in run A does not corrupt B or reveal B's metadata. V1 rejects parallel-step definitions rather than silently ignoring parallelism. |
| R12-AC09 Revocation ordering | For owner and designated reviewer, exercise operation-first and revoke-first using distinct DB connections and known backend PIDs. Observe actual `pg_blocking_pids`, including each distinct waiter, not generic lock counts or sleeps. Revoke-first must deny before effect/disclosure after waiting; operation-first commits its evidence before revocation, subsequent request denies. Test approval granted then reviewer revoked before handoff. |
| R12-AC10 Outcome honesty | Gate mismatch→failed without prepare success; cancel/reject after prepare→partial, never succeeded; unresolved DB acknowledgement→unknown response; receipt reconciliation restores known truth. Unknown cannot silently become failed/no-effect on timeout. Inspection during outage is not empty success. Drift/expired approval/exhaustion identify exact reason. |
| R12-AC11 Bounds/redaction | Body overflow/slow body/malformed JSON/invalid revision and extra keys deny. Cross-process lease quota and retained-run cap admit only bounded work. Pre-abort invokes nothing; late settlement cannot write after cancel/fence; hung work retains its process slot. Retry before due denies/no claim; exactly bounded attempts; no reset through new operation keys. Raw secret/content sentinels absent from logs/errors and foreign output; scoped artifact preview remains private. |
| R12-AC12 Regression/recovery | Full canonical unit, compiler, lint and owned DB lanes discover new cases nonzero with no skips/missing names; migration reapply unchanged/checksum drift rejection; pack and backup/restore include 025 plus immutable run evidence. Old five-tool, owner-client/device/selected ceilings and protected UI regressions remain covered. Local evidence is not hosted/deployed/platform/human-release acceptance. |

Unit tests call actual strict DTO parsers, hashing/measurement functions and reducer predicates used by the service; they do not claim to prove SQL locks/RLS. Restricted-DB cases own those claims. Fault triggers must be scoped to this fixture's group/run to avoid damaging unrelated suites; clean them in finally. Actual child/server/DB failure logs and before/after row evidence must accompany claims [S13,S14].

## 10. Woz handoff — one smallest 12.2 vertical slice

**Slice:** implement only the built-in local-evidence handoff above through existing authenticated HTTP, including durable pause, exact run approval, fresh-process recovery, cancellation safety and truthful inspection. No general workflow designer, machine worker, shell executor, UI or board. This proves a bounded portion of 12.2 and establishes fixtures for 12.3; it does not close either story in full.

**Admission:** compiler freeze release and canonical contract adoption are supplied; the parent inspects this diff before handing the bounded build slice to the sole Woz writer. Recheck HEAD, migration inventory and active direct-build STOP before any implementation execution. Preserve all compiler-witness specifications, reports and previously admitted evidence. No edits to `/home/sabira/.hermes/profiles/troy/reports/allura-story-review`. Treat a changed shared runner as a dependency to inspect, not permission to overwrite the v5 repair. The present docs worker has no source-write or test-execution authority.

### Exact implementation source allowlist for later bounded Woz admission

Add:

- `foundation/migrations/025-durable-runs.sql` — tables, constraints/RLS/immutability, private helpers and guarded command/read entrypoints.
- `foundation/src/run-contract.ts` — strict DTO parsers, built-in definition, fixed measured gates and hashes; no arbitrary adapter registration.
- `foundation/src/runs.ts` — bounded service transactions, command/effect receipt reconciliation and one-step local executor.
- `foundation/src/runs-api.ts` — the six human routes and strict selector parsing.
- `foundation/tests/run-contract.test.ts` — real parser/measurement/transition behavior.
- `foundation/tests/runs.test.ts` — fixture-backed transactions, security, crash/concurrency/recovery and effects.
- `foundation/tests/runs-http.test.ts` — real core-gateway tracer, pre-body/mixed identity/CSRF/privacy/lost-response checks.
- `foundation/tests/run-process-fixture.ts` — bounded child entrypoint for two-process lease/restart tests; receives only the owned synthetic target and test identity material, prints no credentials. Not a production worker/daemon.

Edit only necessary wiring/registration:

- `foundation/src/persistence.ts` — append 025 to explicit migration list; **do not change scopedTransaction**.
- `foundation/src/core-api.ts` — compose createRunRoutes in existing routes array.
- `foundation/src/gateway.ts` — add typed RunError mapping only; preserve all authentication/admission semantics.
- `foundation/scripts/test.ts` — add required unit suite with exact names and assertion floor; no runner-algorithm changes.
- `foundation/src/ci-contract.ts` — add matching UNIT_FILES entry in the exact same order.
- `foundation/tests/ci-contract.test.ts` — add the new unit file to the protected inventory/floor/case loop; preserve equality.
- `foundation/scripts/test-db.ts` — register both new DB/HTTP test files in canonical child list and exact required-case list; keep owned target/no-selector/cleanup guards.
- `foundation/tests/recovery.test.ts:35` — migration inventory expectation from 24 to 25 **only if 025 remains the sole additive migration**; extend backup fixture assertion to retained run receipts if needed.
- `foundation/tests/core-release.test.ts:94` — packed migration inventory expectation from 24 to 25 under the same condition; preserve exact manifest equality.

No edits to existing authority.ts, authentication.ts, migrations001–024, OAuth/device/client grant models, five-tool schemas, dependencies/lockfile, protected UI/assets or vendor BMAD files are needed. Existing fixture may be imported unchanged; create the second human run admin in the new test fixture with owner-only synthetic setup rather than changing common reviewer semantics [S7–S10,S13–S15]. Canonical Story 12.1/Correct Course documents are owned by this docs pass; Woz must not edit them as an implementation side effect.

### Exact registration names and commands

Adopted `run-contract.test.ts` requiredCases (set `minAssertions:40`; implement at least that many meaningful expectations and report the actual observed number):

1. `run contract rejects authority policy and executable input overrides`
2. `run artifact gates measure exact bytes without trusting claimed outcomes`
3. `run state never treats pending partial or unknown as succeeded`
4. `run definition input and approval bindings preserve exact immutable identity`

Append these exact cases across `runs.test.ts` and `runs-http.test.ts` to test-db's required list as they are built, preserving one canonical lane:

- `run HTTP start persists one immutable scoped admission receipt`
- `run HTTP starts pauses approves and resumes one durable local handoff`
- `run authority denies foreign machines self review and current revocation`
- `run restricted tables and pooled contexts preserve immutable scoped evidence`
- `run same key concurrency yields one receipt and changed payload conflicts`
- `run exact approval replay never authorizes changed expired or rejected evidence`
- `run deferred faults and terminated transactions leave no partial effect`
- `run fresh processes recover expired claims and fence late completion`
- `run cancellation and parallel failures preserve committed effect truth`
- `run owner and reviewer revocation serialize in both database orders`
- `run lost committed response reconciles without repeating an effect`
- `run bounded retries retention and redaction reject unbounded work`
- `run HTTP authenticates before body and preserves mixed identity CSRF denial`

All DB cases belong in those two registered files, not merely a one-off import. Add a focused child invocation of those same files inside the existing owned DB runner before its existing focused OAuth gate, with the same generated env/target and strict nonzero/exit/fail/skip checks, following its current focused-client pattern [S14]. The canonical full DB child still runs on every GREEN. Do not add command-line selectors or environmental test-target overrides. Retain named-case output long enough for the existing DB parser's timed-pass matching; if a legitimate untimed pass exposes that existing runner limitation, report/request a narrowly scoped runner correction rather than artificially delaying tests or weakening discovery.

Commands below are for the authorized Woz phase, **not executed here**. Working directory is exactly `/home/sabira/Allura_Memory-beta-local/foundation`:

```text
bun run check:toolchain
bun test ./tests/run-contract.test.ts
bun run test
bun run typecheck
bun run lint
bun run test:db
bun run check:all
```

`bun run test:db` is the supported fresh-container command; it accepts no selection overrides [S14,S15]. Do not set a convenient existing DB URL. New process tests must be launched by this owned-target fixture. Record exact source/diff/lock hashes, invocation, named cases/assertions, exit/fail/skip/missing counts and cleanup. Full `bun run ci` is a separate exact-revision/frozen-install gate with its own prerequisites; do not call an uncommitted local check hosted CI [S14,S15].

**First RED, before feature code:** add/register `run HTTP start persists one immutable scoped admission receipt` in `runs-http.test.ts`, a real test that constructs existing `createCoreGateway` with the lifecycle fixture, signs a current owner request to `/api/runs/start`, and asserts HTTP200 first, then a persisted start receipt. Do not query the not-yet-existing run table before the status assertion; the expected failure must be the real route response, not missing SQL schema. Current code has no route; the expected RED is actual 404 versus200, not an unresolved new-module import. The focused owned-DB child proves the case ran. Add only enough implementation to pass start; then extend the vertical tracer incrementally through prepare/pause, exact approval and fresh-process resume, observing each new RED before GREEN. Before accepting any success, add the matching denial/fault/fence cases above. Do not build all hypothetical tests first or claim a RED based on source inspection.

A particularly important subsequent RED: after the real prepare effect commits, terminate the executor before its acknowledgement, start a fresh process and resume. Assert the prepare handler was not invoked again, the same effect receipt is retained, the run still stops for review, and post-review handoff occurs once. An implementation that stores progress only in memory or keys effects by attempt must fail this test.

## 11. Adoption, limits and preservation

- **Freeze disposition:** parent released the compiler-witness freeze at the clean admission HEAD. Existing frozen source/spec/report bytes are still excluded from this docs writer and remain preserved. Source inventory/anchors agree with the candidate; no conflicting local source prerequisite was found for documenting adoption.
- **Design adoption:** human-admin-only synchronous v1 admission, the linear built-in definition, local artifact integrity gates, finite budgets, DTO/storage/API names and exact test requirements are adopted ordinary engineering defaults. No future machine delegation, general skill executor, parallel DAG, semantic writeback, work-item conflict mechanics or desktop framework is selected. Do not reopen the settled board/OS questions.
- **External gates remain open:** actual deployment, grants/credentials/data changes, external write/read-back, hosted CI, human/deployed 6.5/9.4 acceptance, desktop packaging/update/OS secure-store evidence. This document supplies none. Tunnel work is expressly out of scope.
- **Unrelated issue preserved:** authority-v1 reports access-audit gaps in older nomination/request paths; this slice neither repairs nor accepts them. Keep them separate rather than widening the source allowlist [S7].
- **Verification boundary:** installed Correct Course resolvers, documentation consistency, source hashes, migration inventory and preservation/diff checks only. No product test, migration, DB/service operation, network call, credential read, remote governance check, Brain/Notion write, live-status transition, commit or independent developer review. BMAD architecture/spec references in S17 are background methodology, not claims those workflows ran here.
- **Continuation:** current controlling repository authority permits local progress during Brain outages. Remote governance was not retried and is not marked passed. Any present direct-build STOP blocks build execution; no STOP is removed by this adoption. The parent retains the writer lock and build admission responsibility.

### Adoption clarifications for implementers

These tighten internal wording without expanding the candidate's effects or security authority:

1. The optional journal `measurement` described in section 6 is a typed field on `RunJournalEventV1`, allowed only on a `terminated` event with `stepId='prepare'` and `reason='gate_failed'`. It contains the two fixed gate results, actual byte count, actual SHA-256 and expected SHA-256; all other events reject it. It is not a caller payload or successful effect receipt.
2. Treat the step DTO above as internal. Public `steps` are `Omit<RunStepStateV1, 'leaseId'>`; never serialize an internal lease into inspection. Owner/reviewer binding snapshots remain private.
3. Content-free projections do not mean exposing whole private receipt tables. Use guarded bounded reads for private input, rationale, binding and receipt text; any granted SELECT projection must explicitly exclude those fields and enforce the human current-scope policy. No app table mutation rights.
4. The first RED is an admission subtest, not the complete tracer. Initially only `foundation/tests/runs-http.test.ts` and registration-only edits to `foundation/scripts/test-db.ts` are needed. Register the single exact case in both the focused owned-target gate and canonical required-case list, then run `bun run test:db` from `foundation/`. This task does not execute it. Add the full tracer and remaining cases as their behavior is built; a start-only GREEN is not R12-AC02 or Story 12.2 completion.
5. Smallest first start-GREEN file subset (only after observed RED): the two RED files, `foundation/migrations/025-durable-runs.sql`, `foundation/src/run-contract.ts`, `foundation/src/runs.ts`, `foundation/src/runs-api.ts`, `foundation/src/persistence.ts`, `foundation/src/core-api.ts`, and `foundation/src/gateway.ts` (typed error mapping only). The wider section 10 allowlist supports later focused/registration/recovery steps, not permission to skip RED or rewrite shared algorithms.

Self-check: immutable definitions, exact approval/resume bindings, current revocation, operation/effect distinction and append-only evidence survive interruption. No arbitrary executor, external effects, semantic promotion or implicit work-status transition. Product and acceptance authority remain separate from local documentation adoption.

### Observed source anchors (SHA-256; provenance only)

```text
foundation/src/authority.ts        b9a368d38fcd39f7431f7fbabdd5125aba24045a332dbd27e133532ebb4bf230
foundation/src/persistence.ts      aec3aa1147e319b6059b97afed6956f478feedaa811d3b44dbe8e7624cb0096d
foundation/src/gateway.ts          ea8c13a22984dd79d72157e5f2c834334cb25c508f0ad8e2919bbfd37dad2b41
foundation/scripts/test.ts         67f5289bb80c4959034093f946f1aedf6f4c23501f95e2e0f4ee2542fba86fec
foundation/scripts/test-db.ts      bb2b580d5b3f16dd5dbd8f66507ac24306bf7a5a19ec0c92c0182941e45fe623
foundation/src/ci-contract.ts      9fd9cce42379f2c7d33b01665ad9a4e8e7a6fbe1a1bcf9844772f8d9505ae61f
planning-artifacts/epics.md        b8e7dc7f5d6b36120f8b279c5892d33df9ffb68c319aa4bab90225e91d15bd4e
nested PRD (S3)                   e48fac980b9d77b39aebe15e7347b3426854c9ec7d7660a3ba2f1b5303becc9b
```

The epic anchor's abbreviated display path means `_bmad-output/planning-artifacts/epics.md`. These candidate hashes were rechecked where identified above; they do not certify an executed build or the separate v5 compiler evidence. The planning hashes describe pre-amendment bytes, not this adoption.
