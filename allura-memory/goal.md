/goal Rebuild the active `/dashboard` into the approved Allura Dreaming dashboard experience. The finished dashboard must communicate Allura Dreaming as a warm, search-first, provenance-first AI memory workspace for builders and reviewers who need to trust what the system knows, why it knows it, and whether that knowledge should be approved.

The product promise is: Memory that shows its work.

The dashboard must not feel like a generic admin panel, analytics screen, old SaaS dashboard, KPI board, or backend operations console. It must feel like a trusted review desk for AI memory: warm, calm, inspectable, evidence-led, and governed.

Core product concept:
The first-class object is not simply “a memory.” The first-class object is claim + proof. Every important piece of UI should reinforce that a memory is only useful when the user can see the claim, inspect the supporting evidence, understand its source, review its state, and decide whether it should be trusted.

Primary user jobs:
- Search what the memory system knows.
- Inspect the claim behind each memory.
- See the proof, source, trace, timestamp, and review status.
- Approve, reject, or hold promoted knowledge through governed actions.
- Understand recent memory activity without reading backend logs.
- See where memory work sits in the broader mission flow.
- Detect missing, degraded, mock, disconnected, or unverified states honestly.

Required feature set:

1. Memory Search
Make search the hero of the page. It should be the first and most obvious action. Users should immediately understand that they can ask the memory system what it knows and then verify why it knows it. Search should feel like a trust workflow, not a basic table filter.

2. Recent Memories / Search Results
Show recent or matching memory items as useful review cards. Each card should emphasize a plain-language claim, short context, confidence or review state, and a preview of supporting evidence. Avoid raw IDs, backend labels, and database-first presentation. Users should be able to understand what is being claimed before opening details.

3. Approval Queue
Show pending claims, memories, or promoted insights that require review. Approval and rejection actions must be visible, deliberate, and governed. The UI must make clear that approving knowledge changes its trust state. Do not show casual one-click approval without context. Each approval item should connect to evidence or provenance.

4. Provenance Panel
Make the provenance/detail panel the heart of the dashboard. When a memory or claim is selected, show claim + proof clearly: the claim, source, trace, timestamp, generator or reviewer, review state, confidence or trust status, and supporting evidence. Nothing should feel like magic. The dashboard must show its work.

5. Activity Rail
Include a lightweight activity rail showing recent memory events such as claims created, claims reviewed, approvals, rejections, sync events, source updates, governance changes, or blocked items. This should create trust and orientation without becoming a noisy backend log dump.

6. Mission / Kanban Strip
Include a compact mission or Kanban strip showing where memory work sits: queued, reviewing, approved, blocked, or shipped. This must stay compact. Do not build or elevate a full Kanban board. Its job is orientation, not project management takeover.

7. Honest Empty and Degraded States
If no data exists, say so clearly. If data is mocked, disconnected, stale, degraded, or not live, say so clearly. Never fake “live,” “healthy,” “synced,” “done,” or “complete” states. Empty states should explain what the user can do next without pretending the system has proof it does not have.

Identity and visual direction:
Use the approved Allura Dreaming identity. The dashboard must read as “Allura Dreaming.” Use the approved AL lettermark copied into the app as `/dreaming/allura-dreaming-mark.png`. Do not use the old Allura Memory lockup, stale `/brand/*` paths, old dashboard logo files, or old identity treatments.

Visual style:
- Warm parchment or cream page background.
- White working surfaces and review cards.
- Charcoal primary text.
- Muted supporting text.
- Orange primary actions.
- Green approval actions.
- Clear evidence/provenance surfaces.
- Calm spacing and editorial hierarchy.
- No dark dashboard shell.
- No generic admin chrome.
- No KPI grid as the hero.

Information hierarchy:
1. Search memories.
2. Recent memories or search results.
3. Approval queue.
4. Provenance/detail panel.
5. Recent activity.
6. Compact mission/Kanban strip.

Do not elevate:
- system health
- total memory counts
- raw database IDs
- backend internals
- graph decoration
- agent leaderboards
- full Kanban boards
- KPI grids
- fake operational status

Implementation boundaries:
Replace or isolate the active dashboard files:
`src/app/(main)/dashboard/layout.tsx`
`src/app/(main)/dashboard/page.tsx`
`src/app/(main)/dashboard/loading.tsx`
`src/app/(main)/dashboard/error.tsx`

Build the new dashboard through a clean `_dreaming` implementation tree:
`src/app/(main)/dashboard/_dreaming/DreamingDashboard.tsx`
`src/app/(main)/dashboard/_dreaming/data.ts`
`src/app/(main)/dashboard/_dreaming/types.ts`
`src/app/(main)/dashboard/_dreaming/components/`

Include components for shell, workflow navigation, memory search, recent memories, approval queue, provenance panel, activity rail, mission strip, degraded banner, and empty state.

Asset rule:
Copy the approved source lettermark from:
`/home/ronin704/Projects/design/brand-maker/clients/allura-memory/brand-assets/logos/lettermark-AL.png`

into:
`public/dreaming/allura-dreaming-mark.png`

Use it in code only as:
`/dreaming/allura-dreaming-mark.png`

Do not directly reference stale `/brand/*` paths.

Verification surface:
Do not mark the goal complete until all of the following evidence exists:
- Browser proof that `/dashboard` visually aligns with the localhost:6420 reference direction.
- Accessibility proof for the rebuilt dashboard.
- Forbidden-check output showing no old dashboard imports, stale brand paths, old logo lockups, KPI-grid drift, fake health/live/done claims, or hidden provenance.
- Team Durham/RuVix review evidence.
- Visible claim + proof model in the rendered UI.
- Approval actions visible and governed.
- Honest degraded/empty states where appropriate.

Forbidden outcomes:
The goal fails if the dashboard resembles the old dark shell, old sidebar/topbar layout, generic admin dashboard, KPI panel, backend monitoring page, graph decoration surface, or old Allura Memory branding. It also fails if provenance is hidden, approval actions are missing, proof is buried, or the UI claims data is live/healthy/done without evidence.

Iteration policy:
After each implementation pass, inspect the rendered result, compare it against the approved Allura Dreaming direction, run the relevant checks, and fix the highest-impact drift first. Prioritize product meaning over decorative polish: search, claim, proof, provenance, approval, and honest state must be clear before visual refinements.

Blocked stop condition:
If the goal cannot be completed under the current repo state, stop and report the exact blocker, what was attempted, what evidence was gathered, what remains incomplete, and the next input needed. Do not claim completion without proof.