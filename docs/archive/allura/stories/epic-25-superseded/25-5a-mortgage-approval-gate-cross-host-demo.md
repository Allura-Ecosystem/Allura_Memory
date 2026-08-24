# Story 25.5a — Mortgage Approval Gate Cross-Host Demonstration

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Planned / dependency-blocked
**Owner:** Jobs + Brooks + Troy/Woz + Pike + Bellard + Hightower
**Depends on:** 25.3b modular dashboard registry; 25.4b portable skills/identity; 25.5 governed decisions and receipts
**Blocks:** Mortgage Approval Gate claims in Story 25.6 portfolio/demo evidence

## Outcome

Demonstrate one vendor-neutral governed workflow across Microsoft Copilot Cowork, Claude Code, and Codex:

```text
mortgage review intake
→ document and OCR evidence
→ server-owned policy evaluation
→ required human review and rationale
→ immutable decision receipt
```

The demonstration proves Allura's reusable framework, identity, evidence, policy, harness, and cross-surface contracts. It is not a Salesforce integration, CRM demo, underwriting engine, lending recommendation, credit-decision model, or production mortgage system.

## Scenario

1. An authorized reviewer starts a mortgage-review case through one supported host.
2. Allura derives principal, tenant, workspace, and role. Microsoft Copilot Cowork identities are mapped from validated Microsoft Entra tenant/user/group/app-role claims; Claude Code and Codex use their separately reviewed host credentials and map to the same internal principal contract.
3. The reviewer provides or selects a document/evidence set. Scanned content preserves the original source, OCR engine/version, page/span references, quality state, classification, redaction, and freshness.
4. Allura evaluates deterministic policy requirements and returns allowed actions, missing proof, stale/degraded state, and cited evidence. The host skill only explains and guides.
5. An authorized human submits the required rationale through the normal decision endpoint.
6. Allura commits the permitted transition atomically and returns a server-issued receipt.
7. A later host verifies the same receipt, evidence identity, review state, and decision outcome through the shared read contract.

## Required Cross-Host Proof

- Copilot Cowork package activates the canonical skill, collects structured input through native elicitation where applicable, and calls the Allura remote MCP connector.
- Claude Code plugin and Codex skill/plugin adapters load the same canonical skill content and call the same allow-listed Allura tools.
- Normalized fixtures prove identical `ResolvedScope`, `RetrievalPlan`, source/evidence IDs, policy version, allowed actions, denial/degradation state, human-review requirement, and receipt ID across hosts.
- Host-specific envelope values may differ; authority, evidence, and outcome may not.

## Microsoft Entra RBAC Proof

- Validate token issuer, audience, tenant ID, object/user ID, expiry, and signature before mapping claims.
- Map approved Entra groups and app roles to Allura memberships and roles through server-owned configuration.
- Fail closed for unknown tenant, unknown role, missing/overage group claims, stale membership, disabled principal, token mismatch, and forged claims.
- Require fresh authorization for every consequential action; a role shown by the client is never sufficient.
- Record identity-provider reference, internal principal, mapped role, policy version, and correlation ID without storing bearer tokens or secrets.

## Acceptance Criteria

- [ ] One deterministic fixture runs through the installed dashboard `mortgage-approval-gate` module, Cowork, Claude Code, and Codex without host-specific workflow or policy forks.
- [ ] The dashboard module is loaded only from the server-issued allow-listed registry, uses shared governed components, and can be disabled without changing the workflow record or external host adapters.
- [ ] Intake retains source identity and OCR provenance; low-quality/missing/stale evidence cannot produce a complete-looking answer or allowed approval.
- [ ] A valid Entra reviewer can read authorized context; a validated Entra approver role can reach the normal confirmation step only when Allura policy permits it.
- [ ] Viewer-role, forged-role, cross-workspace, cross-tenant, missing-evidence, stale-evidence, concurrent-decision, and degraded-connector cases are denied or degraded without leakage.
- [ ] The successful path requires nonblank human rationale and returns one immutable receipt with actor, action, evidence, policy, timestamp, subject/version, and sync state.
- [ ] The same receipt can be fetched and verified from all three hosts through the shared read contract.
- [ ] Disable/revoke tests prove each host adapter can be removed without affecting Allura engine, dashboard, SDK, API, MCP, CLI, or the other adapters.
- [ ] Demo copy states clearly: illustrative mortgage-review workflow; no Salesforce; no automated underwriting; no lending/credit decision; no production or regulatory suitability claim.

## Explicit Exclusions

- No Salesforce API, Salesforce schema, Salesforce branding, Salesforce workflow, or Salesforce demo dependency.
- No automated mortgage approval, denial, underwriting, credit scoring, pricing, fair-lending determination, or compliance certification.
- No client-side Entra role acceptance, local policy decision, local receipt issuance, or direct database access.
- No real applicant PII, financial data, protected-class data, loan documents, or customer records in fixtures.
- No claim that Microsoft, Anthropic, OpenAI, Bank of America, or another company endorses or deploys Allura.

## Evidence

```text
docs/archive/allura/evidence/epic-25/25.5a/
```

Include sanitized fixture manifest, host package hashes, identity/RBAC mappings without secrets, cross-host parity report, OCR/evidence traces, denial/degraded cases, receipt verification, adapter disable/revoke proof, and a scripted ten-minute portfolio demonstration.
