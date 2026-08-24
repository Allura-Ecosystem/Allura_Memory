# Story 25.4b — Portable Agent-Skill Interoperability and Entra Policy Intake

**Status:** Planned / dependency-blocked
**Owner:** Troy + Brooks + Pike + Bellard + Hightower
**Depends on:** 25.2 authenticated workspace read contract; 25.4a governed assistant and cross-surface parity
**Blocks:** Story 25.5a and cross-host claims in portfolio/demo material; does not block the local curator console

## Outcome

Create one canonical, host-neutral Allura skill source for the Mortgage Approval Gate and package thin adapters for Microsoft Copilot Cowork, Claude Code, and Codex. Each host can guide intake, collect or pass a policy draft, explain governed review context, and call narrow Allura MCP/API tools. Microsoft Copilot Cowork additionally uses native MCP elicitation for structured policy intake and Microsoft Entra ID for user/group/app-role identity. Allura remains the sole authority for scope, role mapping, policy validation, evidence, promotion, audit, and receipts.

## Product Boundary

```text
Canonical Allura Mortgage Approval Gate skill source
  ├─ Copilot Cowork M365 package + remote HTTPS MCP connector
  ├─ Claude Code plugin / Agent Skills adapter
  └─ Codex skill / plugin adapter
       → authenticated Allura MCP/API adapter
       → server-derived principal, tenant/workspace, roles, and policy
       → shared RetrievalPlan / evidence / decision / receipt services
```

Native MCP elicitation forms are the first Cowork policy-intake UI. An optional MCP App widget may later present a richer policy review or evidence card. Claude Code and Codex use their native skill/plugin packaging but do not implement separate workflow logic, authorization, or storage paths.

## Canonical Skills

- `allura-mortgage-approval-gate` — guides `intake → evidence/OCR → policy → human review → receipt` without implementing local authority.
- `allura-workspace-setup` — guides policy intake and invokes a server-defined form when the host supports elicitation.
- `allura-policy-review` — explains a policy result and unresolved risks in plain language.
- `allura-review-context` — explains one authorized mortgage-review item using cited evidence.
- `allura-verified-research` — performs governed external research and keeps results provisional until a user explicitly saves them as evidence.

Skills are instructions, not permission grants. The canonical skill source is host-neutral; packaging adapters may reference allow-listed tools but cannot fork workflow rules or expand connector capabilities.

## Initial MCP Tools

Read-only:

- `search_review_context`
- `get_evidence`
- `get_receipt`
- `get_relationships`
- `research_public_web`

Confirmation-required, dependency-gated:

- `save_policy_draft`
- `save_research_as_evidence`
- `request_review`

Not exposed in the initial package:

- approval, rejection, promotion, receipt issuance, external writes, raw SQL/vector access, connector credential management

## Acceptance Criteria

- [ ] One canonical Allura Agent Skill source produces validated adapters for Copilot Cowork, Claude Code, and Codex. Adapter packages contain original Allura manifests/icons/instructions and do not copy host branding or sample skill prose.
- [ ] The Cowork package contains an `agentConnectors` entry for the remote Allura MCP server and uses HTTPS Streamable HTTP, JSON-RPC/MCP `initialize`, `tools/list`, and `tools/call`, with an included tool-description JSON and explicit tool safety annotations.
- [ ] Microsoft identity uses reviewed Entra ID token validation. The server maps tenant ID, object/user ID, group claims, and app-role claims to an Allura principal, allowed tenants/workspaces, and roles; raw claims are not trusted as direct database predicates.
- [ ] Claim overage, missing groups, stale membership, unknown app role, disabled user, token audience/issuer mismatch, and forged claims fail closed without cross-scope leakage.
- [ ] Claude Code and Codex adapters authenticate through separately reviewed host credentials/tokens and resolve to the same internal Allura principal/role contract; neither host receives Microsoft-only authority by imitation.
- [ ] Cowork cannot send authoritative tenant, workspace, role, policy, or allowed-action values. Forged values are denied without cross-scope counts, labels, citations, or cached detail leakage.
- [ ] `allura-workspace-setup` uses native MCP elicitation to collect a typed `PolicyIntakeDraft`; the server revalidates every submitted value and returns a review summary before any save action.
- [ ] Policy intake covers workspace name, member/role rules, source and connector allowlists, OCR/review rules, redaction/classification, retention, assistant authority, promotion requirements, and receipt requirements.
- [ ] Exa or another external research service is invoked only behind an Allura capability manifest. Search results remain provisional external evidence until a confirmation-required Allura action records them.
- [ ] The same authorized source IDs, citations, freshness, `RetrievalPlan`, denied/degraded behavior, allowed-action hints, human-review requirement, and receipt identity are proven across Cowork, Claude Code, Codex, dashboard, REST API, SDK, MCP, and CLI fixtures where exposed.
- [ ] Private host tests pass before organization deployment: Cowork `Only you`, a bounded Claude Code plugin fixture, and a bounded Codex skill/plugin fixture. Hightower verifies disable/revoke behavior, audit evidence, connector failure handling, and rollback for each host.
- [ ] Mobile limitations for Cowork MCP connectors are documented; no mobile support claim is made without separate evidence.

## Explicit Exclusions

- No direct database, vector index, or object-store access from Cowork, Claude Code, or Codex.
- No raw Exa or other provider key in any host client.
- No copied Microsoft, Anthropic, OpenAI, Salesforce, or third-party sample plugin, skill prose, icons, or branding.
- No Salesforce dependency, CRM demo, or Salesforce-native workflow; Mortgage Approval Gate is vendor-neutral.
- No broad marketplace publication, partnership claim, underwriting claim, lending-decision claim, or production-regulatory suitability claim in this story.
- No automatic promotion of Cowork files, OCR output, research, or connector data into shared knowledge.
- No Copilot dependency in Allura's engine, dashboard, SDK, API, MCP, or CLI operation.

## Reference Sources

Official Microsoft reference material is maintained outside the product repository at:

```text
/mnt/projects/git/references/microsoft-copilot/
```

Use patterns and standards only. The pinned source and license record is `REFERENCE-MANIFEST.md` in that reference workspace.

## Evidence

```text
docs/archive/allura/evidence/epic-25/25.4b/
```

Include package validation, manifest/skill snapshots, private install evidence, authentication proof without secrets, elicitation schema/response fixtures, cross-scope attacks, Exa provisional-evidence cases, MCP tool parity, disable/revoke behavior, and rollback proof.
