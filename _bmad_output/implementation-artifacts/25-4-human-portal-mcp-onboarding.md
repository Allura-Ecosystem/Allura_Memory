# Story 25.4 — Human Portal & MCP Connection Onboarding

**Status:** done
**Owner:** Troy
**Depends on:** 25.2b authenticated session entry point
**Tenant:** `allura-faithmeats`

## User Outcome

A human can sign into a governed portal, understand that `/mcp` is a machine endpoint rather than a website, create and manage a least-privilege MCP credential when authorized, and receive client-safe connection guidance without the portal ever retaining or re-displaying the raw credential.

## Authority Boundary

- `/mcp` remains the machine transport. This story does not alter its protocol, authentication, Cloudflare policy, database schema, or production containers.
- Browser identity, role, group, and workspace are derived from Clerk/DevAuth server context only; query/body values are never authority.
- Existing server-owned routes stay canonical: `GET /api/workspaces`, `GET|POST /api/tokens`, and `POST /api/tokens/:id/revoke`.
- The raw MCP token can appear only in the successful `POST /api/tokens` response and a transient client-side one-time-display state. Never URL, localStorage, logs, analytics, SSR HTML, or token-list responses.

## Acceptance Criteria

- [ ] A protected `/portal` route renders only after server-derived viewer authority and identifies the portal as the human entry point.
- [ ] The portal clearly separates Cloudflare Access identity from the Allura MCP credential and states that both are required for remote MCP connections.
- [ ] A viewer can see honest connection guidance and is told when an administrator is required to issue a credential.
- [ ] An administrator can select only a server-returned workspace, issue a bounded MCP token through the existing API, copy it once, and see it cleared from the UI when dismissed or replaced.
- [ ] Token inventory exposes only the existing safe public projection; revoke uses the existing admin route.
- [ ] No route or API introduces caller-supplied group, role, workspace authority, raw-token persistence, new data schema, Cloudflare mutation, secret change, or live-stack action.
- [ ] Route/component tests prove the authority, non-persistence, and secret-free connection-guide contract.

## Test Contract

- Focused Vitest route/component contracts: protected route declaration, server-owned page guard, public-safe connection guide, one-time token display and dismiss behavior.
- Existing hosted token/workspace API tests continue to cover server-side authorization and token-hash exclusion.
- No database migration or live database test is required unless implementation changes a schema or repository contract.
- Final gates: focused tests, relevant auth/API regression tests, TypeScript, diff hygiene, static secret scan, production build, independent `bmad-code-review`, Allura governance check, local commit only.

## Documentation Updates

- This story file and `sprint-status.yaml` track the reopened human-access work.
- Portal guide copy must state deployment/Cloudflare prerequisites honestly; it must not claim public availability until a separate approved launch gate is completed.

## Active Execution Ledger — 2026-09-09

- **Baseline:** `b94f1f35` (verified Epic 29 Story 29.7 local checkpoint).
- **State:** ready-to-commit.
- **Last receipt:** final independent BMAD review PASS (0 BLOCK/HIGH/MED) after tenant-scoped revoke remediation; repository revoke 1/1, hosted admin route 8/8, TypeScript, diff hygiene, scan, and 59-page production build pass.
- **Next named gate:** local-only verified Story 25.4 commit; then assess human portal deployment prerequisites separately.
- **Required receipts before review:** focused suite, relevant auth/API regression suite, typecheck, diff hygiene, static secret scan, production build.
- **Review/commit gate:** independent BMAD review with no BLOCK/HIGH/MED; governance check; local commit only.
- **Guard:** no push, deployment, DNS/Cloudflare Access mutation, secret change, production database mutation, or shared Allura container action.
