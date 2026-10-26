# Epic 31 — Governed Intelligence and Connected Clients (Proposal Record)

> [!CAUTION]
> **Proposal only.** Epic 31.1–31.8 came from the 2026-10-15 donor draft `2e4d4ac27e4459a1ba3b4ff6f7c661fddfaba006`, which is not an ancestor of HEAD/main. Preserving this file does not accept the Epic 30/31 split, create work items, or authorize providers, agents, actions, notifications, implementation, or release.

## Proposed outcome

Add provider-neutral governed intelligence and connected-client experiences above an authorized evidence/data plane without allowing models, providers, agents, browser clients, or notification transports to mint authority.

Allura is the product; Faith Meats is an example workspace; Mortgage is a separately scoped optional plugin; Hermes is an optional personal BYOA test case, not a privileged/default agent. A catalog entry is not a delivered feature.

## Proposed story register

| Proposed ID | Contract | Acceptance boundary |
|---|---|---|
| 31.1 | Provider-neutral `ModelPort`, direct-provider baseline, narrow framework spike | Provider transmission, retention/training, model policy, admission/exit, portability, and security review. |
| 31.2 | Read-only Ask service and API | Authorized context/evidence, citations, freshness/uncertainty, injection defense, post-provider reauthorization. |
| 31.3 | Chat plugin and accessible UI | Accepted shell/plugin/design, truthful denied/degraded/error states, accessibility evidence. |
| 31.4 | Connections dashboard: BYOK, provider choice, BYOA | Approved credentials/connections/device contracts; Hermes optional and non-privileged. |
| 31.5 | Governed actions independent of provider/agent | Explicit human authority, exact intent/version, idempotency, revocation, receipts, unknown outcomes, confused-deputy tests. |
| 31.6 | In-app notification foundation | Consent, scope, minimization, revocation, delivery state, audit. |
| 31.7 | Separately gated browser push | Explicit browser permission/subscription security/privacy/delivery/rollback; no other channel implied. |
| 31.8 | Intelligence release/security/accessibility/performance/human gate | Exact-head CI, independent reviews, controlled-red, real humans, receipts, rollback, release authority. |

## Current decision status and remaining work

1. Sabir/product owner must accept the exact Epic 30/31 split and numbering.
2. The six canonical documents must be reconciled together with stable requirement/decision/evidence IDs and no duplicate ownership.
3. Security/data owners must accept provider, credential, context, action, notification, retention, training, deletion, revocation, and external-effect boundaries.
4. Durham/Sabir must accept exact design assets/states under DOC-02 where UI is involved.
5. Epic 29 device acceptance remains separate; AD-69 Cloudflare identity and real secure stores cannot be inferred from server scaffolds.
6. Exact-revision implementation, CI, independent review, deployed behavior, controlled-red, human validation, rollback, and release remain future gates after proposal acceptance.

## Non-negotiable boundaries

- Models/adapters/agents/providers/clients consume authority; they do not create it.
- Read-only Ask cannot mutate canonical knowledge or submit protected actions.
- External transmission requires explicit provider/model/retention/training/redaction decisions; governed content is not training data by default.
- BYOK/BYOA configuration grants no data authority.
- Actions and delivery channels require separate approval, replay/conflict, revocation, receipt, and unknown-outcome handling.
- In-app notifications and browser push are separate; neither implies email, SMS, bots, attachments, background agents, or unrestricted history.
- Five-human validation, if accepted, uses distinct real humans; AI/simulations do not count.

## Relationship to current Epic 30

Current canonical graph-capable Command Center intent is already governed by Epic 30/AD-31. It does not depend on accepting this split. If the split is later accepted, Epic 30 retains governed workspace/graph/evidence/device integration and Epic 31 owns provider-neutral intelligence/actions/notifications. No old evidence or status transfers automatically.

## Next action

Human review decides accept/reject/amend for the split. Only after acceptance may canonical reconciliation and sanctioned Allura work-item creation occur. Local sprint YAML, Markdown, Notion planning, or Brain memory must not substitute for that operational step.

No application, schema, provider, status, Brain, Notion, commit, push, deployment, notification, or release action is authorized here.