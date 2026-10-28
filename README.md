# Allura Memory

**Governed, self-hosted memory for AI agents and the people who work with them.**

Allura helps teams turn captured context into reusable knowledge without treating everything an agent says as an approved fact. It keeps the original evidence, routes proposed knowledge through independent human review, and retrieves information within the requesting user's authorized scope.

## How it works

```text
Capture evidence → Propose knowledge → Independent human review → Approved memory
       └────────────────── Evidence, decisions, and version history ──────────┘
```

For example, an agent captures a proposed customer-support policy. A reviewer checks its sources and approves the exact version. Other authorized agents can then retrieve that policy with its provenance. If the policy changes, a new reviewed version supersedes the old one without erasing its history.

**Saved does not mean approved.** A confidence score, administrator role, or successful API request does not replace the required review or grant access to another workspace.

## Core capabilities

- **Evidence capture:** retain source context and append-only records rather than silently rewriting history.
- **Human-governed knowledge:** separate proposals from approved semantic memory and bind decisions to the reviewed version.
- **Scoped access:** enforce current tenant, workspace, and action permissions on the server.
- **Versioned corrections:** retain earlier versions and the relationships that explain what changed.
- **Grounded retrieval:** combine authorized durable records with derived search indexes and preserve provenance.
- **Operational visibility:** expose bounded observations and explicit failure or unknown outcomes instead of implying success.

## Status of this branch

`beta` is the active rebuild branch, **not a production release**. The published snapshot currently contains the TypeScript foundation, memory services, migrations, and validation harnesses. Some retained documents and design assets describe planned features or historical versions; their presence is not proof that a feature is shipped here.

The newer packaged runtime, consumer tooling, and interactive dashboard have not yet been published to this branch. This checkout therefore does **not** provide a documented application-start or production-deployment command. The instructions below are for development validation, not launching an instance.

## Getting started

### Requirements

- **Bun 1.3.14** and **Node.js 24.19.0** — the toolchain checks require these exact versions.
- Git.
- Docker for the disposable database integration lane; native retrieval/model dependencies may need additional local preparation.

### Clone and validate

```bash
git clone --branch beta https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory/foundation
bun run install:frozen
bun run check
```

`install:frozen` checks the toolchain and installs the locked dependency graph without dependency lifecycle scripts. `check` runs the required unit-test suites, TypeScript checking, and linting.

For database integration validation, first review [the database test harness](foundation/scripts/test-db.ts) and its prerequisites. Use an isolated development environment, never an existing production database:

```bash
bun run check:all
```

This adds the disposable database integration lane. It is not a deployment command. Public model preparation is provided separately in [`foundation/scripts/prepare-model.ts`](foundation/scripts/prepare-model.ts); inspect its network and cache behavior before running it.

## Architecture

- **TypeScript services** implement capture, proposals, decisions, corrections, retrieval, and access rules.
- **PostgreSQL** owns durable evidence, proposal state, semantic versions, relationships, and receipts.
- **RuVector and embedding components** provide derived retrieval capabilities; an index does not grant authority or approve knowledge.
- **Authenticated transport boundaries** resolve identity and scope before invoking services.

Neo4j is retired and is not a dependency of the rebuild. Clients and future operator interfaces consume governed services rather than owning canonical memory or accessing the database directly.

## Repository guide

| Path | Purpose |
| --- | --- |
| [`foundation/`](foundation/) | Executable source, migrations, pinned dependencies, and tests |
| [`docs/allura/`](docs/allura/) | Product requirements, design references, and decisions |
| [`docs/design/command-center/`](docs/design/command-center/) | Retained operator-interface design references |
| [`_bmad-output/planning-artifacts/epics.md`](_bmad-output/planning-artifacts/epics.md) | Epic catalog, dependencies, and optional/deferred scope |
| [`_bmad-output/planning-artifacts/architecture.md`](_bmad-output/planning-artifacts/architecture.md) | Architecture and governing contracts |

Optional integrations, branchable-memory experiments, durable workflows, project/task management, and a desktop application have separate roadmap and acceptance requirements. They are not all included in this published snapshot.

## Development and security

Keep changes scoped, preserve existing evidence and version history, and run the relevant validation lanes. Keep credentials out of Git, command-line arguments, and logs. Never weaken permissions or substitute a test identity to make a production operation succeed.

Local tests do not establish production readiness. Deployment requires an identified target, identity provisioning, protected secrets, persistence and recovery checks, and verification of the behavior users will actually exercise.

## License

This beta snapshot does not include a root-level license file. Do not infer redistribution rights from repository visibility. Review applicable dependency and asset licenses and obtain the project owner's licensing terms before redistribution.
