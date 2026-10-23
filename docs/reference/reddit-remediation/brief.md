# Allura Memory: Reddit remediation brief

> AI-Assisted Documentation: execution brief, 2026-10-20. Owner: Kotler. Technical delivery: Brooks/Team RAM. Scope: Allura_Memory only. This is a reviewable local coordination artifact, not a new brand strategy lock, deployment receipt, or human-research result. See [strategy receipt](strategy-receipt.md) for authority and limitations.

## The useful choice

A person evaluating Allura should be able to decide whether their team needs persistent, inspectable project context for connected agents. The first explanation must answer that question before asking them to understand the full governance system.

**Working explanation:** Allura stores project decisions and work history so connected agents can find them in later sessions. Your team decides what becomes approved shared knowledge.

**Demonstration task:** “We chose PostgreSQL because our project needs transactional records. Can the next agent retrieve that decision and its reason without me explaining it again?”

The exact example is an evaluation fixture, not proof of already-working behavior. Team RAM must demonstrate the current setup, save, separate-session retrieval, source and review state before copy calls the example verified.

## Reader and product boundary

Sabir accepted this repository's documentation audience on 2026-10-20: developers and teams using connected AI agents are primary; operators and independent human reviewers are supporting readers. The enterprise dashboard is optional. The older community-organizer persona is historical. Keep the Allura name and visual identity. This editorial decision does not declare a new whole-brand strategy lock or approve unverified behavior; the [authority receipt](strategy-receipt.md#documentation-audience-decision--accepted-2026-10-20) records the exact scope.

The engine stores/retrieves authorized context. The connected agent decides when to call it. A human makes the governed promotion decision. Hosting, configuration and maintenance remain the operator's responsibility. The optional enterprise dashboard and synthetic portfolio specimen are separate entry paths, not prerequisites for understanding the memory task.

Do not promise automatic capture of every conversation, automatic adherence by another agent, independent truth verification, elimination of hallucinations, fewer hours of work, certification, or production readiness.

## Feedback coverage and handoff

| Reddit concern | Concrete change | Accountable owner / review | Evidence needed to close |
|---|---|---|---|
| Value is hard to understand | Lead with one practical benefit and the PostgreSQL decision example | Ogilvy / Munari | Four of five unfamiliar intended readers explain purpose and next step after 30 seconds |
| Excessive text and diagrams | Task-focused READMEs; one primary action; individual asset keep/rework/retire ledger | Ogilvy and Glaser on separate files / Munari | Full inventory disposition, link checks and observed reading task |
| Choice overload | One first-use route; advanced architecture/operations available by task | Rand / Munari; RAM verifies behavior | Count required choices and steps; record hesitation and interventions |
| Memory becomes another job to manage | Explicit agent/service/operator/reviewer split; remove unnecessary manual steps | RAM for behavior, Ogilvy for explanation / independent RAM reviewer + Munari | Real journey receipt, manual-step/review-effort record and recovery check |
| Difficult first use | One current supported installation guide and save/retrieve example | Team RAM / independent technical reviewer | Clean setup and two-session record identity/source/review-state evidence |
| AI-generated noise and feature-first copy | Replace abstractions with concrete examples; every capability claim carries a source and evidence state | Ogilvy / Munari; Tufte when claim investigation is needed | Copy/claim map; no blanket compliance or self-management claim |
| Five-user evaluation | Prepared study, observed participants, revision and retest | Rand prepares tasks; product owner recruits; Munari reviews evidence | Actual participant observations; agent simulations excluded |
| Public link returned 404 | Check exact published links using an unauthenticated path after authorized publication | Delivery owner / Kotler verifies receipt | Actual public revision and link responses; local existence alone cannot close |

The target counts are proposed acceptance checks from UX-R01–07, not observed study results. The historical cause of the Reddit 404 is unknown. All concerns remain open until their scoped evidence is attached.

## Shared vocabulary

| Term in explanatory material | Meaning / corresponding record | Avoid implying |
|---|---|---|
| Saved evidence | Retained context/event recorded through an authorized capture path | Approved, correct or universally searchable just because saved |
| Proposal | Candidate knowledge awaiting a governed decision; `canonical_proposals` workflow | Every save necessarily creates a proposal |
| Approved knowledge | Content admitted through authorized independent human review and canonical materialization | A confidence score, agent persona, check mark or save response grants approval |
| Source | The actual reference/provenance supplied for a returned record | Missing metadata can be reconstructed by guessing |
| Review state | Returned or inspected lifecycle/decision state, with unknown explicitly labeled | Database presence establishes current approval |
| Decision receipt | Durable evidence of the governed decision | A UI toast or local delivery status proves remote sync |

Technical sources: [data contract](../../allura/DATA-DICTIONARY.md#bounded-memory-journey-data-contract), [design state machine](../../allura/DESIGN-ALLURA.md#curator-pipeline-state-machine), and [open decisions DOC-02–09](../../allura/RISKS-AND-DECISIONS.md#documentation-reconciliation-decisions--2026-10-18). Source inspection supports explanation; live behavior needs Team RAM's current-revision receipt.

## Three infographic storyboards

These are text storyboards for review, not production-approved artwork. Retain editable titles, labels, source notes and an equivalent text explanation. Use the existing official wordmark and approved Allura palette; do not create a new logo or visual identity.

### 1. Remember a project decision

- **Reader question:** What useful task does this memory service support?
- **Headline:** “A decision your next session can find.”
- **Flow:** Connected agent submits the PostgreSQL decision → Allura records the authorized context → a later connected session searches → the reader inspects returned context and available source/review state.
- **Takeaway:** “Give the next agent context to check before proposing a change.”
- **Source:** Blueprint core memory scope; Data Dictionary bounded journey; Team RAM's pending demonstration receipt.
- **Limit:** Until the demonstration passes, label it “illustrative workflow”; no guaranteed recall, automatic obedience or measured time-saving claim. Keep the human-approval explanation visible through a short label/link.

### 2. What happens automatically, and who acts?

- **Reader question:** Which work does Allura remove, and which work stays with me?
- **Headline:** “Who does what?”
- **Composition:** Four labeled responsibilities: agent/integration calls save/search; service persists and retrieves within authorized scope; operator configures and maintains the service; independent human reviews promotion candidates.
- **Takeaway:** “Routine memory calls and human approval have different jobs.”
- **Source:** Blueprint audience/boundary; Architecture governed write path; actual setup/manual-step receipt when available.
- **Limit:** Do not draw a background capture loop or default automatic integration that current code/configuration does not establish. Proposal eligibility is conditional.

### 3. Saved evidence versus approved knowledge

- **Reader question:** What can I trust about a saved record?
- **Headline:** “Saved does not mean approved.”
- **Flow:** Saved evidence → eligible proposal → independent human decision → approved canonical knowledge and decision receipt. Include a rejection branch retaining historical evidence without an approved-knowledge label.
- **Takeaway:** “Inspect the source and review state before relying on a result.”
- **Source:** Data Dictionary entities/lifecycle; Design curator state machine; Risks DOC-06/07 and existing verification gaps.
- **Limit:** Represent intended policy with explicit evidence state. Do not claim all implementation paths already meet reviewed-version, immutable-lineage or delivery requirements. Do not illustrate restored lineage as resolved.

## Production and validation order

1. Confirm the permitted editorial scope in the strategy receipt; escalate only actual strategy substitutions.
2. RAM demonstrates the real first-use journey, records current failures and supplies wording constraints.
3. Ogilvy creates task-specific copy; Glaser prepares visuals from approved facts; ownership is disjoint.
4. Rand assembles navigation and export consistency; Munari performs independent read-only QA.
5. Producers fix findings. Real intended readers perform the study, and the owner records observed outcomes.
6. Prepare publication artifacts; verify external state only after authorized publishing.

Brand consistency is one check. It cannot substitute for a working first-use path, current claim evidence, or a human study. Public collateral and whole-market strategy remain separate approval actions.
