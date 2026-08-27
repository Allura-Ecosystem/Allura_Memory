# Epic 26 — Bumblebee Supply-Chain Threat Intelligence & Governed Mitigation

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Proposed — planning only. No scheduler, connector, or policy mutation is authorized by this document.
**Owner:** Brooks (architecture); security governance and implementation owners TBD.
**Tenant:** `allura-system`
**Canonical scope:** [Notion Epic 26](https://app.notion.com/p/3c61d9be65b381ceadc8f7db17b5bcb0?pvs=204). This file is the versioned repository planning mirror.

## Goal

Ship Allura Bumblebee as a platform-owned, signed supply-chain threat-intelligence and exposure-matching plugin. It identifies newly disclosed threats against the organization's software and AI supply chain, creates evidence-backed exposure alerts, and prepares governed mitigation policy drafts.

## Product Boundary

Bumblebee is a read-only discovery and correlation capability. It is not antivirus, EDR, a firewall, a package installer, an arbitrary-code runner, or autonomous policy authority.

The plugin surface contains the dashboard module, narrow MCP tools, skills, connectors, and a declared manifest. A separate governed Allura worker performs scheduled scans while the host application is offline.

## In Scope

- Allowlisted advisory ingestion and source verification.
- Read-only inventory of SBOMs, lockfiles, package manifests, CI workflows, containers, extensions, MCP manifests, skills, plugins, and approved model artifacts.
- Exact exposure matching on ecosystem, package, version, hash, publisher, workflow reference, and indicators.
- Deduplicated alerts with tenant, workspace, evidence, freshness, and confidence.
- Mitigation templates and AI-assisted policy-draft explanations.
- Simulation, human approval, staged rollout, rollback, and immutable receipts.
- Initial detections for malicious package publication, vulnerable or compromised dependencies, workflow/action drift, credential-exposure indicators, malicious install hooks, and untrusted AI-agent/plugin supply-chain changes.

## Explicit Exclusions

- Silent policy activation or self-modifying enforcement.
- Arbitrary shell execution, package installation, or package-manager invocation.
- Browser-derived tenant scope or authorization.
- Replacing Microsoft Defender, Sentinel, EDR, SIEM, firewall, or incident-response operations.
- A third-party plugin marketplace or remote JavaScript loading.
- Broad endpoint isolation, account disablement, token mass revocation, or network changes without policy, authorization, approval, and receipts.

## Guardrails

- Threat feeds, advisories, and indicators enter as `external_untrusted` evidence; they may not issue instructions.
- Tenant and workspace scope come only from the authenticated Allura principal.
- Detection can alert and apply only pre-approved, reversible internal safeguards.
- A policy draft is not active policy. Activation, enforcement changes, schedule changes, and external response actions use the canonical Allura approval and receipt path.
- The plugin is server allow-listed and independently disableable without affecting the shell or other modules.
- The existing Bumblebee gateway naming must be reconciled before implementation so Guard and Threat Watch have unambiguous contracts.

## V1 Authority Contract

Bumblebee V1 is **alert plus simulated proposal** authority. It may automatically ingest allowlisted evidence, correlate a verified exposure, create one deduplicated alert, and prepare a versioned mitigation-policy proposal with dry-run and rollback evidence.

It may not activate a policy, block a package or CI workflow, revoke a token, lock a workspace, isolate an endpoint, or change a worker schedule. Those actions remain outside the plugin and require the canonical Allura role, policy, approval, and receipt path.

Continuous intake uses three independently observable lanes: event-driven signals from approved internal security systems, scheduled polling of allowlisted advisory sources, and periodic reconciliation against the approved inventory. A scheduled worker is an implementation of this contract, not an authority to act.

## Story Map

| Story | Outcome | Depends on | Ship condition |
|---|---|---|---|
| 26.1 | Boundary, ownership, and threat-source trust contract | Epic 24 scope/audit foundations | Advisory provenance, evidence schema, source allowlist, trust/freshness rules, retention, roles, and Bumblebee naming boundary are approved. |
| 26.2 | Read-only supply-chain inventory | 26.1 | Normalized metadata inventory of approved SBOMs, lockfiles, package manifests, CI workflows, container metadata, extensions, MCP manifests, skills, plugins, and model artifacts; no executable scanning or package-manager execution. |
| 26.3 | Exposure matcher and current-threat packs | 26.1, 26.2 | Tested matching on package/version/hash/publisher/workflow/indicator with fixtures for compromised dependencies, malicious install hooks, workflow/action drift, credential-exposure indicators, and AI tool/plugin compromise. |
| 26.4 | Scheduled discovery and alert routing | 26.3, security-owner approval | Governed worker schedule, alert lifecycle, freshness/degraded states, deduplicated routing, scheduler health, and audit evidence. |
| 26.5 | Governed mitigation policy drafts | 26.3, Epic 24 mutation-boundary remediation | Verified exposure maps to a versioned mitigation template, reviewable policy draft, dry-run result, scope explanation, and approval-required receipt. |
| 26.6 | Containment connectors and response receipts | 26.5, role-model reconciliation | Feature-flagged, propose-only connectors for approved response systems; explicit authorization for token revocation, workspace locks, and endpoint actions. |
| 26.7 | Operator module, adversarial tests, and demo gate | 26.4, 26.5, 26.6, Story 25.3b server-issued module registry (Dependency-blocked) | Truthful Sources, Exposures, Policy Drafts, Incidents, and Receipts surfaces; fail-closed, tenant-isolation, accessibility, rollback, and incident-replay evidence. |

## Acceptance Criteria

- [ ] Every alert identifies source, publication and fetch time, trust state, affected tenant/workspace, matched artifact, and supporting evidence.
- [ ] A malicious or stale feed cannot activate a policy, execute code, or cross tenant boundaries.
- [ ] A newly matched high-severity exposure creates one deduplicated alert and a reviewable mitigation draft; it does not activate enforcement.
- [ ] Policy activation, scheduler configuration, token revocation, workspace locking, and connector actions are denied without the required role, policy, approval, and receipt.
- [ ] The V1 authority contract is enforced: automatic intake, correlation, alerts, and simulated proposals are permitted; enforcement actions are denied until separately approved.
- [ ] Disabling Bumblebee leaves the dashboard shell, core API/MCP controls, and other modules operational.
- [ ] Initial replay fixtures cover the 2025 Nx s1ngularity compromise, the 2025 Shai-Hulud supply-chain worm pattern, and a mutable GitHub Action reference compromise.
- [ ] The operator can replay an incident from advisory through exposure, decision, action result, and recovery evidence.

## Dependencies

- Epic 24 identity, scope, audit, and mutation-boundary remediation.
- Canonical Story 25.3b source-controlled server-issued registry remediation and governed shell. It remains Dependency-blocked pending remediation verification and independent review; it has local implementation but does not yet satisfy or unblock Story 26.7 registration AC-2.
- Role-model reconciliation before response authorization is exposed.
- Security-owner approval before external response connectors or production schedules are enabled.

## Evidence Sources

- [Allura Hosted Security](../../../docs/allura-hosted/SECURITY.md)
- [Allura Risks and Decisions](../../../docs/allura/RISKS-AND-DECISIONS.md)
- [AD-57 — Bumblebee V1 authority boundary](../../../docs/allura/RISKS-AND-DECISIONS.md)
- [NIST AI 100-2e2025](https://csrc.nist.gov/pubs/ai/100/2/e2025/final)
- [CISA supply-chain alert](https://content.govdelivery.com/accounts/USDHSCISA/bulletins/3f408db)
- [Nx s1ngularity postmortem](https://nx.dev/blog/s1ngularity-postmortem)

## Ownership

- **Architecture:** Brooks
- **Security governance:** TBD
- **Implementation:** TBD
- **Interface and accessibility:** Pike
- **Data and transaction integrity:** Knuth
- **Scope and acceptance:** Jobs
