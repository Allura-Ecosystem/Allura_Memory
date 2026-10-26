# Epic 29 — Desktop Device Pairing and Persistent Authentication

> [!NOTE]
> **Historical contract plus current acceptance plan.** Original 29.1–29.21 and the 2026-09-13 `accepted-with-open-items` evidence are preserved. Current canonical [AD-69](../../../docs/allura/RISKS-AND-DECISIONS.md#AD-69-cloudflare-access-replaces-clerk) approves Cloudflare Access migration intent. Historical Clerk B1 remains provider-specific evidence; restoring Clerk is **not** a close condition.

## Outcome

An authorized user signs in through the approved current identity path, approves a desktop device, and reconnects through OS-keystore proof of possession and short-lived MCP tokens. Tenant, workspace, role, lock mode, and scope stay server-derived on every exchange.

## Historical story register

| Story | Preserved contract | Historical disposition/current limit |
|---|---|---|
| 29.1 | Schema foundation | Historical done; migration/deployment unverified now. |
| 29.2 | RFC 9421 / RFC 9530 signing envelope | Historical done. |
| 29.3 | PKCE, authorization code, completion nonce | Historical done. |
| 29.4 | Enrollment API | Historical done. |
| 29.5 | Approval API | Historical done. |
| 29.6 | Completion API and pairing proof | Historical done. |
| 29.7 | Challenge API and RLS bootstrap | Historical done. |
| 29.8 | Scope derivation and atomic authority revocation | Historical done. |
| 29.9 | Exchange API and short-lived token mint | Historical done. |
| 29.10 | Paired-device cache bypass and principal context | Historical done. |
| 29.11 | Offline and key-loss failure behavior | Historical done. |
| 29.12 | Rotation staging | Historical done. |
| 29.13 | Rotation activation and grace state | Historical done. |
| 29.14 | Recovery-only grace path | Historical done. |
| 29.15 | Device revocation and mark-lost | Historical done. |
| 29.16 | Transactional device audit | Historical done. |
| 29.17 | Credential-leak scan | Historical done. |
| 29.18 | Unit evidence suite | Historical done; current suite not rerun here. |
| 29.19 | PostgreSQL integration evidence | Historical done; current restricted-role proof not rerun here. |
| 29.20 | **Clerk browser-to-desktop E2E** | Historical scaffold/contract done; old B1 Clerk runtime acceptance deferred. Preserve as historical provider-specific evidence; do not restore Clerk. |
| 29.21 | Platform secure-store contracts | Server/client contract historically done; B2 real macOS/Windows/Linux adapter acceptance deferred. |

## Provider correction and authority boundary

- AD-69 makes verified Cloudflare Access identity plus Allura membership the current production intent; production acceptance must use the applicable `CF-AC` rows and current identity mapping/origin protections.
- The original 29.20/AC-28/B1 wording proves only what the old Clerk-specific plan required and lacked. It remains auditable history, not a current provider mandate.
- DevAuthProvider is acceptable only in explicitly approved development evidence and cannot satisfy production identity acceptance.
- 29.21/B2 remains provider-independent: private keys must remain in real platform secure stores, with recovery/revocation/rotation behavior exercised on supported clients.

## Current remaining work and next actions

1. **Reconcile provider-specific interfaces:** map original enrollment/approval/completion assumptions to AD-69 Cloudflare issuer/audience/identity and current Allura membership without weakening device proof, PKCE/state, or server-derived scope.
2. **Cloudflare acceptance:** prove `CF-AC01–05` as applicable on the reviewed deployed revision: verified identity, origin protection, group/membership scope, revocation/lock/removal, and safe denial. Source-local migration intent is not deployed verification.
3. **Server/device contracts:** rerun current 29.1–29.19 acceptance against restricted roles, RLS, replay/concurrency, revocation, audit redaction, rotation, and unknown outcomes.
4. **Real secure-store proof:** identify the supported desktop client repository/platform targets and execute 29.21/B2 on real macOS/Windows/Linux adapters as claimed; mocked/server-only tests do not satisfy it.
5. **Publication/review:** establish exact merge ancestry for applicable historical work, final-diff independent security/maintainability review, required CI, deployment, and rollback evidence.

## Current close conditions

A current present-tense claim requires exact-revision server, migration/RLS, revocation/concurrency, audit, CI, review, and deployed runtime evidence. Identity acceptance follows AD-69/Cloudflare Access and applicable `CF-AC` rows—not Clerk restoration. Platform persistence requires real secure-store adapters. Skipped tests, historical prose, source scaffolds, or server-only mocks are not passes.

## Historical evidence

The 2026-09-13 retrospective recorded 21 story files done and `accepted-with-open-items`, with B1/B2 and push/PR/CI/review open. It also described the branch as unpushed at that time. Those are bounded dated claims, not current merge/deployment state.

No application, schema, identity configuration, deployment, status, Brain, Notion, commit, or push change is authorized by this plan.