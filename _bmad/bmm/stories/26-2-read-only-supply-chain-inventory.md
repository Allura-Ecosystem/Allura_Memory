# Story 26.2 — Read-Only Supply-Chain Inventory

**Status:** Planned
**Owner:** Woz + Knuth
**Depends on:** 26.1
**Blocks:** 26.3

## Outcome

Build a normalized metadata inventory of approved software and AI supply-chain artifacts without executing any scanning or package-manager operations.

## Acceptance Criteria

- [ ] Inventory covers: SBOMs, lockfiles, package manifests, CI workflows, container metadata, extensions, MCP manifests, skills, plugins, and model artifacts.
- [ ] Inventory is read-only — no executable scanning, no package installation, no package-manager invocation.
- [ ] Metadata is normalized across artifact types with consistent fields: ecosystem, package, version, hash, publisher, workflow reference.
- [ ] Inventory is tenant-scoped — derived from authenticated principal, not browser-supplied.
- [ ] Missing or stale inventory items are explicitly marked, not silently omitted.
- [ ] Inventory can be queried by artifact type, ecosystem, or package name.

## Evidence

- Inventory schema and normalization rules.
- Read-only verification: no write paths, no exec calls.
- Tenant scoping tests.

## Rollback

Disable the inventory API. No artifacts are modified — the inventory is read-only.