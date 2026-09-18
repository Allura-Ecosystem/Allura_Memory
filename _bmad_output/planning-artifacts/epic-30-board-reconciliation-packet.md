# Epic 30 — Human Board Reconciliation Packet

Date: 2026-09-17  
Status: **reconciliation requested; not reconciled**  
Candidate commit: `c48fa281fe369a28dab4849cb9d632d9105e4ea8`

This packet is the exact local-to-human-board handoff. It does not claim Notion or other external-board authority, change story status, or approve development. Preserve every non-Epic 30 board item and its status.

## Requested board state

| Board item                                            | Status     | Dependencies                    |
| ----------------------------------------------------- | ---------- | ------------------------------- |
| Epic 30 — Governed Digital Brain Workspace            | `backlog`  | none                            |
| 30.1 — Epic authority and readiness                   | `backlog`  | none                            |
| 30.2 — Approved workspace design and user-test plan   | `backlog`  | 30.1                            |
| 30.3 — Authorization and threat contract              | `backlog`  | 30.1, 30.2                      |
| 30.4 — Knowledge schema, RLS, and audit foundation    | `backlog`  | 30.3                            |
| 30.5 — Workspace scope and legacy remediation         | `backlog`  | 30.4                            |
| 30.6 — Safe read services                             | `backlog`  | 30.5                            |
| 30.7 — My Work reading shell                          | `backlog`  | 30.2, 30.6                      |
| 30.8 — Search, links, and backlinks                   | `backlog`  | 30.6, 30.7                      |
| 30.9 — Read-only Ask Allura                           | `backlog`  | 30.6, 30.7, 30.8                |
| 30.10 — Restricted contractor messaging               | `backlog`  | 30.3, 30.5, 30.7                |
| 30.11 — Integrated review, CI, and controlled red     | `backlog`  | 30.4–30.10                      |
| 30.12 — Five-user validation and remediation          | `backlog`  | 30.2, 30.11                     |
| 30.13 — Release evidence, receipts, and retrospective | `backlog`  | 30.11, 30.12                    |
| Epic 30 retrospective                                 | `optional` | 30.13 and epic completion gates |

## Bound local records

| Record                                                 | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `sprint-status.yaml`                                   | `ee9f6851066bd80f33ec9ae0a1ca65fdca20e7e5c60e6f1a6106a65e8e291558` |
| `30-1-epic-authority-and-readiness.md`                 | `c6552275214980fb31ebf4951aa3f4017e9aa780f6379f09bb97e2582232cba2` |
| `30-2-approved-workspace-design-and-user-test-plan.md` | `7eec06cb5517a0ec9aeafc0bd3e5ef8f95f5f556d93d3e0f992497cc797108cb` |
| `30-3-authorization-and-threat-contract.md`            | `0a1d797005a8a7c8c9b1c0da934a1d97eb28ebbdbadc1afe8ff436a3e9f4d3c1` |
| `30-4-knowledge-schema-rls-and-audit-foundation.md`    | `021715be266bedf43c2c1d2c75a710970fd352d46e2ea0cfbcde11decb7ca18e` |
| `30-5-workspace-scope-and-legacy-remediation.md`       | `5a1135f5451de1951e7877cdcf282db88b2bc239aa309de36a1d53e52c70ea05` |
| `30-6-safe-read-services.md`                           | `756a46b39e9129c6658a56da20f287cce809baad83ebd037280f19ffe9a59dfb` |
| `30-7-my-work-reading-shell.md`                        | `62206747747c478bc94decc656a6ab1c6df9f6db656d49f133ced48041878de9` |
| `30-8-search-links-and-backlinks.md`                   | `6fc6b53eb60dd7ac6fec678c1915bdf55a89896119fb6a9f1318d3465f8e4e2d` |
| `30-9-read-only-ask-allura.md`                         | `f17363eec732d60fccc57f8eb739a355eae9c6978fa10a4a3f06c05b30659edc` |
| `30-10-restricted-contractor-messaging.md`             | `4ad860e0c534850cd63c8d62ab8ff3af48f5119b2c0bf256d5c9311df2613920` |
| `30-11-integrated-review-ci-and-controlled-red.md`     | `3fc7be6fd4ee4d12c1fb16254c1c08ff8d346aaad5fe6675cc842682417b8adb` |
| `30-12-five-user-validation-and-remediation.md`        | `86c8fecf211bf8e43450429affa59a8e061044407272206ab8bd6860c96111f9` |
| `30-13-release-evidence-receipts-and-retrospective.md` | `f26f01e04eee4f922d2fb7acffa3e4b3a049876c63080efb0d6dd41e09e06fe0` |

## Reconciliation procedure

1. Match or create each Epic 30 board item using the exact title, status and dependency row above.
2. Do not overwrite, delete, reorder or reinterpret non-Epic 30 items.
3. Attach the local commit and record hashes to the board reconciliation receipt.
4. Link the [design approval packet](./epic-30-design-approval-packet.md) and [authorization approval packet](./epic-30-authorization-approval-packet.md); keep both marked pending until their own authorized decisions are recorded.
5. Record board system, item IDs, reconciler identity/role, timestamp, discrepancies, and final disposition in a durable receipt.
6. Run sanctioned sprint planning only after design, authorization and board receipts all exist. No hand edit of `sprint-status.yaml` is authorized.

## Acceptance record

Reconciliation is complete only when an authorized human records all external item IDs and verifies that every bound local status/dependency matches the human board without altering unrelated work. Until that receipt is linked into current readiness, all 13 stories and Epic 30 remain backlog.
