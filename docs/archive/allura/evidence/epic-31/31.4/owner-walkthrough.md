# Story 31.4 owner walkthrough — GRAPH-32

**Status:** APPROVED — GRAPH-32 complete  
**Candidate commit:** `3fb8a4ec3ec9068ce910a1f6990b58a80241e582`  
**Candidate tree:** `11f42d59800c985a101a8a857a6e40c440ca4f10`  
**Previous rejected candidate:** `1bed5b08cf755f837c747e640f4b3570eb9d95cc`

This checklist prepares the guided local exercise. It must not be checked by an agent on the owner's behalf. Attendance, screenshots, reviewer approval, or HTTP success do not establish GRAPH-32.

## Rejection record — 2026-10-13 EDT

The owner inspected the live `/dashboard/graph` candidate and stated:

> "This doesn't match our initial design that we have. This doesn't design our mockup. There's a lot of brand violations here."

Disposition: `REJECTED`. The candidate does not advance to GRAPH-36. The visual authority and acceptance contract must be corrected, the shell and Graph experience repaired, and the entire walkthrough repeated against a newly frozen candidate.

## Repaired compact-brain candidate — 2026-10-13 EDT

The owner clarified the intended interaction after the rejection: the canvas should read as a connected knowledge brain made of compact icon-and-label nodes, and selecting a node should reveal the full record card in the inspector. Candidate `3fb8a4ec3ec9068ce910a1f6990b58a80241e582` implements that clarification while retaining the approved shell, warm dotted canvas, relationship topology, filters, same-data text view, and governed inspector.

Fresh Glaser and Munari reviews pass GRAPH-29 and GRAPH-30. Pike and Hightower found no interface, authority, build, or production blocker. The browser receipt reports zero page errors and binds all eight responsive/selection captures by SHA-256. These results authorize a new walkthrough; they do not complete it for the owner.

## Approval record — 2026-10-13 EDT

After the repaired candidate was opened live in the Codex in-app browser and the remaining GRAPH-32 and GRAPH-36 gates were stated explicitly, the owner responded:

> "APPROVE"

This is the explicit human acceptance of candidate `3fb8a4ec3ec9068ce910a1f6990b58a80241e582`. The owner did not separately attest each checklist gesture or a screen-reader session; those items retain their automated evidence and are recorded as an accepted residual limitation rather than fabricated manual evidence.

## Preconditions

- [ ] Owner confirms the commit and tree above match the packet and all three final specialist reviews.
- [ ] Local dashboard is shown with the governed seeded workspace, not production-looking mock data.
- [ ] Evidence ledger, manifest, reviews, captures, and limitations are open for inspection.
- [ ] The owner truth-state gallery is open and clearly identified as controlled presentation evidence, not live authority/data proof.

## Owner exercise

- [ ] Explore the overview map and verify visible real nodes and directed labeled relationships agree with the text representation.
- [ ] Pan, zoom, and use Fit view; confirm the minimap appears for a representative near-budget graph and is intentionally absent for the sparse three-node overview, while complete text access remains available.
- [ ] Filter a relationship and verify it disappears from canvas, text, Directed context, Lineage, and technical relationship keys; reset the filter.
- [ ] Select a node from canvas and text, inspect content/summary, provenance, evidence state, version/lineage, freshness, scope, and technical ID.
- [ ] Follow a connected relationship, confirm the explicit focused-context label, then use **Back to overview** and verify the original overview returns.
- [ ] Use keyboard only (Tab, Shift+Tab, Enter, Space) and confirm inspector focus and exact focus return.
- [ ] Use the owner's actual browser zoom control at 200%; verify no page-level horizontal overflow and graph panning remains contained.
- [ ] Exercise the owner's screen reader on the node list, a complete directed relationship name, state messaging, inspector, and return action.
- [ ] Inspect the live complete state and the controlled [`truth-state-gallery.md`](truth-state-gallery.md) presentations for empty, partial, degraded, denied/login, error/conflict, stale, evidence-absent, and evidence-unavailable behavior; confirm the distinction between live proof and controlled presentation review is clear.
- [ ] Confirm Security Path and Methodology/Catalog modes are absent, not simulated or disabled placeholders.

## Owner receipt

- Owner name / identifier: Human owner in originating Codex task `01a1316a-8945-7293-8739-c0e0b4bfbe9d`
- Date and timezone: 2026-10-13 EDT
- Local URL / environment: `http://127.0.0.1:31431/dashboard/graph`; governed seeded tenant/workspace; DevAuth viewer
- Candidate commit and tree rechecked: `3fb8a4ec3ec9068ce910a1f6990b58a80241e582` / `11f42d59800c985a101a8a857a6e40c440ca4f10`
- Completed checks: Owner inspected the repaired live compact-brain presentation and explicitly approved the candidate; the durable packet supplies automated interaction, responsive, authority, truth-state, and keyboard evidence.
- Rejected or incomplete checks: No new rejection. Individual checklist gestures and a manual screen-reader session were not separately attested.
- Observed limitations / requested repairs: None stated with approval.
- GRAPH-32 decision for repaired candidate: `APPROVE`
- Previous GRAPH-32 decision: `REJECTED` for candidate `1bed5b08cf755f837c747e640f4b3570eb9d95cc`
- Owner statement or approval reference: Verbatim `APPROVE`, originating Codex task, immediately after the agent stated that GRAPH-32 and GRAPH-36 were the only remaining gates.
