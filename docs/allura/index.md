# Allura Documentation Index

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> When in doubt, defer to the source code, schemas, and team consensus.

## Canonical planning documents

These six files are the Allura planning canon. Product, architecture, contracts,
risks, requirements, and data changes should land here instead of creating new
parallel planning docs.

| Canonical doc | Role |
| --- | --- |
| [`BLUEPRINT.md`](./BLUEPRINT.md) | Product intent, business requirements, functional requirements, dashboard phase scope |
| [`SOLUTION-ARCHITECTURE.md`](./SOLUTION-ARCHITECTURE.md) | System topology, route/data flow, integration boundaries, cutover topology |
| [`DESIGN-ALLURA.md`](./DESIGN-ALLURA.md) and [`DESIGN-MEMORY-SYSTEM.md`](./DESIGN-MEMORY-SYSTEM.md) | Functional design, UI contracts, governed memory behavior |
| [`REQUIREMENTS-MATRIX.md`](./REQUIREMENTS-MATRIX.md) | B#/F# traceability, coverage map, validation references |
| [`RISKS-AND-DECISIONS.md`](./RISKS-AND-DECISIONS.md) | ADRs, risks, cutover decisions, rejected alternatives |
| [`DATA-DICTIONARY.md`](./DATA-DICTIONARY.md) | Entity, field, enum, event, and export data definitions |

## Execution artifacts are separate

Epics and stories are execution artifacts, not planning canon.

| Execution artifact | Role |
| --- | --- |
| [`EPICS-dashboard-v2.md`](./EPICS-dashboard-v2.md) | Dashboard epic breakdown and sequencing |
| [`stories/`](./stories/) | Story-level implementation context and acceptance evidence |

## Condensed dashboard-v2 source docs

The following draft dashboard-v2 source documents were condensed into the canon:

| Former source doc | Canonical destination |
| --- | --- |
| `PRD-dashboard-v2.md` | `BLUEPRINT.md` |
| `UX-dashboard-v2.md` | `DESIGN-ALLURA.md` |
| `ARCHITECTURE-dashboard-v2.md` | `SOLUTION-ARCHITECTURE.md` |
| `CONTRACTS-dashboard-v2.md` | `DESIGN-ALLURA.md` and `DATA-DICTIONARY.md` |
| `DATA-SUPPORT-dashboard-v2.md` | `DATA-DICTIONARY.md` |
| `KANBAN-dashboard-v2.md` | `RISKS-AND-DECISIONS.md`, `SOLUTION-ARCHITECTURE.md`, and epics/stories |
| `DASHBOARD-CUTOVER-READINESS.md` | `RISKS-AND-DECISIONS.md` and `SOLUTION-ARCHITECTURE.md` |

## Governance rule

- Do not create a new planning doc when one of the six canonical files can hold the decision.
- If a new doc is necessary, classify it as `execution`, `evidence`, `archive`, or `reference` and link it from this index.
- Every schema/API change updates `DATA-DICTIONARY.md` and `REQUIREMENTS-MATRIX.md` in the same change.
- Every architectural decision updates `RISKS-AND-DECISIONS.md` in the same change.

## Archived evidence and security reports

These are not planning canon:

- [`../archive/allura/evidence/STORY-2-1-PATCH-REPORT.md`](../archive/allura/evidence/STORY-2-1-PATCH-REPORT.md)
- [`../archive/allura/evidence/scout-safety-report.md`](../archive/allura/evidence/scout-safety-report.md)
- [`../archive/allura/security/SECURITY-BLUEBOOK.md`](../archive/allura/security/SECURITY-BLUEBOOK.md)
- [`../archive/allura/security/SOC2-READINESS-CHECKLIST.md`](../archive/allura/security/SOC2-READINESS-CHECKLIST.md)
