---
version: alpha
name: Allura Operator Surface
description: Evidence-first mission-control UI for governed memory review.
colors:
  canvas: "#f6f3ec"
  surface: "#fffdf8"
  ink: "#1b1d21"
  muted: "#6b6e73"
  primary: "#2961b8"
  accent: "#f2752e"
  success-text: "#065f46"
  warning: "#c89b3c"
  danger: "#bf332e"
  on-primary: "#ffffff"
typography:
  heading:
    fontFamily: IBM Plex Sans
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: IBM Plex Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  technical:
    fontFamily: IBM Plex Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  review-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
  operator-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  metadata:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: 8px
  review-attention:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 8px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success-text}"
    rounded: "{rounded.full}"
    padding: 8px
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: 8px
---

## Overview

Allura is an evidence-first operator surface. It is mission-control software for governed actions, not a consumer chat product or generic SaaS dashboard. The interface must make provenance, tenant scope, authority, uncertainty, and outcomes inspectable.

This file formalizes existing tokens in `src/app/globals.css`; it does not create a second brand. New components use existing CSS custom properties (`var(--c-*)`, `var(--allura-*)`) rather than literal hex values.

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
