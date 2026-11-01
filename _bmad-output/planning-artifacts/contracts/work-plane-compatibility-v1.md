---
contract: work-plane-compatibility-v1
story: '13.1'
date: '2026-11-01'
disposition: adopted-local-engineering-design
baseline_commit: b6b34d9a10cf0b7985089b896e28afa387306805
retained_main_revision: 8a831884e0f7570c453846cec4c90381a9a22ba4
implementation: not-performed
live_capability: unverified
operational_status: unknown
---

# Work-plane compatibility contract v1

## 1. Authority, purpose and capability classification

Adopted under the parent's delegated ordinary engineering authority after reopening retained-main source. These defaults are **not user quotations**, automatic source adoption, runtime verification, or live grants. The settled product direction is Allura PostgreSQL as the **sole writable live work-status authority**, with Notion **planning only**. No two-way synchronization, Markdown/YAML status board, second writable service, process scheduler, semantic promotion or automatic run-to-Done transition is admitted.

The [adapter](../../../guidelines/ALLURA-BMAD.md), [catalog](../epics.md), [authority](authority-v1.md), [persistence](persistence-v1.md) and [13.1 specification](../../implementation-artifacts/spec-13-1-work-plane-contract.md) control scope. The initial use case is an authorized human moving an already scoped work item from `ready` to `in_progress`, preserving its exact optimistic-lock token and receiving one authoritative immutable event/receipt. This is a short database command, not another durable-run engine.

| Capability | Evidence / classification |
|---|---|
| Retained-main work-item source | Present, feature-gated, PostgreSQL-backed; revision above. Read-only inspection, no source execution. |
| Fresh beta work-item API/service | Not present in inspected `foundation/src/core-api.ts` composition at the baseline. This contract is specified, not implemented. |
| Live endpoint, version, flag, credentials, ownership mapping | **Unverified**; no network or status read performed. Source filenames and tool inventories are not live support evidence. |
| Live work-item transition | **Unperformed**, no status changed. |
| Legacy atomic transition/event/receipt | Insufficient: event is best-effort after state update, no operation key/immutable acceptance receipt. |
| Local Epic12 dependency | Parent-accepted bounded criterion reconciliation at baseline, [retrospective](../../implementation-artifacts/epic-12-local-retro-2026-11-01.md); actual6.5/9.4 and external gates remain open. |

A later authorized live capability receipt must name endpoint identity, deployed revision, feature state, actual authentication, explicit grants, authority-instance/project/workspace ownership, route/version and exact observed error/receipt/readback semantics. No tunnel repair, credentials, source port or live write follows from this contract. Unsupported mapping stays unavailable; do not invent an endpoint or a successful MCP receipt.

## 2. Retained-source compatibility anchors

All paths in this table resolve under **read-only** `/home/sabira/Allura_Memory-main` at `8a831884e0f7570c453846cec4c90381a9a22ba4`. Line ranges are source anchors, not deployed assertions. Publication evidence binds their actual file hashes.

| Anchor | Observed behavior |
|---|---|
| `src/lib/work-plane/work-item-manager.ts:30–38,63–72,92–112` | Exact graph and six-digit microsecond `updated_at` token. |
| same file `:135–183,195–255,286–329,346–364` | Scoped create/get/list, read-then-CAS transition and run link; no atomic event/receipt ownership. |
| `src/app/api/work-items/route.ts:35–88,98–167` | Feature flag; viewer list, curator create; new random ID for each HTTP create. |
| `src/app/api/work-items/[id]/route.ts:21–69` | Feature-gated exact scoped GET, `{work_item}` or404. |
| `src/app/api/work-items/[id]/transition/route.ts:49–91,95–156` | Curator check; caller actor/group fields; later racing error reread and best-effort event. |
| `src/lib/work-plane/types.ts:16–73,85–137` | Existing project/lane/item fields, priorities, evidence, handoff and transition vocabulary. |
| `src/lib/work-plane/handoff-manager.ts:149–198` | Pending-only acknowledgement/rejection; terminal/missing null is not exact replay. |
| `docker/postgres-init/26-work-plane.sql:7–79,94–164` | TEXT IDs, group fields, global-ID FKs, no item workspace field. This is **not beta migration026**. |
| `src/lib/auth/api-auth.ts:87–135,156–196` | Auth/header/dev context and role comparison; these functions alone do not bind request group selector to current workspace grants. Middleware/deployment not audited; no deployed exploit claim. |

Preserve identifiers and vocabulary; do not copy the old auth, global-ID FK, process engine, or best-effort audit defects. No wholesale main→beta port. Integrate the compatible concept at beta's accepted gateway/service/transaction boundary and keep one owning service/database per item.

## 3. Wire baseline and explicit version boundary

Observed legacy routes (not live verification):

| Operation | Existing selector/body | Existing successful response |
|---|---|---|
| List | `GET /api/work-items?group_id=…&project_id=…`; optional `status`, `lane_id` |200 `{work_items:[…]}`; default100, newest-created first; no cursor contract established. |
| Create | `POST /api/work-items`; `group_id`, `project_id`, `title`; optional `description`, `priority`, `owner_id`, `lane_id`, `acceptance_criteria` |201 `{work_item:…}`; fresh server ID each call, not HTTP-idempotent. |
| Get | `GET /api/work-items/<id>?group_id=…` |200 `{work_item:…}`, missing404. |
| Transition | `POST /api/work-items/<id>/transition`; `group_id`, `actor_id`, `to_status`, `expected_updated_at`; optional `reason`, `evidence_id` |200 `{work_item:…}`; invalid400, stale409, absent404. |

The retained `PROCESS_ENGINE_ENABLED === "true"` flag otherwise returns404; no flag is toggled here. The new beta surface must use an explicit disabled/unavailable state until configured and implemented, **not enable the old process engine**. The exact compatible route names stay as above. No run-link or handoff HTTP route is asserted from manager discovery.

**Adopted v1 additions:** clients select `X-Allura-Work-Contract: work-plane-compatibility-v1`; every route requires exactly one query `group_id` and `workspace_id` to retain beta's auth-before-body scope resolution. Mutation bodies retain `group_id`, add required `workspace_id` and `operation_key`, and both body selectors must exactly equal the query scope or fail400 without effects. Transition retains required `actor_id` as an exact assertion of the server-resolved principal. Missing/unknown contract selection or malformed selectors return400 `invalid` on an enabled v1 route; disabled/unimplemented routes are404/unavailable, never legacy fallback. Old requests are not silently upgraded or retried. Existing retained-main endpoints are untouched by this document. This is deliberate versioned wire compatibility of route names/model/token/response member, **not a drop-in security or deployment compatibility claim**.

Successful mutation responses retain `work_item` and add `operation_receipt`. `work_item` is the accepted immutable command-time snapshot; exact replay returns that original snapshot and receipt, not today's item. Obtain current state through authorized GET. Existing consumers can continue to find the member, but they must opt into the version and new preconditions; no assertion that every installed legacy client tolerates the envelope. Read responses retain their existing outer members and add no write side effects. Authenticated responses are no-store, with existing gateway body/response/time ceilings and redacted errors.

### Model and status graph

Preserve item `id`, `project_id`, `lane_id`, `group_id`, `title`, `description`, `status`, `priority`, `owner_id`, `team_id`, `acceptance_criteria`, `linked_run_id`, `latest_receipt_id`, `blocker`, `created_at`, `updated_at`, `completed_at`. Add `workspace_id` only as the explicit scoped model extension. Historical IDs are opaque TEXT, **not assumed UUIDs**; no case folding, trimming, UUID conversion or new aliases. Scope's `workspace_id` and authenticated principal use existing beta UUID validation. Unsupported historical identifiers/rows are rejected without rewriting them.

```text
backlog     -> ready | cancelled
ready       -> in_progress | backlog | cancelled
in_progress -> in_review | blocked | done | cancelled
in_review   -> in_progress | done | cancelled
blocked     -> in_progress | cancelled
done        -> (none)
cancelled   -> (none)
```

Priorities remain `critical | high | medium | low`, default `medium`; create defaults `backlog`. Fresh same-state commands are invalid400; terminal states cannot reopen. Exact committed operation replay is not a new graph edge. Terminal commands set `completed_at` to the new accepted token; nonterminal commands retain null. Neither evidence, owner, lane, handoff, memory review, run completion nor Notion edits implicitly change status.

`expected_updated_at` must be the exact received UTC string with six fractional digits, generated by PostgreSQL `to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`. Validate both syntax and actual date; reject offsets, millisecond truncation, normalization and overflow rather than repairing input. It is the **only external CAS token**, not integer `expectedRevision`. Internally choose new time as the later of database `clock_timestamp()` and prior timestamp + one microsecond; serialize it exactly, fail closed on representational overflow. Every successful mutation changing the item advances its token, even within one transaction or after clock reversal. A failed/stale/replayed command does not advance it.

## 4. Exact scope and permission mapping — fail closed

### Owning project/workspace map

A server-owned immutable mapping binds `(authority_instance_id, group_id, project_id)` to exactly one `workspace_id`. `authority_instance_id` is a deployment-owned opaque identity for the sole owning PostgreSQL service/database/schema, never a caller-selected destination. Every item must reference its mapped project under `(group_id, workspace_id, project_id)`; lanes and item-linked references use same-scope composite foreign keys, including the same project for lanes. No group→default-workspace conversion, org-role shortcut, inferred mapping from ID format, first-match selection or automatic legacy import.

An already-owned item cannot be assigned to a second independently writable authority. Initial local tests install **synthetic fixture mappings only**, within a disposable beta DB. Live legacy project mapping/cutover remains separately authorized, with exact item IDs/tokens, foreign references and owner-instance verified before admission; neither running both writers nor remotely wrapping a non-atomic legacy mutation satisfies the contract. Mapping insertion/change has no public v1 endpoint, and production provisioning is outside this packet. A missing/inactive/ambiguous/foreign/unrepresentable mapping is unsupported: authenticated requests receive privacy-safe404 `not_found`, no item metadata or effects. A mapping-store outage is503 `unknown`, not permission to guess a workspace.

All requests supply both group and workspace. Authenticate before bounded selector processing; authorize the requested scope before content lookup; mapping resolution happens under that authorized scope. Lookup with valid scope but foreign/missing resource is indistinguishable404. Absent current scope authority is403 independent of whether an item exists. Only current active mappings participate; mapping ownership is held stable through the command transaction. Frozen mappings cannot be reassigned as an ordinary status transition.

### Actor × operation matrix (new local design, not existing grants)

Use the existing human cryptographic identity and server-resolved `(issuer, subject) → principal` binding; retain mixed human/machine denial, CSRF, post-handler rechecks and expiry. No body/header/email/role string creates identity. `actor_id` must equal the exact resolved stable principal ID or403 `forbidden`; legacy actor aliases without explicit separately admitted mapping are unsupported. Owner/recipient IDs are references, never authority.

Introduce **work-plane-specific explicit entitlements** `work:read` and `work:write`, represented in a scoped server-owned relation keyed `(group_id, workspace_id, principal_id, action)` with active/revoked state. These are new specified entitlements; they are absent from the baseline `Action` union. **Do not add them to existing role defaults, widen machine ceilings or treat them as already provisioned.** The first bounded local slice supplies them only as owner-installed synthetic fixtures. A future entitlement-management/cutover flow requires separately scoped authority; none is added implicitly here.

| Caller / command | Exact necessary authority |
|---|---|
| Human GET/list/current receipt disclosure | Current active principal/binding/tenant/member/unlocked workspace + current explicit workspace grant with role `viewer`, `curator` or `workspace_admin` + active same-scope `work:read`. |
| Human create/transition/link/evidence attachment/handoff send | All read conditions **and** active same-scope `work:write`. Role alone never grants write. No extra admin-title inference. |
| Human acknowledge/reject handoff | Same read/write conditions **and** exact stored `to_actor_id` equals authenticated principal; pending state or exact accepted operation replay. |
| Human replay | Current authority for the original command, including read/write and any linked-evidence access; exact actor/scope/key. A former entitlement does not grant receipt disclosure. |
| Org-only admin, unbound human, revoked/locked scope | Deny403 (or401 invalid/expired authentication); no metadata, domain event or success receipt. |
| Service, device, worker, owner-linked delegated client, selected-only client | Deny all initial work-plane operations; no fallback to human, run-admin, memory, OAuth or inherited owner rights. |

Compatibility integration: ordinary beta roles already include `memory:read`; reuse the existing `scopedTransaction` base identity/membership/grant lock and current-authority machinery with that base action **plus a mandatory work-plane guard** for the explicit entitlements above at gateway/service and independently in guarded SQL. `memory:read` is only an admission prerequisite, never sufficient work permission. Do not alter existing role expansions to make tests pass. Take stable-order authority/entitlement/map locks and recheck after waiting, before effect and disclosure; revocation serialization must work for the new entitlement rows as well as existing authority rows. Every action requires the current human kind at SQL, not just transport. No cache of positive permissions across requests.

## 5. Atomic transaction, conflicts and exact receipts

Use the existing restricted-login, forced-RLS, fixed-search-path, scoped-composite-FK and immutable-table guards. The service owns a short transaction; no human wait, network, executor lease or Notion operation is inside it. No direct client SQL. GUCs remain trusted-server assertions, not independent JWT authentication or protection from a stolen database login.

Required order:

1. Authenticate/validate bounded exact envelope, resolve scope and current base + work authority; begin scoped transaction, lock/revalidate identity/binding/tenant/member/workspace/grant, work entitlements and immutable active mapping in stable order.
2. Serialize `(group_id, workspace_id, principal_id, operation_key)` across **all** work commands. Work namespace is distinct from run/admission and semantic-decision namespaces. Compute the canonical command digest in PostgreSQL over `jsonb::text` UTF-8, SHA256, not client `JSON.stringify`.
3. Locate original receipt in that scope/key. Changed digest gives409 `conflict`; exact digest and current command/resource/evidence authority return original receipt and stored response before present-state stale/terminal checks. A missing receipt means no accepted operation at this authoritative serialization point, not proof that a caller's previously lost request never ran elsewhere; no other authority is consulted.
4. For new commands, lock exact item (or project for create), check scoped existence/links, compare **literal** `expected_updated_at`, validate graph, evaluate finite capacity. Foreign/missing references are404, stale token409, invalid graph/same-state400. Stale is decided before graph validity on an existing item. No racing reread determines errors. Concurrent contenders must see the winner's committed token after waiting.
5. In this transaction write item state/new token, one immutable `work_item_transition` event and one immutable operation receipt/serialized successful response. Record actual old state from the locked item, server actor and exact evidence references; set `latest_receipt_id` to this receipt. Force deferred constraints before final authority/expiry checks and commit. Failure at any write/deferred boundary rolls everything back. Only a confirmed commit may produce success.
6. Recheck current authorization before disclosure, retaining transaction locks through commit; gateway post-handler recheck remains. Revocation winning after commit can deny the response without undoing history. Unknown commit stays unknown until same-key reconciliation establishes a committed original receipt or permits one serialized fresh acceptance. Do not issue a fresh key to hide ambiguity.

Adopted `operation_key`: ASCII `[A-Za-z0-9._:-]{1,128}`, preserved exactly. Digest includes contract version, literal command (`create`, `transition`, `link_run`, `attach_evidence`, `handoff_send`, `handoff_acknowledge`, `handoff_reject`), server actor, authority instance, group/workspace, target/project identity, exact expected token, destination state and all accepted content/reference fields. Strict parsers reject unknown/duplicate object keys, invalid UTF-8/NUL, wrong primitives and unsupported versions. Documented missing optional fields canonicalize to null (create `priority` to medium, criteria to empty array); explicit null is allowed only for documented nullable fields. No string trimming or normalization. The v1 digest is server derived; a caller digest cannot override it.

Receipt schema (immutable; UUIDs are server-generated for **new receipt/event identities**, not forced onto historical work IDs):

```text
operation_receipt = {
  contract: "work-plane-compatibility-v1",
  receipt_id, event_id, authority_instance_id,
  group_id, workspace_id, actor_id, operation_key,
  command, request_digest,
  work_item_id, project_id,
  before_status, after_status,
  before_updated_at, after_updated_at,
  evidence_refs, accepted_at, outcome: "committed"
}
```

For create, `before_status`/`before_updated_at` are null and the receipt binds the one server-assigned item ID; transition binds the exact existing ID. Store normalized receipt JSON text and full successful envelope/HTTP status for stable service replay; HTTP consumers compare parsed JSON without transport header/timing claims. A receipt never becomes a mutable current-status record. Unique receipt/event links and scope FKs enforce one acceptance. UPDATE/DELETE/TRUNCATE of events/receipts is forbidden to application; failed commands write no successful domain event/receipt. Optional denial audit is separate and redacted.

Known rollback may return500 `failed`; connection loss/timeout with uncertain commit returns503 `unknown`, without claiming no effect. Authority-store failures fail closed403; mapping/data-store inability to establish state yields503 `unknown`; finite saturation yields503 `capacity` and known no new effect. Authentication401, insufficient authority/actor403, absent/hidden404, malformed/invalid graph400, stale/key conflict409 remain distinct. Errors contain no foreign IDs, prior status/token, private rationale, grant roster, SQL or source paths. No success audit is best-effort. No synthetic adapter receipt around a remote legacy write is acceptable.

## 6. Link, evidence and handoff boundaries

These model rules govern later13.2 slices; **the first transition slice rejects non-null evidence/link operations as unsupported until their exact resolver is implemented and verified**, with no mutation. It may accept `evidence_id` absent/null, not silently ignore a supplied ID. No invented routes are needed now.

- Every item/project/lane/evidence/handoff reference uses the same tenant/workspace; lanes also share project. Referenced versions/receipt IDs and canonical digests are exact, immutable and preserved. Bare global ID FKs or caller-asserted scope are insufficient.
- `evidence_id` denotes an immutable work evidence packet, not an arbitrary semantic/run ID. An admitted packet binds one same-scope work item and exact source receipt/version/digest refs. Linking a run requires its accepted effect/operation receipt and corresponding evidence, not `run_id` alone or a status string. A semantic link names the immutable reviewed version and decision receipt, not mutable latest. Resolve source read authority as well as work read/write on every initial link and replay; if the exact version or supported scope/authority mapping cannot be established, fail closed. No memory promotion, new run execution or Done inference.
- Retain handoff states `pending | acknowledged | rejected`, distinct from work status. Sender is authenticated; recipient is an exact currently bound human with required same-scope work authority. Only that recipient may acknowledge/reject; no sender/admin shortcut. Initial send and terminal decision each atomically record their own event/receipt. Exact-key replay returns original acceptance; opposite decision or new-key terminal decision conflicts409. Handoff processing never transitions the item automatically.
- Project/owner/team provisioning and editable dependencies are not first-slice endpoints. Historical owner/team labels grant no authority; unresolved owner identity mapping is unsupported, not matched by display/email. Project/lane creation, evidence/handoff API shapes and governance must be specified in their bounded13.2 packets before implementation. This contract reserves command namespaces but does not declare those APIs shipped or complete.

## 7. Finite initial DTO and storage limits

These are adopted local safety defaults, not observed legacy limits or measured SLOs. Do not truncate legacy data to fit. Reject unsupported input; expose honest unavailable state for unsupported existing rows. Retain tighter existing gateway limits: 65,536-byte request, 131,072-byte response, existing admission/time/SQL bounds; do not raise budgets or add dependencies here.

- Opaque work/project/lane/reference IDs: nonempty valid UTF-8,1–256 bytes, no NUL/control characters. Route ID is encoded/decoded once; ambiguous or unrepresentable path encoding denies, never aliases. Scope group/workspace use existing beta validation. Preserve original bytes/case.
- Title1–512 UTF-8 bytes, description nullable up to8,192 bytes, reason nullable up to2,048 bytes; no private text in logs. `actor_id` must exactly match server principal as above. Date tokens require finite years0001–9999 and six fractional digits.
- `acceptance_criteria`: at most32 JSON entries, total16,384 UTF-8 serialized bytes, maximum nesting8; not executable assertions or proof of completion. Evidence reference lists at most16 exact refs; artifact refs are bounded data, never executable paths/URLs.
- List default/max100, minimum1; optional additive `limit` and opaque keyset `cursor` are v1-only. Order `created_at DESC, id DESC`; cursor binds contract, principal/scope/project/filter set, mapping and last tuple. No cross-scope reuse, unsigned caller-supplied cursor authority or offset expansion. Revalidate current scope each page. No snapshot/total completeness promise across concurrent mutations; response size ceiling failure is explicit, never silent truncation disguised as a full board.
- Initial retained caps per workspace:64 projects,256 work items,1,024 accepted work operations;32 lanes/project. Related evidence/handoff objects count toward the same finite operation admission and require their own bounded creation tests before enabling. Count retained terminal objects/receipts, serialize admission, never delete immutable evidence to free capacity. Exact authorized replay remains possible at capacity; fresh operation is refused unchanged. Archival/purge/legal retention is not decided or authorized here.

## 8. Integration dependency discovered at publication

The current gateway is not already compatible with the retained dynamic paths: `foundation/src/gateway.ts:64–76` matches exact static path strings, `:97–101` requires query scope before body, `:53` uses `JSON.parse` (which loses duplicate object keys), and `GatewayReply` at`:19` does not support201 or arbitrary domain-error statuses. Its existing error mapper has no WorkPlaneError. `foundation/src/run-contract.ts:82` pins the actual gateway bytes in the immutable run definition. None of these are changed by documentation.

Therefore the **immediate13.2 slice is the guarded service/SQL transition and authoritative readback**, not a false claim that full wire compatibility can be added through core composition alone. Before the next HTTP slice, parent must admit one bounded gateway-extension packet: preserve every existing route/security/budget behavior; add nonambiguous dynamic path matching and strict work-envelope parsing/typed replies; retain query/body scope equality; prove current work-authority checks; and explicitly reconcile the run pin with a separately adopted immutable definition revision if gateway bytes change. Preserve revisions1–7, their receipt replay and old-executor denial. Do not change a pinned gateway without that revision decision, weaken the pin, create a second gateway/server engine, disguise work errors as unrelated domain errors, or perform per-request gateway construction to evade the shared admission budget. This is an ordinary engineering dependency, not a reopened board/product choice or a license to port main.

The first packet's non-goals include that HTTP/pin extension. A service-only GREEN cannot close13.2, W13-C04 wire witnesses,13.3 or Epic13. The first packet names production-behavior RED and DB proof; the subsequent bounded packet supplies signed HTTP and lost-response proof before any end-to-end acceptance.

## 9. Local acceptance and immediate handoff

| ID | Acceptance requirement |
|---|---|
| W13-C01 | Exact retained route/model/graph/opaque ID/microsecond token compatibility; explicit v1 differences and source-only/live-unverified capability. |
| W13-C02 | One server-owned project/workspace/authority-instance mapping, explicit human read/write entitlements and unsupported mapping denial; no new role or client inheritance. |
| W13-C03 | One atomic state/event/receipt transaction with strict monotonic token, immutable evidence and exact namespace/digest/replay semantics. |
| W13-C04 | Same-token concurrency, stale/key/graph conflict, revocation ordering, foreign references, machine identity, response/log privacy and fault/unknown reconciliation have real registered witnesses. |
| W13-C05 | Scoped run/memory evidence and recipient-bound handoffs remain separate commands; no auto-Done/promotion/Notion write/second engine. |
| W13-C06 | Finite bounds, restricted SQL, current-authority pool safety and recovery/canonical registration; no release claims from local test evidence. |

13.1 adopts C01–C03 and the remaining explicit acceptance contract; it does **not** claim C04–C06 runtime verification. The [Epic13 context](../../implementation-artifacts/epic-13-context.md) supplies the single-writer first13.2 RED packet and narrow file allowlist. A local synthetic slice can proceed after parent admission without a live map; enabling actual legacy data without that map must stop at that exact boundary. No unresolved product choice is disguised as a default: a request for non-human mutations, dual authority, different state graph, automatic promotion or ambiguous live ownership needs a separate explicit decision, not implementation improvisation.
