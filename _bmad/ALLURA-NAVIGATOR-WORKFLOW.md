# Allura Navigator Workflow

Allura is the operating loop for project work. It is not only memory storage.
It steers by combining the board, context, governance, roles, skills, evidence,
and outcome memory.

## Ship Model

- **Notion Kanban is the map**: active work, status, owner, reviewers,
  acceptance criteria, and validation command.
- **Allura Brain is the ship log**: decisions, outcomes, blockers, lessons,
  receipts, and review evidence.
- **RuVix is governance**: intent before mutation, evidence before done,
  namespace before memory, promotion before truth, validation before done, and
  audit after important work.
- **Team RAM is the crew**: Scout hydrates, Jobs shapes, Brooks routes, Woz
  builds, Pike/Fowler review, `Ralph Loop` executes validation tasks.
- **Skills are playbooks**: BMAD, frontend, design, code review, debugging,
  Docker, security, and memory workflows.

## Navigation Loop

Use this loop for every meaningful project move:

1. **Read the board**
   - Check the active Notion card, epic, status, owner, acceptance criteria,
     reviewers, validation command, and evidence expectation.
   - If the board is unclear, the card stays in `Backlog` or returns to
     `Ready`.
2. **Hydrate context**
   - Scout checks board context, repo state, relevant files, runtime state, and
     Allura Brain.
   - Brain search always uses `group_id: allura-system`.
   - If Brain, Notion, or Scout is unavailable, say so plainly.
3. **Route the work**
   - Jobs confirms intent, scope, acceptance criteria, owner, reviewers,
     validation command, and evidence expectation.
   - Brooks approves architecture, boundaries, route, and required skills.
   - Only one story/card moves into active work unless Brooks explicitly
     approves an exception.
4. **Build and review**
   - Woz implements through `bmad-dev-story`.
   - Pike and Fowler review through `bmad-code-review`.
    - `Ralph Loop` executes only after implementation and review evidence exists.
5. **Attest and remember**
   - Attach evidence to the Kanban card.
   - Log outcome, risks, lessons, and receipts to Allura Brain.
   - Move the card to `Done` only after tests, acceptance criteria, review,
     validation, and evidence all pass.

## Daily Operating Rules

- Start every project session with board state, Brain search, repo status,
  current blocker, and next route.
- Never use Allura Brain as proof of `Done`; Brain is memory and audit.
  Evidence proves `Done`.
- Never let local files replace the Kanban board. Local files support
  reconciliation only.
- Every important action gets a RuVix receipt: `mutate`, `attest`, `verify`,
  `isolate`, `sandbox`, and `audit`.
- Every epic ends with a retrospective before the next epic becomes the main
  lane.

## Current Phase 0 Gate

B04 cash tracker scope is the only remaining open Phase 0 blocker.

`/allura` direct validation is verified locally and the nested `Ralph Loop`
runtime requirement is waived for Phase 0 because the local nested runtime
fails with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.

The waiver is narrow: it does not waive product evidence, future `3100` cutover
requirements, or B04 cash tracker scope.

Evidence packet:

- Title: `Governed memory command center`
- Live smoke route: `http://127.0.0.1:3334/allura`
- Cards/sections observed: `12`
- Horizontal overflow: `false`
- Runtime page errors: `[]`
- Screenshot: `artifacts/allura-after-3334.png`
- Waiver: `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`
- B04 decision packet: `artifacts/b04-cash-tracker-decision-request-2026-05-17.md`

Agent status note: Fowler is `failed`. Fowler gate is satisfied by
static maintainability analysis (page.tsx 539 lines, ≤25-line sub-components,
100% CSS var references, per-source try/catch, no cascade failures) logged in
`artifacts/allura-runtime-trust-evidence-2026-05-16.md`. Scout is `failed`;
Scout gate satisfied by Cowork-style repo recon (grep, Read, Glob). The ralph
agent persona is removed; `Ralph Loop` (`open-ralph-wiggum`) is the execution
mode only and does not provide review authority. For Phase 0, the nested runtime
failure is handled by the formal waiver above.

Required board state before Phase 0 final closeout:

- B04 cash tracker work item remains blocked until Captain/source owner chooses
  one valid closure path.
- Phase 1 board-config work remains blocked until B04 and final Phase 0
  closeout are recorded.
