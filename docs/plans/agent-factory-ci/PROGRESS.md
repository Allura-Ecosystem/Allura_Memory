# Agent Factory CI Progress

## Constraints

- The canonical Git repository is `Allura_Memory`; workflows outside it are inert.
- PostgreSQL writes are append-only and must precede any semantic projection.
- Cross-team smoke data uses isolated `*-loadtest` tenants and must not enter the HITL queue.
- Native RuVector and upstream package claims remain blocked until their source artifacts exist.

## Definition Of Done

- [x] All factory modules pass the strengthened validator.
- [x] Workflow YAML parses.
- [x] Cross-team smoke passes against live PostgreSQL and Neo4j.
- [x] RuVector readiness check reports `pgvector bridge` and blocks a forced native claim.
- [x] Notion card contains evidence and is moved to Review.
- [x] Allura and daily logs contain the outcome.

## Progress

- [x] Phase 1: Hydrate docs, Brain, Notion, infrastructure, and repository boundaries.
- [x] Phase 2: Create Notion P0 mission card and acceptance criteria.
- [x] Phase 3: Implement factory validation and packaging CI.
- [x] Phase 4: Implement cross-team Brain integration smoke.
- [x] Phase 5: Implement RuVector readiness/upstream build gate.
- [x] Phase 6: Run verification and record evidence.

## Notes

- The pre-existing ecosystem-root workflow was untracked by `Allura_Memory` and therefore could not run on its GitHub repository.
- The current runtime remains a pgvector bridge. Native RuVector migration is a separate approved workstream, not an implied result of this CI task.
- The first live smoke attempt exposed runtime credential drift: the container user is `ronin4life`, while stale local defaults referenced `allura`. The smoke passed after using the running container's authoritative identity.
- The successful smoke initially left the RuVector pool open; the script now closes both canonical and RuVector pools during shutdown.
- Final local evidence: 59 Charlotte assertions, 66 Penasoto assertions, 122 Raleigh assertions, TypeScript pass, 82/82 RuVector tests, workflow YAML parse pass, forced native claim blocked, and live smoke run `1781331583401-307304b7-bf3a-4729-80f5-cbb21c346fa4` passed with clean exit.
- Release state is Review, not Done, until GitHub-hosted workflows execute and the Captain/reviewer approves the evidence.
