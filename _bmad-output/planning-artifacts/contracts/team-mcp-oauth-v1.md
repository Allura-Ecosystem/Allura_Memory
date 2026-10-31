# Team MCP local OAuth v1

Status: adopted local engineering contract under the approved Team MCP continuation and direct-build adapter. Not a public issuer, real sign-in, deployment authorization, or member-sharing contract.

## Authority and limits

Sabir's own verified clients retain his legitimate owner content capabilities without a device curator ceiling. Gabe and Sam receive no content by login or team membership: their separate resource/action approvals remain a later implementation gate. This first flow admits only a current workspace administrator authorizing their own connection. It creates an attributable non-human service principal linked to the consenting human, never a translated human JWT or fabricated identity.

Use migration021 unchanged. OAuth application registration client_id and the per-connection service principal client_id are distinct identifiers. Approved actions are the current intersection of requested content actions, human authority and migration021's ceiling: memory:read, memory:capture, evidence:read, proposal:write, review:read, memory:delete, audit:read, health:read. Never issue review:approve or workspace:grants:manage. Consent grants a connection, not new human membership, owner authority or semantic promotion. No automatic workspace sharing.

## Adopted implementation defaults

Defaults here are parent engineering choices, not invented owner decisions: pending transaction and authorization-code lifetime five minutes each; access token fifteen minutes; no refresh. Use cryptographically random secrets with only digests stored. Use a fixed explicitly configured public application registration with exact callbacks and token endpoint authentication method none; synthetic registration exists only in tests. No runtime built-in fake client or human. DCR, CIMD, refresh, public routing and actual client registration are deferred; do not advertise them.

OAuth is absent/disabled by default. Machine-only mode rejects OAuth consent configuration. The authorization HTTP listener binds 127.0.0.1 only on a separately configured non-conflicting port, under the same process lifecycle. Reuse installed SDK Express handlers rather than inventing OAuth parsing or crypto. Declare Express at the observed installed version 5.3.0 and compatible Express 5 types as direct dependencies; preserve all unrelated lockfile resolutions. Normal bounded dependency installation is authorized; no unrelated upgrade.

Configured issuer, resource, consent origin and callback are explicit, validated values, never derived from Host/X-Forwarded headers. External identity origins remain HTTPS. Any loopback HTTP allowance is strictly bounded to protocol test/local transport, never a production DevAuth switch or human signature exemption. Unknown config, malformed URLs, fragments, URL user information, duplicate or reserved scope fields and non-loopback bind requests fail closed. Authorization server cannot become an open proxy or redirector.

## Authorization and human consent

Compose SDK authorizationHandler, tokenHandler and revocationHandler with explicit metadata (authorization_code, code, S256, public-client none). Do not blindly mount mcpAuthRouter: its defaults advertise unsupported refresh/client_secret_post. Omit registerClient and CIMD support. Keep local PKCE validation enabled. SDK middleware is necessary but insufficient: enforce project-specific exact resource/callback policy independently, including at exchange.

Authorize validates fixed registration, callback, scope, resource and bounded S256 challenge/state, creates only expiring pending protocol state, then redirects to the existing human core origin's consent surface. State remains an opaque OAuth round-trip value, not authority. No tokens, content grants or workspace inventory are returned anonymously. Pending entries are bounded/rate-limited, cleaned by expiry without a daemon, and inaccessible by predictable identifiers.

Signed-human consent uses the existing issuer/audience/stable subject verification, mixed-identity rejection and unchanged same-origin protections. The authenticated display binds its transaction and fresh one-use confirmation nonce to that human identity/session context; approve/cancel POST must match the displayed app, callback, workspace and exact actions. Render all untrusted labels as text, not HTML. Reject browser back/replay, swapped subject/workspace/actions and cross-site POST; no machine can approve consent. No cookie/JWT stripping. Consent details are no-store and must not leak through referrers, logs or error responses. Only the intended callback receives a code, after genuine human approval and current permission checks; cancellation never issues one.

The approved code binds digest, client registration, actual exact callback, exact resource, owner, workspace/actions, challenge, expiry and consumed state. Code lifetime starts at approval. SDK loopback-port matching must not permit a different callback at exchange. Secrets are never retained in audit, replay receipts, logs or durable plaintext fields. Lost successful token responses require a new authorization, not replay of stored bearer material.

## Atomic exchange, current authority and revocation

Use SDK form-urlencoded token endpoint and S256 verification. Narrow SECURITY DEFINER functions with fixed search_path, explicit revokes and runtime EXECUTE boundaries provide private transaction lookup/transition; allura_app receives no direct private-table write or owner DB credentials. Reuse devices.ts hash-only SQL input pattern and migration014 locked rechecked issuance, not its device role/grant ceiling.

After SDK validation, one database transaction locks and rechecks code bindings/expiry/unused state, consent, current owner/admin authority, membership/workspace and action intersection. It consumes the code and creates the service principal, membership, delegation and client_bound=true credential atomically. Bind the token to its OAuth registration for revocation checks. Concurrent exchange yields one successful issuance. Lock order must serialize owner/delegation revocation without stale authority or deadlock. Commit/audit failure rolls back consumption and every partial artifact; errors are secret-free. Raw token is returned once after successful commit. SQL callers cannot forge approved human transitions by supplying arbitrary principal IDs; use existing verified scoped transaction context and identity-kind checks.

A resource adapter accepts only a verified OAuth credential bound to this configured resource and derives its group/workspace from durable bindings before invoking the actual core gateway. Reject any conflicting caller scope; preserve all original browser-cookie/Cloudflare-assertion denial. Do not change legacy explicit-scope clients, routes, tool semantics, or five-tool inventory. Scope derivation is not authority: current credential, owner/delegation action checks and RLS remain mandatory on every call.

Token revocation validates registration-to-token ownership and is non-enumerating for unknown/foreign tokens. Human connection revocation disables the delegation and its credentials under current human administration authority. Revoked/expired/narrowed/missing owner, connection or credential must deny subsequent operations, including cached identities. Ordinary clients cannot revoke another connection or administer grants.

## Local protocol-route exception and rollout hold

Explicit local-only exception: when OAuth is configured in an isolated test process, unauthenticated metadata/challenges and OAuth authorize/token/revoke protocol handling are permitted. Metadata/challenges disclose no private content, consent details or workspace inventory. Authorization/token routes issue nothing without valid registration, genuine consent and PKCE. This does not authorize any Cloudflare bypass, public ingress, live policy change or anonymous content. Existing legacy mcp.faithmeats.org/mcp remains untouched. Exact production issuer/edge routing and real callbacks need later verification/authority.

## Evidence required

Use actual SDK HTTP handlers and restricted disposable PostgreSQL; fixture helpers may establish only synthetic humans/workspaces. Obtain tested credentials through HTTP consent/exchange, never by directly inserting them. Exercise actual MCP initialize/list (exactly five tools), authorized capture and receipt read-back, deletion through its existing authorized API, and denied human-only operations. Cover metadata honesty, disabled config, CSRF/mixed identities, consent swaps/replay/cancel, PKCE missing/plain/bad, client/callback/resource mismatch, expired/replayed/concurrent codes, fault rollback, foreign/private helper access, current authority narrowing and all three revocation layers. Verify legacy service/device behavior. HTTP test failures must prove behavior, not missing imports or fixtures.

Canonical harness must discover named nonzero OAuth cases plus all existing lanes. Runtime lifecycle tests must prove listener bind, startup failure cleanup and shutdown, not only a directly imported handler. Never call this installed-client acceptance. DCR/CIMD, refresh/rotation/restart policy, real clients, individual resource sharing, signed-in UX, SSH, rollout/rollback and 6.5/9.4 remain open.
