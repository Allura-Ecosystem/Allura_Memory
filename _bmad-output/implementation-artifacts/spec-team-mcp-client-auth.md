---
title: 'Team MCP: delegated-client authority gate'
type: feature
created: '2026-10-30'
status: draft
route: dispatch
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/authority-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Enable the fresh beta for private Faith Meats team use through Gilliam/Hermes, ChatGPT Desktop and Claude Desktop, without confusing OAuth consent with Allura semantic approval. First establish an explicitly authorized client delegation and scoped read through the actual gateway. This intermediate slice does not close the complete client/capture/deployment goal.

### Owner's corrected access policy

Sabir's controlling correction: “no theses are my accounts should not limited gabe however should only have access to things i approve same with sam”. Sabir's verified personal client connections must preserve his full owner access to his Allura data and owner-authorized workspaces; do not impose an additional read-only or restricted-member ceiling merely because he connects through ChatGPT, Claude or Hermes. An initial read-only test slice is implementation sequencing, not his final permission level.

Gabe and Sam are separately identified restricted members. Default deny: each may access only the data/resources and actions Sabir explicitly approves for that individual. Sharing with Gabe does not share with Sam, or vice versa. Team membership or successful Cloudflare login alone grants no content access. Do not automatically share an entire workspace when Sabir approved only particular content. Approval, narrowing and revocation must be enforced server-side across every client.

Owner access is not anonymous access, access to unrelated tenants, shared credentials, fabricated identity or permission for an AI client to impersonate a human semantic approver. Preserve genuine-human decision requirements while exposing Sabir's full legitimate owner capabilities through the appropriate surfaces.

## Boundaries & Constraints

Always preserve stable identity, explicit workspace grants, current owner authority, action ceilings, revocation and independent human semantic approval.

Never impersonate a machine using a human JWT, distribute Troy credentials, weaken browser CSRF checks, authorize from email alone or expose memory anonymously. No legacy-to-beta substitution, automatic promotion/capture schedules, sixth tool, default memory_get change, live grants or endpoint cutover from local tests.

## I/O & Edge-Case Matrix

| State | Required behavior |
|---|---|
| Genuine consent and current workspace authorization | Distinct attributable client authority; scoped read initially |
| Sabir's verified own connection | Preserve owner access to his data; no extra restricted-member ceiling imposed by client type |
| Gabe or Sam with no Sabir approval | Deny content access, even after successful team login |
| Sabir approves a resource/action for Gabe only | Gabe gets exactly that access; Sam remains denied |
| Sabir narrows or revokes a member's access | Enforce current approval on subsequent requests; no stale client grant bypass |
| Capture without explicit action authorization | Deny |
| Wrong/replayed/expired code, client, redirect, resource or PKCE | Reject without issuance or identity disclosure |
| Removed owner membership, revoked grant/client, workspace lock | Immediate denial |
| Browser credential on machine path | Existing denial remains |
| Anonymous discovery | Only an explicitly adopted protocol-metadata exception |
| Foreign workspace/receipt or privileged action | No disclosure, promotion or grant administration |

</frozen-after-approval>

## Current continuation — selected client backend

Human selected-version sharing is locally verified and committed as d4bc73f954624626c2c58e0494d15a51065e1a3a (parent385 tests/5033 Bun assertions). Next bounded dependency is `spec-team-mcp-selected-client.md` and `selected-client-v1.md`: separate selected-only self-consent/client capability and explicit selected mode on existing memory_get. It creates no workspace grant and leaves existing default reads/owner consent untouched. Member browser UI and actual installed-client/hosted/human acceptance remain following gates; this broader draft is not closed.

## Prior continuation — selected-version approval

Sabir explicitly approved reviewed-version-only sharing: each recipient separately, read-only first slice, new approval for later versions and no implicit related content. Owner access remains unchanged. Local owner authority, OAuth foundation, discovery and browser consent are committed through ace4f3fcf8c772cf8705944ba17bd8d36316a83a. The next dependency is `spec-team-mcp-selected-version-sharing.md` and its `selected-version-sharing-v1.md` contract. It deliberately implements human approve/revoke/exact-read before member MCP; it does not close this broader draft. SSH is no longer a task or blocker under the user's later epics-only correction. The older gates, code map and implementation notes below are original planning evidence, not current implementation claims.

## Remaining integration gates (historical initial plan)

Sabir explicitly continued the goal after correcting the owner/member policy. The first dependency-ready local build is specified in `spec-team-mcp-owner-client-authority.md` and is active with one Woz source writer. It implements owner-linked authority without adding public routes or issuing live OAuth tokens, so those later integration gates do not block this slice. Do not repeat the rejected uniform restricted-member approval question. Exact OAuth issuance/metadata topology, member content-sharing enforcement and genuine installed-client/deployment evidence remain required before rollout; no fabricated consent, broad live grant or guard weakening follows from continuation.

## Code Map

Under `foundation/`:
- `src/authentication.ts:25–59`: separate signed human and opaque machine credentials.
- `src/gateway.ts:83–104`: human CSRF, mixed-identity denial, repeated scope/action checks.
- `src/mcp-api.ts`, `capture.ts`: five tools, distinct routes, machine-only capture.
- `src/core-config.ts`, `core-api.ts`: strict config/routing; no OAuth server.
- `migrations/013-device-authority.sql`: current-owner attenuation and locking to reuse only through an explicit contract.
- `migrations/014-device-lifecycle.sql`, `src/devices.ts`: human-only enrollment is not back-channel OAuth issuance.
- `src/consumer-client.ts`, `consumer-package/README.md`: bearer/stdio support is not hosted-client OAuth.

## Tasks & Acceptance

- [ ] Specify issuer/edge topology and principal/issuance rules under `planning-artifacts/contracts/` against the corrected owner/member policy before coding. Record technical defaults separately from user decisions; prefer established OAuth components. Support member approvals at the actual resource granularity, not a broader inferred workspace grant.
- [ ] Bind exact client/resource/callback/workspace/action and current permission checks. Define concurrent exchange, expiry, revocation and credential redaction tests.
- [ ] Dispatch one Woz vertical slice with exact allowed files: behavioral RED, minimum GREEN, canonical registration of real DB cases.
- [ ] Parent reruns focused tests, typecheck/lint and applicable canonical DB/browser gates on final bytes. Current adapter requires direct self-checks, not developer-review ceremonies.
- [ ] Leave final acceptance open for real clients, explicitly authorized capture/receipt read-back, isolation/revocation, deployment SSH and rollback. Read-only synthetic tests are not completion.

## Implementation Notes

Scout reconnaissance and parent source checks found the missing authority contract. Official Cloudflare documentation confirms Managed OAuth forwards a human assertion; enabling it alone cannot satisfy the current machine route. No application changes started.

Baseline rerun: 17 pass, 0 fail, 154 assertions. Bare `bun` initially failed because PATH lacked the installed toolchain; using the pinned toolchain passed without install/version changes. Evidence and source registry: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/CLIENT-AUTH-DECISION.md` and adjacent `client-auth-sources.json`.

## Spec Change Log

- User correction: replaced the proposed uniform per-user restricted-access framing with Sabir full owner access and separate, explicit Sabir-approved access for Gabe and Sam. Added owner/member, independent sharing and revocation acceptance cases. This is a specification correction, not a live permission change or implementation receipt.

## Review Triage Log

## Verification

From `foundation`, prefix PATH with `/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline` and `/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin`.

- Baseline: `bun run check:toolchain && bun test ./tests/authority.test.ts ./tests/gateway.test.ts ./tests/core-config.test.ts`.
- Build gates: focused behavioral tests, `bun run typecheck`, `bun run lint`, canonical `bun run test:db` for issuance transactions (no selection overrides/skips).
- `git diff --check`; verify unrelated baseline files and existing runtimes remain untouched.
