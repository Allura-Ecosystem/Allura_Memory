# Story P-1.1 — Marketplace CI Hardening

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Planned
**Owner:** Woz + Pike
**Depends on:** —
**Blocks:** P-1.2, P-1.3, P-1.4, P-1.5

## Outcome

All plugin manifests validate, paths resolve, referenced files exist, and no hardcoded paths remain — verified by CI on every push.

## Acceptance Criteria

- [ ] All 3 plugin manifests (allura-cowork, team-durham, team-ram-coding) parse without errors.
- [ ] Every referenced file path in manifests resolves to a real file.
- [ ] No hardcoded absolute paths in any manifest or plugin source.
- [ ] CI runs manifest validation on every push and blocks on failure.
- [ ] Marketplace sources resolve correctly in Claude Code and Codex CLI.

## Evidence

- CI manifest validation output.
- Path resolution test results.
- Hardcoded path grep returns zero results.

## Rollback

Revert CI config. Plugins remain functional; validation is not enforced.