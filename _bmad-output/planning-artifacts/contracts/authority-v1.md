# Authority and service contract v1

Owner: Brooks, direct self-check under Sabir's 2026-10-26 delegated design/build authority. Specified locally, not deployed or live policy. Sources: current PRD FR-A1/A2/B2/C1/D1, NFR-1/4/8; AD-69; CF-AC01–05; BE-AC01/02; Story 1.2. Prior explicit ENT-01 decision: roles vary by workspace, org admin has no implicit content access (private owner decision receipt 2515cfbc-8e7e-4a7d-9f80-8fdc47cee367, supplied evidence, not freshly retrieved).

## Adoption and candidate corrections

Adopt the supplied private `story-1.2-decisions/resolved-contract.md` §§2–7 with these bounded clarifications. These are delegated engineering decisions, not new historical user mandates:

- Viewer: memory:read only. Curator: memory:read, memory:capture, proposal:write, review:read. Workspace admin: these plus evidence:read, memory:delete, audit:read, health:read, workspace:grants:manage. `review:approve` is a separate explicit human-only entitlement, never inherited from an admin title. Machines get explicit intersected action ceilings, never review:approve or grants:manage. Graph/export require memory:read plus explicit evidence/audit permission when their payload includes those objects. Raw traces require evidence:read (admin by default; curator receives only explicitly linked proposal evidence through review:read). No legacy role string silently maps to a fresh grant.
- Human identity binding is `(issuer, subject) → stable principal`; a binding alone grants no workspace. Server checks explicit workspace grant and tenant membership for the requested selector. This generalizes the old one-active-workspace model without auto-linking email.
- Involuntary identity/security revocation must never be blocked by last-admin protection. Guard voluntary demotion/removal/transfer while workspace stays active; external loss can orphan it. Deletion of an already locked workspace is a separately governed lifecycle action, not a reason to retain a compromised administrator.
- Orphan recovery requires a different active human nominee, nominee acceptance and current orphan recheck in one serialized activation. No content is exposed to initiator. One recovery wins. A pending invitation is not an active administrator. The candidate's immediate recovery grant would otherwise skip its invitation consent rule.
- Org-admin metadata is tenant-local and allowlisted: workspace ID/name/created-at/active-or-locked, creator display identity, grant roster's organization display identities/role/action identifiers/status/issuer/times, active grant-admin count/orphaned, invitation/request counts/status/times, content-free access-control audit actor/target/action/time/outcome. No description, request reason, content/counts, graph, evidence, content-bearing audit or health internals. This is an explicit metadata exception, not a content grant. Cross-tenant requests return no roster/name/counts.
- Grant administration cannot assign a human promotion entitlement to oneself, or turn a service into a human. A currently authorized human grant administrator can assign that explicit entitlement to a different human. The product's independent decision check still applies to every proposal.

## Identity and current authority

Human transport accepts a signed Cloudflare Access application JWT only: RS256, issuer-owned keyset, exact HTTPS team issuer/application audience, finite integer iat/exp, exp > now, iat <= now, exp > iat, optional nbf <= now, nonempty sub and email, type=app. Reject none/HS algorithms, attacker key URLs, unknown/ambiguous key or binding, malformed/oversized claims, service-token markers, absent/forged/conflicting header/cookie tokens. Email is display only. No DevAuth in this fresh runtime, no header-based identity and no origin bypass. Unsafe human requests require exact configured Origin and same-origin Fetch Metadata. Login targets must be relative, non-control, non-backslash, non-protocol-relative and not an auth loop. Live MFA/session revocation/origin protection needs separate CF-AC05 deployment evidence.

MCP/service/device credentials use a separately verified opaque credential or distinct issuer/audience, with server-side stable binding including identity kind, tenant/workspace ceiling and expiry/revocation. Worker is a distinct non-human principal with lease/action ceiling. Browser JWT never becomes a machine credential, and machine verification never produces human identity. Anonymous requests can access coarse liveness only, not storage or diagnostic details.

Every protected operation resolves active principal, active tenant membership, matching tenant/workspace, unlocked workspace, explicit active workspace grant, action and machine ceiling from current server state. Lookup errors fail closed. A caller selector narrows choice only; no default tenant/workspace. Recheck immediately before mutation and before disclosure; DB transactions enforce current authority independently. Never cache positive membership across requests. Requester/producer actor IDs derive from authentication, not supplied JSON. Strip/ignore all x-allura-* and forwarded identity claims. Tenant namespace syntax is validation, not authorization.

## Tool/route matrix (fresh logical contract, not deployed routes)

All bounded services are owned by Brooks/Woz. Each uses the authority context above; outputs cannot contain a foreign identifier, count, cursor, cache entry, citation, error detail or timing-derived metadata. Absence/foreign resource uses one privacy-safe not_found shape after authentication. Uniform denial envelopes are required; statistical timing resistance needs measured deployment evidence, not a constant-time claim.

| Surface | Identity/action | Service | Positive / negative / error acceptance owner |
|---|---|---|---|
| memory_add (MCP only) | MCP/service/device + memory:capture | Capture | scoped immutable event/receipt; forged/foreign scope writes nothing; index outage does not undo capture (3) |
| memory_search | human or machine + memory:read | Retrieval | current permitted provenance; no foreign/deprecated results or broader fallback; partial store truth (5) |
| memory_get | human or machine + memory:read | Retrieval | exact permitted record; hidden/missing identical; no confidential provenance without evidence grant (5) |
| memory_list | human or machine + memory:read | Retrieval | bounded scoped page; cursor scope/version checked; revoked or fabricated cursor denies (5) |
| memory_delete | human or machine + memory:delete | Lifecycle | deletion event + lifecycle deprecation, never erase; foreign denial; atomic rollback (4.4) |
| human decision | human + review:approve | Review | exact reviewedProposalVersion positive integer, proposalId, operationKey, decision, nonempty rationale/evidence; independent actor not requester/producer; no-write stale conflict; scoped immutable replay (4.1/4.2) |
| scoped audit read | human + audit:read | Audit | scoped event projection only; org title gives none; fail closed on lookup/store error (2/6) |
| scoped health read | human + health:read | Operations | stage/source/time + observed status, redacted; no foreign/provider internals; unknown on missing evidence (6) |
| anonymous liveness | none | Transport | coarse process up only; never readiness/DB counts (2/6) |
| grant/invite/request/recovery | human + workspace:grants:manage, or tenant org_admin only for metadata/recovery | AccessControl | explicit target grant, no self-change, last-admin/acceptance guards; serialized audit; no implicit content (2) |

Review rejects machine identities, self-review (requester or producer), missing explicit human entitlement, absent rationale/evidence, stale proposal version and invalid scope. Replays must still recheck present access and scope; immutable decision-time receipt is never rewritten to show current delivery status. Product requirement for independent HUMAN decision is unchanged by removal of code review.

## Workspace lifecycle and consent

Creation requires explicit organization workspace:create authority and a named active human initial admin. Human creator may name self once at creation; service creator must nominate an existing consenting human (server-owned enrollment acceptance). Atomic workspace+grant+access audit, no zero-admin successful creation. No implicit org-wide content grant.

Ordinary grant changes need one currently authorized human workspace admin, distinct target, exact requested state revision and immutable access-control audit. Existing grant changes, invitations, access requests and revocations use the same authorization core. No self-elevation/demotion/revocation after bootstrap. Last-admin transfer locks workspace and activates an accepting successor before predecessor loses grant. Security revocations always take effect; orphan recovery handles involuntary loss.

Invites: pending/accepted/declined/revoked/expired; pending grants nothing. Invitee accepts/declines seeing workspace name, proposed role/actions, inviter, state and configured expiry. Acceptance rechecks inviter, target membership, lock, revocation and current state. No automatic expiry period is chosen here. Access request: exact known selector, role/actions/reason; no workspace enumeration. Requester sees pending/approved/approved-with-changes/denied/cancelled/unavailable. Authorized admin may narrow access or deny with safe category; request reason is private to grant administrators. Terminal notification is an in-product event, not authorization to send external messages. No active approver means unavailable, not auto-grant. Only an actual orphan permits org-admin recovery. Repeat requests require changed information, no invented cooldown.

Audit success and mutation commit together; denied actions have no domain mutation and may emit separate sanitized denied-request audit without private supplied reason. Failure to persist required success audit rolls back the domain mutation. No grant/role config is changed by this specification.

## Outcome and resource boundaries

unauthenticated: before protected work; forbidden: valid identity lacks current action, no domain effect; invalid: malformed bounded input; not_found: hidden/missing indistinguishable; conflict: stale/key/base/version/self-change/last-admin, no domain effect. failed means known rollback/no commit; unknown means commit/remote result cannot be established; partial means named stages differ; succeeded names the actual completed stage only. Persistence, indexing, proposal, human promotion and optional projection remain distinct. Immutable decision/capture receipt records decision-time facts. Mutable observations never rewrite it. `synced` requires authorized destination read-back, not HTTP success.

Authenticate before reading request bodies or expensive work; bounded credential parsing is the only preauth computation. Streaming ceilings apply even without Content-Length, slow/chunked input is cancellable, invalid limits reject rather than broaden. Do not trust forwarded IP for quotas. Finite body/query/results/concurrency/time budgets are decided and tested in 2.3/6.1, not product SLO claims. AD-68 telemetry names/retention/destination stay in 6.1; AD-65 replay in 3.1; AD-66 vector identity in 5.1; AD-67 correction in 4.3.

## Read-only consumer inventory and compatibility

Observed in retained sources: agent MCP five-tool consumers (PRD §3); API readers and optional human curator UI (Blueprint BP-F10–20); SDK/CLI distribution intent (FR-F1); device clients (AD-69); optional Notion projection (DOC-07); Bumblebee bounded ingestion (FR-F4). No active product package/routes survive this beta baseline, only foundation tooling. Installed/deployed consumer versions and remote schemas are unverified; do not deprecate or roll out a breaking change. Story 6.2 must inventory exact installed consumers and exercise packed clients. User-supplied userId/group/workspace remain selectors only, never identity. New local versioned contracts do not claim old-consumer compatibility.

## Self-check and handoff

Story 1.2 AC1: matrix covers five tools, decision, audit, health, owner and failures. AC2: explicit cryptographic and current-state boundary including CSRF, no email/role minting. AC3: ENT-01 supplied owner disposition preserved; exact-version independent human review separate. AC4: stage truth and receipt/observation separation. AC5: observed versus unknown consumer inventory and bounded ingress requirements. AC6: direct owner threat inspection replaces independent development review per current user instruction; no independent reviewer ran.

Candidate defects corrected: ambiguous raw evidence role, consent-skipping recovery, last-admin guard blocking emergency revocation, implicit review role escalation, workspace-create permission unspecified. No unresolved critical authority choice remains for 1.3/2.1. Runtime tests remain required: signed JWT negatives; current membership/grant/lock/revocation; two tenants/workspaces; org-only admin; same-person multi-role; machine-as-human; self/stale review; orphan concurrent recovery; last-admin transfer; foreign metadata; no body work preauth; rollback/lookup failure. Subsequent stories implement these, not this document.
