---
title: Allura Memory sequential rebuild readiness
status: epic-1-incomplete-story-1.1-locally-verified
updated: 2026-10-26
operationalStatus: unknown
---

# Current readiness

Direct-build update: Epic 1 is locally accepted as foundation/contracts only; see `../implementation-artifacts/epic-1-retro-2026-10-26.md`, `contracts/authority-v1.md` and `contracts/persistence-v1.md`. Baseline is committed; next is 2.1. Current user instruction authorizes direct implementation/self-checks and ordinary local design/disposable tests, not independent development review. Reset snapshot tables below are historical. Product and deployment acceptance remain outstanding; operational status unknown.

The user approved a fresh sequential rebuild beginning Epic 1, then Epic 2. The [catalog](epics.md) is the only active delivery sequence. Old numbering and repair instructions are superseded, not combined with this verdict. No routine reapproval of direction or numbering is required.

## Exact current Epic 1 state

| Story | Local evidence state | Remaining gate |
|---|---|---|
| [1.1 Local executable foundation](stories/1.1-local-executable-foundation.md) | Locally verified | Parent baseline commit; not a product/release claim |
| [1.2 Authority/service contracts](stories/1.2-authority-and-service-contracts.md) | Lowest unfinished; ready for contract preparation | Produce/review actual matrix and critical authority decisions; parent commit before development continuation |
| [1.3 Persistence/security contracts](stories/1.3-persistence-and-security-contracts.md) | Not started | Accepted 1.2 and detailed schema/security/fixture decisions |
| [1.4 Foundation acceptance/handoff](stories/1.4-foundation-acceptance-and-handoff.md) | Not started | 1.1–1.3 acceptance, independent review, baseline evidence and retrospective |

Epic 1 is NOT complete. No memory product feature is claimed. Next is 1.2, never an arbitrary legacy number.

The reused `foundation/` package has prior independently reviewed evidence: one test file, three cases, 19 assertions, zero failures/skips, separate typecheck and ESLint, reproducible install and 14 induced failures with restored-green checks. Current reset evidence binds unchanged package bytes and a fresh `PATH=$HOME/.bun/bin:$PATH bun run check` from `foundation/`. Original evidence identity, private recovery and exact current hashes/review are in `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/fresh-build-epic1-reset/RESULT.json`; local evidence is not an Allura status transition.

## Decisions belong to their stories

1.2/1.3 resolve authority and missing schema/security contracts before Epic 2. AD-65 → 3.1; DOC-06 approved behavior → 4.1; AD-67 → 4.3; DOC-03/05 → 4.4; AD-66 vector specifics → 5.1; measurement budgets → 5.4; AD-68 operations/CI/delivery → 6/7; AD-69 human identity → 2, real device stores → 8; DOC-02/ENT visual and authenticated acceptance → 9; DOC-08 curator-first evidence → 3.3/9.1; deferred run AC → 12.1; DOC-09 board/sync → 13.1. See [PRD decision ledger](prds/prd-Allura_Memory-2026-10-25/prd.md#9-decision-and-readiness-ledger) and [architecture](architecture.md).

Optional/deferred catalog entries preserve accepted intent without accepting provider/action/notification proposals. Sequential execution does not license bypassing a gate; if the next entry is blocked, prepare its decision rather than skip ahead. Core acceptance is bounded to Epic 6, not the full roadmap.

## Preservation, authority and next owner

- Parent reconciles this docs worker and the separate MCP worker, then stages/commits the clean development baseline. Until verified, purge/docs/foundation are intentionally uncommitted; Git is not claimed clean.
- Only main/beta and primary checkout; no worker staging/commit/ref/worktree/push. Foundation and protected UX/specs/assets remain byte-preserved.
- Legacy repair STOP remains intact; approved rebuild execution is distinct. No implementation beyond prior 1.1 is performed here.
- Raw BMAD TOML missing-input debt is disclosed by the [adapter](../../guidelines/ALLURA-BMAD.md#missing-input-mapping); no config/installer change or guessed schema.
- Allura operational state/production unknown. Brain recall not retried and write hold preserved; no shadow tracker or remote status mutation.

Next owner: parent Brooks for verified baseline commit, then RAM for Story 1.2's concrete contract work. Review/hashes/checklist and exact changes are private run evidence, not another proposal awaiting approval.
