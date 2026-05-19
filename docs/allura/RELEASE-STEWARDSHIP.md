# Release And Stewardship Readiness

> [!NOTE]
> **AI-Assisted Documentation**
> This document was drafted with AI assistance and must be checked against CI,
> security/privacy review, deployment evidence, Notion evidence, and Team RAM
> retrospective before release.

Current status: **NOT READY FOR FINAL RELEASE**.

This document tracks Phase 6 stewardship work. It is a release gate, not a
release approval.

## Release Checklist

| Gate ID | Requirement | Current Status | Evidence Required |
| --- | --- | --- | --- |
| `product-docs` | README and product docs updated. | `PARTIAL` | README/product docs reviewed after all phases close. |
| `security-privacy` | Security and privacy docs reviewed. | `PARTIAL` | `SECURITY-BLUEBOOK.md`, `SOC2-READINESS-CHECKLIST.md`, and privacy-sensitive sample audit. |
| `install-deploy` | Install and deployment docs reviewed. | `PARTIAL` | `docs/allura/INSTALL-DEPLOY-REVIEW.md` documents the source Compose path; local env prerequisite check currently fails; fresh install/deploy command transcript still required. |
| `sample-data-safe` | Sample data has no secrets or private board data. | `PARTIAL` | Focused public-surface scan exists; full external secret scan still required. |
| `ci-green` | CI is green. | `PARTIAL` | `artifacts/local-ci-partial-evidence-2026-05-17.md` records local green typecheck/lint/unit/curator/integration/focused/MCP-build lanes; `artifacts/board-screenshot-evidence-2026-05-17.md` records board-route browser screenshots. GitHub checks, Next build, E2E, and full release browser validation still required. |
| `final-retrospective` | Final Team RAM retrospective complete. | `PENDING` | Retrospective artifact and Notion evidence. |
| `final-brain-receipt` | Final release receipt logged to Allura Brain. | `PENDING` | Brain receipt with `group_id=allura-system`. |

## Current Evidence

- Phase 1/2 board config and cockpit evidence:
  - Notion `3631d9be-65b3-81fd-b577-ed650a7137da`
  - Runtime smoke addendum `3631d9be-65b3-81f0-807c-f77fe17918e9`
  - Screenshot evidence: `artifacts/board-screenshot-evidence-2026-05-17.md`
  - Screenshot Notion `3631d9be-65b3-8167-af39-fe1e8e0a074c`
  - Screenshot Brain `7ab42d42-78d3-4a34-95b6-be7f8089d490`
- Phase 3 governance standards evidence:
  - Notion `3631d9be-65b3-819d-bf4a-c5a0e9cfbda5`
- Phase 4 cutover readiness gate evidence:
  - Notion `3631d9be-65b3-81c2-9295-e0cdd91a714d`
- Phase 5 domain board governance evidence:
  - Notion `3631d9be-65b3-8153-8fa0-f272d3850906`
- Focused release safety scan:
  - `src/lib/release/safety-scan.ts`
  - `src/__tests__/release-safety-scan.test.ts`
- Install/deploy review:
  - `docs/allura/INSTALL-DEPLOY-REVIEW.md`
  - `src/__tests__/install-deploy-review.test.ts`
  - `scripts/validate-env.sh` now reports all missing deploy prerequisites under `set -e`
  - Notion `3631d9be-65b3-8126-9d29-c75729329afa`
  - Brain `0591f7f3-cbfc-4fa1-805a-4740de3658ae`
  - Prerequisite failure addendum: Notion `3631d9be-65b3-81e0-b267-e734aca5b379`; Brain `0cf75be3-d3c7-4e53-bde7-dccb4aa2992c`
- Local CI partial evidence:
  - `artifacts/local-ci-partial-evidence-2026-05-17.md`
  - Typecheck, lint, unit, curator, integration, focused roadmap suite, and MCP server build passed.
  - Board-route browser screenshots passed via `agent-browser`; Next production build timed out locally, and GitHub CI, E2E, and full release browser validation are still required.
  - Notion `3631d9be-65b3-8189-a83a-dd5756cce43e`
  - Brain `6a329870-61f2-4808-a54e-92f2ab7e7967`

## Minimum Final Release Evidence

Before final release, attach:

```text
Release evidence — <YYYY-MM-DD>
Owner: <release owner>
Status: done
Validation:
- CI: <GitHub checks URL or command transcript>
- Typecheck: <command/result>
- Tests: <command/result>
- Security/privacy review: <artifact/result>
- Install/deploy review: <artifact/result>
- Sample-data safety: <artifact/result>
- Retrospective: <artifact/result>
Rollback or supersession:
- <release rollback path>
Receipts:
- Notion: <page/comment ID>
- Brain: <memory ID>
```

## Current Decision

Allura Memory is not yet ready for final release. Continue closing Phase 4
cutover evidence and any release-blocking security, privacy, install,
deployment, CI, and retrospective gaps before logging a final release receipt.
