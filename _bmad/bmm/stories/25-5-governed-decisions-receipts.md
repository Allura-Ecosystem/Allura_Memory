# Story 25.5 — Governed Decisions and Receipts

**Status:** Planned / blocked
**Owner:** Knuth + Woz + Pike
**Depends on:** 24.4 remediation, 25.4
**Blocks:** 25.6

## Outcome

A permitted curator can approve, reject, or request evidence through one atomic promotion path and receive a truthful server-issued receipt.

## Acceptance Criteria

- [ ] Supported actions are exactly `approve`, `reject`, and `request_evidence`.
- [ ] Every action requires a nonblank rationale; client validation improves usability but server validation is authoritative.
- [ ] Server re-reads the proposal in a short transaction, enforces tenant/role/segregation-of-duties, and prevents duplicate terminal decisions.
- [ ] Concurrent valid decisions return `409`; UI refreshes authoritative state and displays no false success.
- [ ] Receipt includes proposal version, actor, role, action, rationale, policy reference, evidence references, timestamp, memory ID when applicable, and truthful outbox/sync state.
- [ ] Completed decisions are read-only and inspectable.
- [ ] Confirmation dialog is named, traps/restores focus, and exposes server errors accessibly.

## Evidence

- Live-DB approve/reject/request-evidence tests.
- Missing rationale, forged tenant, duty separation, 409 conflict, and outbox failure tests.
- Receipt schema validation and browser accessibility test.

## Rollback

Feature flag/route action disable returns the product to read-only console plus CLI/MCP fallback.
