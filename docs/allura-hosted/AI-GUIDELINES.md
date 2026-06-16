# Allura Hosted Platform — AI Guidelines

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

This document scopes documentation standards for the **Allura Hosted Platform** sub-product. It inherits the repository-wide standard in [`guidelines/AI-GUIDELINES.md`](../../guidelines/AI-GUIDELINES.md) — read that first; this page records only the deltas for `docs/allura-hosted/`.

## Surface Rule

`docs/allura/` remains the canonical six-doc surface for the **core engine** and must not gain net-new files. `docs/allura-hosted/` is the documentation surface for the **hosted platform** sub-product and holds the bundle below. Both follow the same artifact standards, templates, and disclosure rules.

## Bundle

| Artifact | File |
|----------|------|
| Blueprint | [BLUEPRINT.md](./BLUEPRINT.md) |
| Solution Architecture | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| Requirements Matrix | [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md) |
| Risks & Decisions | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| Data Dictionary | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |
| Design — Auth | [DESIGN-AUTH.md](./DESIGN-AUTH.md) |
| Design — Bumblebee | [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) |
| Design — MCP Gateway | [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md) |
| Design — Memory Command Center | [DESIGN-MEMORY-COMMAND-CENTER.md](./DESIGN-MEMORY-COMMAND-CENTER.md) |
| Design — Curator | [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) |
| Design — Audit | [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) |
| Security | [SECURITY.md](./SECURITY.md) |
| Threat Model | [THREAT-MODEL.md](./THREAT-MODEL.md) |
| Deployment | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Backup & Restore | [BACKUP-RESTORE.md](./BACKUP-RESTORE.md) |

## Authoring Order

1. BLUEPRINT → 2. RISKS-AND-DECISIONS → 3. SOLUTION-ARCHITECTURE → 4. DATA-DICTIONARY → 5. DESIGN-AUTH → 6. DESIGN-BUMBLEBEE → 7. DESIGN-MCP-GATEWAY → 8. DESIGN-MEMORY-COMMAND-CENTER → 9. REQUIREMENTS-MATRIX → (security/ops docs alongside).

## Rules (delta)

- Every doc carries the AI-disclosure notice until a human review sign-off removes it.
- Source of truth precedence: JSON schema > code > docs.
- Same-PR rule: schema/API changes update DATA-DICTIONARY and REQUIREMENTS-MATRIX together.
- CI for this surface: see [`.github/workflows/allura-hosted-ci.yml`](../../.github/workflows/allura-hosted-ci.yml).
