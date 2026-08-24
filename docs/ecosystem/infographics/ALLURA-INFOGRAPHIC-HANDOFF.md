# Allura Infographic Collection — Kotler Final Approval and Visual Director Handoff

**Approved by:** Kotler, Team Durham Brand Orchestrator
**Decision timestamp:** 2026-08-15T12:01:17-04:00
**Strategy authority:** [ALLURA-INFOGRAPHIC-STRATEGY.md](./ALLURA-INFOGRAPHIC-STRATEGY.md)
**Copy reviewed:** [ALLURA-INFOGRAPHIC-COPY-DECK.md](./ALLURA-INFOGRAPHIC-COPY-DECK.md)
**Owner decision incorporated:** #4 uses **A Governed Memory Leaves Evidence**. The former universal receipt title remains prohibited.

## Overall Kotler decision

**Final approval for layout within classifications.** Ogilvy’s revised deck preserves the strategic hierarchy, canonical product names, evidence-to-knowledge distinction, runtime honesty, and owner-approved title for #4. All four requested corrections are present, the superseded wording is absent, every measured visible-copy count is within 100–180 words, and no new strategic drift was found.

Infographics 1, 2, 3, 5, and 6 are approved for layout within the copy deck’s stated public/core boundaries. Infographics 4, 7, 8, 9, and 10 are approved for technical/internal layout within the conditions below. The Ogilvy correction gate is closed. Public release remains separate from layout approval.

## Per-infographic decision

| # | Infographic | Status | Kotler condition |
|---:|---|---|---|
| 1 | Allura Ecosystem at a Glance | **Approved for layout** | Public core only. Do not add unapproved products, clients, repository counts, visibility, deployment status, or outer-ring relationships. |
| 2 | The Governed Memory Lifecycle | **Approved for layout** | Preserve “authorizes or queues,” the automated-curator caveat, and the distinction between evidence, proposal, and canonical knowledge. |
| 3 | Episodic Evidence vs. Semantic Knowledge | **Approved for layout** | Lock “one PostgreSQL engine, two governed logical layers.” Do not depict Neo4j as active or imply all retrieval is approved-only. |
| 4 | A Governed Memory Leaves Evidence | **Conditional/internal-only** | Owner-approved title is final. Layout may show only verified, operation-specific provenance fields. Public adaptation requires a field-to-operation evidence review. |
| 5 | The Allura Plugin System | **Approved for layout** | Omit versions, package counts, installation-success claims, model availability, and unsupported integrations. |
| 6 | Meet the Three Core Plugins | **Approved for layout** | Use the count-free responsibility framing. Keep Allura Cowork, Team Durham, and Team RAM Coding distinct. |
| 7 | Team Durham Brand Workflow | **Conditional/internal-only** | Corrections verified. Do not publish Phase 3.5 taxonomy, runtime-role availability, or the numeric QA threshold until approved. |
| 8 | Team RAM Software-Delivery Workflow | **Conditional/internal-only** | Correction verified. Present this as a normative workflow, not proof that named agents executed or that all legacy paths are migrated. |
| 9 | Allura Cowork Runtime-Handoff Flow | **Conditional/internal-only** | Approved only as an abstract contract flow. A prepared packet remains “not yet executed” until the receiving runtime produces evidence. |
| 10 | The Six Allura Governance Policies | **Conditional/internal-only** | Correction verified. Public release remains blocked pending policy-namespace and stale Neo4j-text remediation. |

**Blocked infographics:** None after the owner approved #4’s evidence-safe title. The prohibited claims and unresolved release gates below remain blocked.

## Correction gate — closed

The revised copy deck was re-reviewed without editing it. All four required corrections pass:

1. **#10 append-only wording:** The copy now attributes append-only behavior to the governance registry rather than overstating database-level enforcement. The old sentence is absent.
2. **#7 Brain availability:** The closeout step now begins “When Allura Brain is available.” The unconditional old sentence is absent.
3. **#7 runtime-honesty ledger:** Statement 7.4 now uses the shared-plugin-contract wording and cites `allura-plugins/README.md:63-65` plus the Cowork runtime-honesty contract. The unsupported Team Durham citation is absent from that claim.
4. **#8 memory-unavailable path:** The copy now uses available approved Brain context and explicitly discloses the local-evidence fallback. The unconditional old sentence is absent.

### Visible-copy verification

| Infographic | Declared | Recalculated | Gate |
|---:|---:|---:|---|
| 1 | 160 | 160 | Pass |
| 2 | 161 | 161 | Pass |
| 3 | 149 | 149 | Pass |
| 4 | 144 | 144 | Pass |
| 5 | 158 | 158 | Pass |
| 6 | 158 | 158 | Pass |
| 7 | 177 | 177 | Pass |
| 8 | 168 | 168 | Pass |
| 9 | 169 | 169 | Pass |
| 10 | 161 | 161 | Pass |

**Strategic drift check:** Pass. The revision adds only the requested evidence and availability qualifications. Product meaning, audience classification, message hierarchy, governance boundaries, and production/publishing sequence remain unchanged.

## Locked names and terminology

### Product and system names

- **Allura Ecosystem** — the umbrella ecosystem.
- **Allura Memory** — the canonical governed memory service.
- **Allura Brain** — the functional alias for Allura Memory, not a separate product or source of truth.
- **Allura Plugins** — the plugin distribution and model-governance layer.
- **Allura Cowork** — the cross-runtime coordination plugin.
- **Team Durham** — the brand-production system/plugin.
- **Team RAM Coding** — the installable software-delivery plugin.
- **Team RAM** — the broader standalone engineering harness; never substitute this name for Team RAM Coding.

### Governance language

- Activity and episodic traces are **evidence**, not automatically knowledge or approved truth.
- A promotion proposal remains evidence until governance decides its state.
- Approved semantic knowledge is **canonical knowledge**.
- Operations are **tenant-scoped** through `group_id`.
- Updates preserve history through **supersession**, not silent overwrite.
- **Provenance** makes claims inspectable; it does not make them true.
- Human approval remains the explicit accountability boundary, while automated-curator behavior is disclosed as an unresolved implementation caveat.
- Use lowercase governance `pol-*`, uppercase kernel `POL-*`, and RuVix `RULE-*` only with their full namespace. Never use a bare label such as “Policy 4.”
- Use “one PostgreSQL engine, two governed logical layers.”

## Prohibited claims

- “Every Memory Comes With a Receipt,” “every memory has a receipt,” or any equivalent universal statement.
- Every mutation or retrieval returns one unified `GovernanceReceipt`.
- The audit history is cryptographically chained, tamper-proof, or independently verified.
- Neo4j is the active semantic backend, fallback, or production dependency.
- The current RuVector adapter is the native RuVector extension or Rust crate.
- Every promotion receives individual human review, or every approval materializes canonical knowledge synchronously.
- Every retrieval is approved-only by default.
- The evidence table is physically immutable across all access paths without database-level proof.
- A plugin bypasses or replaces Allura Memory governance.
- Allura Cowork prevents hallucinations.
- Claude, Codex, a named role, or a subagent executed because its name appears in a diagram, perspective, or handoff packet.
- A prepared handoff proves that the receiving runtime acknowledged, executed, validated, or closed the work.
- Unverified package versions, source-definition counts, runtime support, integrations, current health, ports, deployment status, production readiness, adoption, customer names, or customer outcomes.
- Compliance with “the six policies” without naming the applicable policy namespace and enforcement path.

## Unresolved `[DATA NEEDED]` gates

1. **Ecosystem:** authoritative inventory, visibility, approved product/client relationships, deployment status, and canonical Team Durham repository slug.
2. **Promotion:** public wording for automated curator mode and interface-specific synchronous-versus-queued materialization.
3. **Retrieval and storage:** target retrieval default, native RuVector readiness, and database-level event-mutation controls.
4. **Evidence/receipts:** operation-by-operation receipt coverage, unified contract implementation, field-population coverage, and cryptographic verification status.
5. **Plugins:** reconciled package versions, command/agent counts, runtime-support matrix, installation receipts, optional-integration availability, and model-registry status.
6. **Team Durham:** Phase 3.5 taxonomy, public QA-threshold decision, runtime-role availability, and real case-study execution receipts.
7. **Team RAM Coding:** legacy `roninmemory`/direct-memory remediation, package census, runtime support, and execution receipts.
8. **Allura Cowork:** real dual-runtime execution receipts, current install/load evidence, CI coverage, and an approved publication example.
9. **Policies:** `pol-*`/`POL-*` namespace remediation, updated `pol-003`/`pol-004` wording after Neo4j sunset, enforcement matrix, and automated-curator interpretation.

## Production order versus publishing order

### Production order

Build foundational definitions before the public synthesis:

1. The Governed Memory Lifecycle
2. Episodic Evidence vs. Semantic Knowledge
3. A Governed Memory Leaves Evidence
4. The Six Allura Governance Policies
5. The Allura Plugin System
6. Meet the Three Core Plugins
7. Team Durham Brand Workflow
8. Team RAM Software-Delivery Workflow
9. Allura Cowork Runtime-Handoff Flow
10. Allura Ecosystem at a Glance

### Publishing order

Lead public communication with orientation, then move into technical depth:

1. Allura Ecosystem at a Glance
2. The Governed Memory Lifecycle
3. Episodic Evidence vs. Semantic Knowledge
4. The Allura Plugin System
5. Meet the Three Core Plugins
6. A Governed Memory Leaves Evidence
7. Team Durham Brand Workflow
8. Team RAM Software-Delivery Workflow
9. Allura Cowork Runtime-Handoff Flow
10. The Six Allura Governance Policies

Publishing approval is not implied by production approval. Technical/internal pieces remain internal until their release gates close.

## Visual Director brief

The Visual Director may begin layout and production now, strictly within the approved scope and classifications in this handoff. The Ogilvy correction gate is closed.

- Preserve one central message and a 30–60 second comprehension target for every piece.
- Preserve the copy hierarchy: headline, introduction, three-to-five information groups, process/comparison labels, takeaway, and optional action.
- Do not add facts, metrics, system nodes, integrations, clients, ports, versions, status indicators, or runtime activity that are absent from approved copy.
- Do not use connectors, avatars, glow states, checkmarks, or timelines in ways that imply a runtime, subagent, approval, promotion, deployment, or handoff actually executed.
- Mark conceptual or normative flows as such. Keep “not yet executed,” `[DATA NEEDED]`, internal-only, and approval boundaries visible where required.
- Preserve the distinction between episodic evidence and semantic knowledge, Allura Memory and Allura Brain, plugins and runtimes, and the three policy namespaces.
- Design accessibility into the first layout: sufficient contrast, readable type, non-color status cues, logical reading order, concise labels, and alt text based on Ogilvy’s drafts.
- Recount visible copy after layout changes. Any wording change that alters factual meaning or hierarchy returns to Ogilvy and Kotler before production approval.
- This review generated no images. This handoff now authorizes layout and production within the approved factual and classification boundaries above.

## Runtime-honesty record

- **Explorer subagents:** Three real explorer subagents ran and returned repository evidence packets: Russell for the ecosystem, Bohr for Allura Memory, and Sagan for Allura Plugins.
- **Kotler:** A real Kotler subagent, nickname **Volta** in the orchestration record, authored the strategy and performed the strategic approvals.
- **Ogilvy:** A real Ogilvy subagent, nickname **Peirce**, authored and revised the copy deck.
- **Visual Director:** Glaser has not run. No Visual Director execution is claimed.
- **Images and layouts:** No images or layouts were generated in this strategy, copy, or approval task.
- **Memory:** Approved-memory searches returned no matching prior guidance. Final Kotler and Ogilvy outcomes were written to Allura Brain as episodic evidence (`e0498934-c644-4c7a-8406-cb73ef59d1dc` and `482788a5-a1f5-4061-99e3-763be064cf10`). No semantic promotion is claimed.

## Final gate

**Kotler final approval:** The revised copy deck is approved for layout within each infographic’s classification. The correction gate is closed. The Visual Director may begin scoped layout and production and must return any factual, structural, or claim-expanding change to Kotler. Conditional/internal-only and public-release gates remain in force. Universal receipt language remains prohibited regardless of visual treatment.

**Visual Director handoff status:** **READY FOR LAYOUT WITHIN CLASSIFICATIONS.**
