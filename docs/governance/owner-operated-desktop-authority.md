# Owner-Operated Desktop Authority

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Defer to current code, server-verifiable grants, canonical decisions, and explicit human approval; this policy document does not provision access or prove implementation.

**Status:** Approved by platform owner Sabir Asheed on 2026-10-14
**Applies to:** Allura desktop clients, MCP credentials, agent prompts, and memory-routing policy

## Decision

Sabir's authenticated personal desktop is an **owner-operated control surface**. It must not force Sabir to repeat a magic approval sentence for an ordinary, reversible action he already requested in the current authenticated session.

Platform ownership, tenant membership, and dangerous-action approval are separate controls:

1. **Platform ownership** lets Sabir administer identities, grants, routing, and policy.
2. **Tenant authority** still comes from an explicit server-verifiable tenant/workspace grant. Owner status is not a wildcard and never disables tenant enforcement.
3. **Action approval** still applies to destructive, external, irreversible, or regulated actions. It must describe the concrete action and scope; reusable approval phrases are forbidden.

## Owner desktop operating rules

- A direct instruction from Sabir in the current authenticated desktop session authorizes the stated ordinary read or append-only memory write when the target is already in the desktop principal's allowlist.
- Do not ask Sabir to paste or repeat wording such as “I approve writing …” when his instruction already names the action and destination.
- If Sabir explicitly names `allura-system` for an ordinary system-level reflection or decision, the desktop may write it without a second approval phrase when its active credential permits that destination.
- `allura-system` is not the default home for mixed-team business content and must never be used as a fallback after a denied tenant write.
- The target home for joint Team RAM/Team Durham reflections is an owner-private aggregation workspace, provisioned only after its identifier, ownership, readers, and source-to-destination transfer rules are verified. `allura-sabir-asheed` is a candidate, not an assumed grant.
- A reflection may summarize material already present in the current conversation or in sources the active principal was authorized to read. It must not imply that an inaccessible tenant was queried.
- Every cross-team reflection must record `requested_by`, `principal_id`, `destination_group_id`, `source_tenants`, and whether each source was read live or supplied in-session.
- Read authority in a source plus write authority in a destination does not itself authorize copying. A server-validated transfer envelope must bind owner, executing principal, task, sources, destination, operation, content class, expiry, and request identifier.
- Never silently redirect a denied write. If the requested destination is not allowed, report the exact missing grant and the administrative remediation path without treating a new phrase as authorization.

## Explicit owner-delegation model

The target product model is a device-bound, revocable **owner delegation envelope**:

- principal: `chatgpt-desktop`
- human owner: Sabir Asheed
- device binding: Sabir's registered desktop
- allowed tenants: an explicit non-wildcard allowlist
- allowed workspaces: explicit per-tenant bindings
- allowed actions: least-privilege scopes per tenant
- expiry/revocation: server-enforced and auditable
- default destination: none; once provisioned, defined mixed-team record types may target the owner-private aggregation workspace

The desktop may gain access to additional non-Xterra tenants only through an authenticated grant change. A local username, localhost origin, owner name in a prompt, or client-supplied role never grants authority.

## Permission matrix

| Principal | Normal access | Limits |
|---|---|---|
| Sabir owner session | Administers non-Xterra identities, grants, policy, and explicit owner-desktop delegation | Dangerous actions keep their own gates; no implicit data-plane wildcard |
| `chatgpt-desktop` owner delegate | Explicitly enrolled non-Xterra tenants/workspaces and only granted scopes | Device-bound, revocable, audited; no silent destination change |
| Gabe / Jeeves | Gabe/Jeeves-owned sources and explicitly shared Faith Meats or Measured Course workspaces | Cannot inherit Sabir's owner delegation or access owner-private records |
| Team RAM / Team Durham agents | Their assigned tenant/workspace and current task scope | No owner authority; cross-team outputs use an authorized handoff or system reflection |
| Xterra agents | Xterra-only profile, credential, workspace, and storage path | No access to FM/DD/Team/System data unless a separately approved one-way artifact is created |

## Xterra hard wall

`allura-xterra-health` is excluded from every owner-desktop broad route, shared manifest, cross-team search, reflection source, cache, embedding job, export, and audit payload containing business content.

Legitimate Sabir access to Xterra must use a separate Xterra-authorized profile and credential. No owner delegation envelope may include both Xterra and non-Xterra tenants. Copying or summarizing content across this boundary requires a separately approved, content-specific transfer workflow; routine agent memory operations must deny it in both directions.

## Actions that still require a concrete approval gate

- destructive deletion or irreversible mutation
- token minting, rotation, revocation, or scope expansion
- governance-policy changes after this approved baseline
- canonical promotion when a mandatory-review category applies
- bulk export or external sharing
- contracts, money movement, regulated claims, or production release
- any content-specific Xterra boundary transfer

Approval must bind the actor, action, target tenant/workspace, intended effect, and expiry or one-time use. The system must not accept a reusable sentence as a credential.

## Migration plan

1. Apply this policy to the owner desktop project instructions immediately.
2. Keep the existing server tenant check unchanged and fail closed.
3. Verify and designate an owner-private aggregation workspace, its owner-only readers, and its retention/classification rules.
4. Replace single-tenant desktop routing with signed, device-bound finite grants plus a bounded cross-workspace transfer envelope; do not add wildcard tokens.
5. Enroll only the non-Xterra tenants Sabir chooses, with explicit per-tenant workspaces, scopes, and permitted information flows.
6. Keep Xterra on a separate profile and credential path with no shared cache or manifest.
7. Add UI that shows current principal, device, tenant, workspace, scopes, transfer authority, and reason for denial.
8. Remove magic-phrase approval prompts. Use action-specific confirmation only where a real risk gate requires it.
9. Audit every grant or envelope change and every cross-team reflection; verify append-only write/read-back and idempotency.

## Rollback and write verification

If canary verification fails or authority is broader than intended:

1. Stop new cross-workspace operations and disable the new aggregation route.
2. Revoke the new finite grants and transfer envelopes, then restore the prior tenant-bound desktop configuration.
3. Preserve append-only receipts and existing records for audit; rollback does not erase or silently relocate them.
4. Re-run fail-closed tests for Team RAM, Team Durham, the aggregation workspace, sibling workspaces, and Xterra.
5. Leave pending writes unresolved and visible. Never redirect them to `allura-system` or another destination during rollback.

Every write uses a task-scoped idempotency key. Success requires read-after-write verification of the destination, executing principal, record identifier, expected content marker or digest, and receipt. A timeout or ambiguous response is `pending/unknown`, not success; any retry reuses the same idempotency key and destination.

## Acceptance tests

- A Sabir-directed append-only write to an already authorized destination succeeds without a second approval phrase.
- A Sabir-directed system-level reflection explicitly naming `allura-system` writes there with source and destination metadata and no second approval phrase.
- Once provisioned, a joint Team RAM/Durham reflection defaults to the owner-private aggregation workspace only when its source-to-destination transfer is authorized.
- A direct Team Durham read/write fails until the desktop has an explicit Durham grant.
- A denied Team Durham action never silently becomes a system or aggregation write.
- Gabe/Jeeves cannot use Sabir's owner delegation or retrieve owner-private reflections.
- Forged owner names, localhost requests, expired/revoked credentials, replayed approvals, and destination tampering fail closed.
- A newly created non-Xterra tenant is inaccessible until explicitly enrolled.
- Xterra access fails from every non-Xterra owner-desktop route, including search, cache, embeddings, promotion, exports, and content-bearing audit views.
- Destructive actions, policy changes, token changes, external sharing, and mandatory-review content still invoke their separate gates.
- Retried append-only writes are idempotent and produce one verifiable receipt.

## Rejected designs

- wildcard tenant access for a human or agent token
- disabling tenant checks because Sabir owns the platform
- treating `allura-system` as an automatic fallback destination
- reusable “I approve …” phrases as authority
- one shared token for Sabir and Gabe
- any mixed Xterra/non-Xterra credential, manifest, cache, or retrieval path
