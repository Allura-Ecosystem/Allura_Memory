# Story M-1.4 — Co-Work Adapter — Copilot Cowork, Claude Code, Codex

**Status:** Planned
**Owner:** Brooks + Woz + Pike
**Depends on:** M-1.2, M-1.3
**Blocks:** M-1.6

## Outcome

One canonical Mortgage Approval Gate skill source with three host adapters (Copilot Cowork, Claude Code, Codex) that prove identical authority and traceability.

## Acceptance Criteria

- [ ] One canonical skill source defines the Mortgage Approval Gate workflow.
- [ ] Copilot Cowork adapter calls the same Allura MCP/API contracts.
- [ ] Claude Code adapter calls the same Allura MCP/API contracts.
- [ ] Codex adapter calls the same Allura MCP/API contracts.
- [ ] All three hosts prove: intake → evidence → policy → review → receipt with identical authority.
- [ ] No host implements policy locally — all call Allura for scope and decisions.
- [ ] Auth, denial, and parity proof across all three hosts.

## Evidence

- Canonical skill source.
- Three adapter implementations.
- Cross-host parity test results.

## Rollback

Disable adapters. The canonical skill source remains; hosts cannot invoke it.