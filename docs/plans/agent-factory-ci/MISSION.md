# Agent Factory CI Mission

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

## Source Of Truth

- `allura-agent-factory-adr.md`
- `docs/allura/BLUEPRINT.md`
- `docs/allura/SOLUTION-ARCHITECTURE.md`
- `docs/allura/REQUIREMENTS-MATRIX.md`
- `docs/allura/RISKS-AND-DECISIONS.md`
- `docs/allura/DATA-DICTIONARY.md`
- Notion mission card `37e1d9be-65b3-815e-8b01-d0dd94399f8e`

## Approved Scope

| ID | Acceptance criterion |
| --- | --- |
| AF-CI-1 | Factory modules and workflows are tracked by the canonical `Allura_Memory` repository. |
| AF-CI-2 | Every team passes YAML, roster, tenant, BMad dependency, and Allura governance validation. |
| AF-CI-3 | A live PostgreSQL/Neo4j smoke proves PostgreSQL-first writes, own-tenant retrieval, and cross-tenant isolation. |
| AF-CI-4 | RuVector CI retains the `pgvector bridge` label and blocks native/upstream claims until required source artifacts exist. |
| AF-CI-5 | Packaging runs only for a named, validated team and produces an immutable commit-addressed artifact. |

## Boundaries

- This mission does not perform a native RuVector migration.
- This mission does not publish `@ruvector/governance`.
- This mission does not auto-promote smoke memories to Neo4j.
- `Done` requires GitHub CI evidence and human review; local passes move the card only to `Review`.
