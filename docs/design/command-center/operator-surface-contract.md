# Allura Operator Surface Design Contract

> [!NOTE]
> **AI-Assisted Documentation**
> This approved Epic 25 operator-surface contract was recovered from the preserved 2026-08-24 planning backup.
> It must remain aligned with [`DESIGN-ALLURA.md`](../../allura/DESIGN-ALLURA.md), real implementation tokens, and verified accessibility behavior.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Approved design authority for the governed operator surface.
**Source lineage:** Recovered from the preserved `DESIGN.md` planning artifact; restored 2026-08-28 without changing its substantive contract.

## Overview

Allura is an evidence-first operator surface. It is mission-control software for governed actions, not a consumer chat product or generic SaaS dashboard. The interface must make provenance, tenant scope, authority, uncertainty, and outcomes inspectable.

This file formalizes existing tokens in `src/app/globals.css`; it does not create a second brand. New components use existing CSS custom properties (`var(--c-*)`, `var(--allura-*)`) rather than literal hex values.

## Adopted Bahari grouped task boundary — 2026-11-05

The [approved curation milestone](../../../_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-05-bahari.md) extends the retained operator surface with a conversational curator experience; it does not replace or rebrand it. Story 9.5 uses the same official assets, Plex, semantic tokens and inspector/confirmation patterns. Proposed plain-language destinations organize Overview, Memories, Needs your decision, Activity and Settings; only genuinely implemented/authorized routes are clickable.

Show verified space/account, sources, before/after wording, current review state and exact evidence. Handle cleanup as work; ask once for exact independent-human review where needed, not repeated general consent. Source connection is not decision authority. Curate for me stays unavailable under current policy; no unsupported before-persistence mode, name picker, recovery button, undo or app-open trigger is promised.

Activity comes from per-item authoritative receipts/readback, distinguishing held/conflict/partial/unconfirmed from completed; timeout never implies rollback. Optional diagnostics contain raw IDs/scopes/tools while ordinary copy retains safety meaning. Keyboard/screen-reader labels, textual status, consequential scope confirmation, focus retention/return and 200% zoom are required actual-browser tests. Source presence, component checks and a document amendment are not actual-human or deployed usability acceptance. Preserve open 9.4 gates.

## Colors

- **Canvas:** cream workspace background; never a decorative gradient.
- **Surface:** paper-like review and receipt panels.
- **Ink / muted:** primary and secondary operational text.
- **Primary blue:** primary navigation and one high-emphasis action per decision state.
- **Orange:** review attention and active-state accent; not a generic warning substitute.
- **Green, gold, red:** success, caution, and destructive/denied semantics. Color never conveys state alone.

## Typography

Use IBM Plex Sans for readable operator content. Use IBM Plex Mono only for IDs, timestamps, trace references, policy IDs, hashes, payload versions, and receipt fields.

## Layout

Use the existing four-pixel spacing scale. Use the golden ratio for major two-pane layouts when the content allows it: the main reading/work pane gets about 61.8% and the support/list pane gets about 38.2%. On small screens, stack the panes in reading order instead of preserving the ratio.

Primary interface copy targets a sixth-grade reading level. Use short sentences, common words, and one idea per sentence. Put exact IDs, policy names, hashes, and system terms in secondary labels or an optional "Technical details" disclosure. Never hide safety meaning behind jargon.

The primary reading order is:

```text
Tenant and role → queue status → proposal summary → evidence → allowed decision → receipt
```

## Components

- Use the existing inspector pattern for evidence or receipt detail.
- Show a readable Memory Map when lineage matters. Nodes represent governed records or states; labeled connections explain how one item supports, becomes, or supersedes another. Every visual map has the same facts in text and is never the only way to understand the relationship.
- Use Base UI Dialog/AlertDialog primitives for consequential decisions; do not hand-build a modal.
- Use semantic HTML, visible focus, named controls, and server-sourced errors.
- Decision forms require a rationale and show server validation/conflict state without pretending success.

## Do's and Don'ts

**Do**

- Display active tenant/workspace, source, freshness, and degraded state.
- Show evidence before a privileged action.
- Use the approved `/brand/allura-lettermark-al-figma.png` asset.
- Make unknown, forbidden, stale, degraded, and conflict states explicit.
- Test accessible structure with role/name locators and focused ARIA snapshots.

**Do not**

- Add generated logos, Difference Driven tokens, generic shadcn color utilities, gradient hero sections, fake live charts, or vanity metrics.
- Render a successful decision before a server-issued receipt.
- Make a 404 route clickable.
- Use browser-provided `group_id` as authority.
- Add a new component library or copied dashboard template for Epic 25.
