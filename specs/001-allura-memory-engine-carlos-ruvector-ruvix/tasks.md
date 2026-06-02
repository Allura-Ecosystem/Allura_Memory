> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# Tasks: Allura Memory Engine Carlos Canon Update

## T0 - TALON Validation Packet

- [x] Create contained Spec Kit packet.
- [x] Attempt TALON Guardian dispatch for validation verdict.
- [x] Record TALON evidence and blockers.
- [x] Retry TALON Guardian dispatch after OpenClaw cross-agent visibility fix.
- [X] Complete TALON Guardian validation verdict.

### T0 Evidence

- `specify check` passed on 2026-06-02.
- Source document existence check passed: seven checked, missing none.
- RuVector readiness check classified current runtime as `pgvector bridge`, not full RuVector.
- Direct OpenClaw `sessions_spawn` to `talon-deploy-guardian` was blocked: `agentId is not allowed for sessions_spawn`.
- OpenClaw `sessions_send` to `talon-deploy-guardian` was blocked: `Session send visibility is restricted. Set tools.sessions.visibility=all to allow cross-agent access`.
- Retry dispatch accepted by OpenClaw after permission fix: child session `agent:talon-deploy-guardian:subagent:ac2ef737-8c3a-4ff4-8944-edb9f23f9a31`, run `43f5b005-57b3-4e45-a23b-01b5f8b8d121`.

## T1 - Blueprint

- [X] Confirm Engine-only product boundary.
- [X] Add current RuVector/RuVix posture without overclaiming runtime state.
- [X] Reconfirm Dashboard as separate visualization project.

## T2 - Solution Architecture

- [X] Document current pgvector bridge state.
- [X] Add target full RuVector-Postgres readiness criteria.
- [X] Add RuVix gate and hook wrapper architecture.
- [X] Add dashboard API-only consumption boundary.

## T3 - Design

- [X] Add Brain read-before-work flow.
- [X] Add governed receipt write-back flow.
- [X] Add Permit/Defer/Deny done gate flow.
- [X] Add proof/receipt surface for dashboard display.

## T4 - Requirements Matrix

- [X] Add GOV requirements for Brain pre-search.
- [X] Add GOV requirements for receipt write-back.
- [X] Add GOV requirements for Permit/Defer/Deny gate.
- [X] Add runtime readiness requirement for RuVector labeling.
- [X] Add dashboard no-direct-write requirement.

## T5 - Risks & Decisions

- [X] Add decision: current runtime label is pgvector bridge.
- [X] Add decision/risk: full RuVector-Postgres migration requires approval.
- [X] Add risk: SONA feedback before clean receipts creates false learning.
- [X] Add risk: duplicate MCP configs create harness drift.
- [X] Add decision: RVF MCP and Cognitum Gate are parked until explicit approval.

## T6 - Data Dictionary

- [X] Add `gate_decision`.
- [X] Add `gate_reason`.
- [X] Add `receipt_id`.
- [X] Add `runtime_readiness`.
- [X] Add `ruvector_status`.
- [X] Add `harness_hook_status`.
- [X] Add `approval_required`.

## T7 - Closeout

- [X] Run doc existence validation.
- [X] Run RuVector readiness validation.
- [ ] Sync Notion if approved. **Not approved in this packet; intentionally left unchecked.**
- [X] Log Allura Brain receipt.


### T7 Implementation Notes

- `docs/allura/index.md` was moved to `docs/archive/allura/index-2026-06-02.md` to restore the closed six-file canonical documentation set without deleting the content.
- Notion sync is not approved in this packet and remains intentionally unchecked.
