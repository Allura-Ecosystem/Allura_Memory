# Story 1.2: Harden Team RAM Source-of-Truth and Routing Contracts

Status: done

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this story file were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, JSON schemas, canonical docs in `docs/allura/`, Notion board state, and team consensus.

## Story

As a Team RAM operator,
I want the Team RAM PRD and BMAD routing contracts hardened against source-of-truth drift,
so that agents know which files, boards, skills, and memory paths are authoritative before executing work.

## Acceptance Criteria

1. The Team RAM PRD clearly states `.opencode/agent/` is the live agent source of truth and runtime-specific folders are adapters/bridges only.
2. The Team RAM PRD states Notion Work Board is the planning/status/approval source of truth, while Allura Brain is governed memory/audit context and not proof of Done.
3. Stale low-level memory write examples are replaced with governed `allura-brain_memory_*` examples.
4. HITL, no autonomous Neo4j promotion, `group_id=allura-system`, append-only traces, and `SUPERSEDES` versioning remain non-negotiable routing constraints.
5. Deliverables no longer rely on unverified `Complete` claims; evidence is required before Done.
6. The change receives Pike/Fowler review or documented gate-equivalent review.
7. Validation runs, or blockers are recorded with exact output.

## Tasks / Subtasks

- [x] Task 1: Harden source-of-truth and adapter language (AC: 1, 2, 4)
- [x] Task 2: Replace stale memory write-back example and promotion claims (AC: 3, 4)
- [x] Task 3: Replace unverified deliverable completion claims with evidence requirements (AC: 5)
- [x] Task 4: Validate and prepare for review (AC: 6, 7)

## Dev Notes

- Source doc: `_bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md`.
- `.opencode/` is canonical for Team RAM agents, skills, commands, guidelines, and OpenCode configuration.
- `.claude/`, `.codex/`, and `.agents/` are adapter or bridge surfaces only.
- Notion Work Board remains canonical for status, approval, owner, and evidence state. This local BMAD story supports reconciliation only.
- Allura Brain memories are raw audit/context until curator promotion.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.5 via Codex runtime under Brooks orchestration

### Debug Log References

- No debugging session was required; this was a documentation/governance hardening slice.

### Completion Notes List

- Added source-of-truth and governance correction section to the Team RAM PRD draft.
- Replaced stale `.claude`/`.agents` authority references with `.opencode` canonical language and adapter/bridge framing.
- Replaced stale direct `MCP_DOCKER_insert_data` write-back sample with governed `allura-brain_memory_add` example.
- Replaced unverified `✅ Complete` deliverable claims with evidence-required status language.
- Validation evidence: YAML parse passed, targeted `git diff --check` passed, docs/allura canonical guard passed, runtime adapter surface guard passed with known adapter authority notices only, and stale-reference grep found no `MCP_DOCKER_insert_data`, `ADR_CREATED`, `✅ Complete`, `agent-routing.md`, `.claude/rules`, or `.claude/agents` references.
- Pike approved the story. Fowler initially blocked on broken links and weak validation evidence; after fixes, Fowler re-review found no blocking findings.

### File List

- `_bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/1-2-harden-team-ram-source-of-truth-and-routing-contracts.md`

### Change Log

- 2026-05-24: Hardened Team RAM PRD source-of-truth, adapter, memory write-back, promotion, and evidence language; moved story to done after validation and Pike/Fowler review.
