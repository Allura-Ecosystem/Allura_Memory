# Story 13.1: Route and Authorization Contract Reconciliation

**Status:** partially-verified — 2026-06-12
**Priority:** P0
**Source:** Epic 13, Stories 11.5 and 11.8, F41, F47, F48, RK-19

> **Evidence (2026-06-12, Team RAM / Claude CLI):** Stories 11.5 and 11.8 fixed
> together. Route parity (2/2) and permission profile (6/6) suites pass together
> in the default lane. One typed adapter registry drives the canonical routes,
> tests, and the new contract-surface pages. Anonymous → `401`, authenticated
> forbidden → `403` proven. Runtime smoke: 15/15 routes HTTP 200 with expected
> headings, no error markers. **Remaining:** full tenant-identity propagation
> proof across runtime-profile boundaries (the auth-header-injection middleware
> was deleted by a preserved user change), documented legacy redirects, and an
> interactive browser smoke journey (only HTTP/HTML smoke was captured).

## Story

As an Allura operator, I need navigation and authorization to follow one tested
contract so that web, API, and future desktop clients behave consistently.

## Acceptance Criteria

- [ ] Stories 11.5 and 11.8 corrections are completed as one integration slice.
- [ ] One typed route registry drives navigation, commands, tests, and deep
      links.
- [ ] Anonymous requests receive `401`; authenticated forbidden requests
      receive `403`.
- [ ] Tenant identity propagates across route, API, and runtime-profile
      boundaries.
- [ ] Redirects or removals for legacy routes are documented.
- [ ] Route parity and permission-profile tests pass together.
- [ ] A browser smoke journey proves the integrated behavior.

## Verification

- Run focused route/auth tests.
- Start the dashboard and execute anonymous, denied, and allowed journeys.
- Record route, status, tenant, identity, source, and receipt evidence.

