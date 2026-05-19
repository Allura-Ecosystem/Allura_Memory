# Domain Board Governance

> [!NOTE]
> **AI-Assisted Documentation**
> This document was drafted with AI assistance and must be checked against
> owner approval, private source configs, and Notion evidence before any domain
> board is activated.

Current status: **DOMAIN BOARDS DEFERRED**.

Domain boards must be governed configs, not custom one-off dashboards. Real
domain configs start private, and only sanitized examples may be committed.

## Candidate Boards

| Board | Status | Owner | Source Of Truth | Public Repo Policy |
| --- | --- | --- | --- | --- |
| Memory Board | Current | Allura owner map | Allura Brain + Notion Work Board | Public sanitized config allowed |
| Faith Meats Operations | Deferred | Owner required before activation | Private HACCP/operations source required | Private config first; public example only if sanitized |
| Lending Compliance | Deferred | Owner required before activation | Private compliance/rules source required | Private config first; public example only if sanitized |

## Activation Requirements

Before a domain board moves out of `Deferred`, record:

- `owner`: accountable person or role.
- `source_of_truth`: Notion, system, document set, or private config source.
- `write_policy`: `read-only`, `request-review`, or stricter domain-specific policy.
- `evidence_expectations`: required proof before any status changes.
- `degraded_behavior`: exact UI behavior when the source cannot load.
- `private_config_path`: `board-configs/private/`.
- `sanitized_public_example`: optional and must contain no private names, URLs, customers, secrets, financial data, compliance facts, or operational procedures.
- `tests`: schema, registry, route loading, and sanitization tests.
- `notion_evidence`: page or comment ID that records owner/source approval.

## Private-First Workflow

1. Create a private config under `board-configs/private/`.
2. Validate it locally against `BoardConfigSchema`.
3. Confirm owner and source of truth in Notion.
4. Define write policy, degraded behavior, and evidence expectations.
5. Add tests using sanitized fixtures only.
6. Create a public example only if it can be fully sanitized.
7. Attach validation evidence to Notion and log an Allura Brain receipt.

## Sanitized Example Rules

Sanitized public examples must not include:

- Customer names or employee names outside approved owner labels.
- Real HACCP, compliance, lending, finance, or operations data.
- Private Notion URLs, private file paths, API keys, credentials, or account IDs.
- Claims that a real source is live unless a source owner has approved it.

## Current Decision

The Memory Board remains the only current board. Faith Meats Operations and
Lending Compliance remain deferred until owner/source approval exists and a
private config is validated outside the public repo.

