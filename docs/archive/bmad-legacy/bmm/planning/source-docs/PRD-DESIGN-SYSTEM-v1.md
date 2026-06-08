> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# PRD: Allura Memory Design System v1.0

**Date:** 2026-05-23
**Author:** Brooks (Architect) + Design Team
**Status:** Draft — Pending Design Team Review
**Related:** [BLUEPRINT.md](./BLUEPRINT.md) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md) · [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md)

---

## 1. Purpose

This PRD defines the visual design system, component library, and dashboard specifications for the Allura Memory governed memory platform. It provides the design team with precise requirements for:

- Brand identity application across digital surfaces
- Dashboard UI components (Mission Control, Curator, Memory Viewer)
- Design token system (colors, typography, spacing, shadows)
- Figma file organization and asset management
- Accessibility and responsive behavior standards

---

## 2. Core Concepts

| Concept | Definition |
|---------|------------|
| **Mission Control** | Primary operator dashboard at `/dashboard` and `/allura` — real-time memory health, agent status, curation queue |
| **Curator View** | Human-in-the-loop approval interface at `/curator` — review, approve, reject, deprecate memory proposals |
| **Memory Viewer** | Browse/search interface at `/memory` — inspect episodic traces and semantic insights |
| **Brand Surface** | All customer-facing touchpoints: dashboard, marketing site, documentation, presentations |
| **Design Token** | Named, semantic variable referencing brand values (e.g., `--allura-deep-navy` = `#1A2B4A`) |

---

## 3. Business Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| B1 | Design system must establish trust and governance authority through visual language | P0 |
| B2 | Dashboard must surface critical memory health and curation status at a glance | P0 |
| B3 | Curator interface must make approval/rejection decisions feel consequential and safe | P0 |
| B4 | All surfaces must meet WCAG 2.1 AA accessibility standards | P0 |
| B5 | Design system must scale from single-agent to enterprise multi-tenant deployments | P1 |
| B6 | Brand identity must differentiate Allura from generic "AI tool" aesthetics | P1 |

---

## 4. Functional Requirements

### 4.1 Design Tokens (F1–F5)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F1 | Color system with semantic roles: primary, secondary, success, warning, danger, info, neutral | `src/styles/presets/allura.css` | [DESIGN-ALLURA.md#colors](./DESIGN-ALLURA.md#colors) |
| F2 | Typography scale: 12 grades from caption to display, Inter font family | `src/app/globals.css` + font imports | [DESIGN-ALLURA.md#typography](./DESIGN-ALLURA.md#typography) |
| F3 | Spacing scale: 4px base unit, 24 steps, semantic names (xs, sm, md, lg, xl, 2xl) | `src/styles/presets/allura.css` | [DESIGN-ALLURA.md#spacing](./DESIGN-ALLURA.md#spacing) |
| F4 | Shadow system: 5 elevations (card, hover, modal, dropdown, tooltip) | CSS custom properties | [DESIGN-ALLURA.md#elevation](./DESIGN-ALLURA.md#elevation) |
| F5 | Border radius scale: 4px (buttons), 8px (cards), 16px (panels), 24px (modals) | CSS custom properties | [DESIGN-ALLURA.md#shape](./DESIGN-ALLURA.md#shape) |

### 4.2 Brand Components (F6–F12)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F6 | **StatusBadge**: 5 states (active, pending, approved, rejected, deprecated) with color + icon | `src/components/allura/status-badge.tsx` | [DESIGN-ALLURA.md#status-badge](./DESIGN-ALLURA.md#status-badge) |
| F7 | **ConfidenceBar**: 0-100% visual bar with color thresholds (red <60, amber 60-80, green 80+) | `src/components/allura/confidence-bar.tsx` | [DESIGN-ALLURA.md#confidence-bar](./DESIGN-ALLURA.md#confidence-bar) |
| F8 | **TraceCard**: Tool call display — name, input snippet, timestamp, agent avatar | `src/components/allura/trace-card.tsx` | [DESIGN-ALLURA.md#trace-card](./DESIGN-ALLURA.md#trace-card) |
| F9 | **EmptyState**: Zero-data placeholder with warm text, optional CTA, no error icons | `src/components/allura/empty-state.tsx` | [DESIGN-ALLURA.md#empty-state](./DESIGN-ALLURA.md#empty-state) |
| F10 | **PanelDrawer**: 420px desktop / 100% mobile right-sliding panel with lazy loading | `src/components/allura/panel-drawer.tsx` | [DESIGN-ALLURA.md#panel-drawer](./DESIGN-ALLURA.md#panel-drawer) |
| F11 | **MemoryCard**: Composes StatusBadge + ConfidenceBar + memory text + actions | `src/components/allura/memory-card.tsx` | [DESIGN-ALLURA.md#memory-card](./DESIGN-ALLURA.md#memory-card) |
| F12 | **GraphTab**: ForceGraph2D visualization of Neo4j semantic graph with node interactions | `src/components/allura/graph-tab.tsx` | [DESIGN-ALLURA.md#graph-tab](./DESIGN-ALLURA.md#graph-tab) |

### 4.3 Dashboard Layout (F13–F18)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F13 | **Mission Control shell**: Header (logo + nav + user), sidebar (sections), main content area | `src/app/(main)/dashboard/layout.tsx` | [DESIGN-ALLURA.md#dashboard-shell](./DESIGN-ALLURA.md#dashboard-shell) |
| F14 | **Section tabs**: Memories, Insights, Trace Logs, Provenance, Extracted Facts, Approval Queue | `src/lib/dashboard/allura-route.ts` | [DESIGN-ALLURA.md#route-sections](./DESIGN-ALLURA.md#route-sections) |
| F15 | **Metric cards**: KPI display — memory count, pending proposals, approval rate, graph nodes | `src/components/dashboard/metric-card.tsx` | [DESIGN-ALLURA.md#metric-cards](./DESIGN-ALLURA.md#metric-cards) |
| F16 | **Activity feed**: Chronological event timeline with status indicators | `src/components/dashboard/activity-panel.tsx` | [DESIGN-ALLURA.md#activity-feed](./DESIGN-ALLURA.md#activity-feed) |
| F17 | **Search input**: Scoped search with `group_id` filter, hybrid (vector + text) behind the scenes | `src/components/dashboard/search-input.tsx` | [DESIGN-ALLURA.md#search](./DESIGN-ALLURA.md#search) |
| F18 | **Responsive behavior**: Desktop (sidebar persistent), Tablet (sidebar collapsible), Mobile (bottom nav) | CSS breakpoints + layout components | [DESIGN-ALLURA.md#responsive](./DESIGN-ALLURA.md#responsive) |

### 4.4 Curator Interface (F19–F23)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F19 | **Queue table**: Pending proposals with sortable columns (confidence, agent, date, type) | `src/app/curator/page.tsx` | [DESIGN-ALLURA.md#curator-queue](./DESIGN-ALLURA.md#curator-queue) |
| F20 | **Proposal detail view**: Full memory text, provenance chain, evidence cards, confidence history | `src/components/allura/panel-drawer.tsx` | [DESIGN-ALLURA.md#proposal-detail](./DESIGN-ALLURA.md#proposal-detail) |
| F21 | **Action buttons**: Approve (deep_navy filled), Reject (coral filled), Deprecate (ghost), Edit (outlined) | `src/components/allura/panel-drawer.tsx` | [DESIGN-ALLURA.md#curator-actions](./DESIGN-ALLURA.md#curator-actions) |
| F22 | **Batch operations**: Multi-select + bulk approve/reject with confirmation modal | `src/app/curator/page.tsx` | [DESIGN-ALLURA.md#batch-ops](./DESIGN-ALLURA.md#batch-ops) |
| F23 | **Audit trail sidebar**: Who approved what, when, with Ed25519 signature (when implemented) | `src/components/dashboard/audit-panel.tsx` | [DESIGN-ALLURA.md#audit-trail](./DESIGN-ALLURA.md#audit-trail) |

---

## 5. Brand Identity Application

### 5.1 Color System

| Token | Hex | Role | Usage |
|-------|-----|------|-------|
| `--allura-deep-navy` | `#1A2B4A` | Primary brand | Headers, primary buttons, active states |
| `--allura-coral` | `#E85D4E` | Accent/CTA | Destructive actions, alerts, highlights |
| `--allura-warm-gray` | `#737373` | Secondary text | Captions, metadata, disabled states |
| `--allura-surface` | `#F8FAFC` | Background | Page background, card backgrounds |
| `--allura-border` | `#E2E6EA` | Dividers | Card borders, table rows, input borders |
| `--allura-success` | `#22C55E` | Positive | Approved status, success toasts |
| `--allura-warning` | `#F59E0B` | Caution | Pending status, warnings |
| `--allura-danger` | `#DC2626` | Critical | Rejected status, errors |

### 5.2 Typography Scale

| Grade | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display | 32px | 700 | 1.2 | Page titles |
| H1 | 24px | 600 | 1.3 | Section headers |
| H2 | 20px | 600 | 1.4 | Card titles |
| H3 | 16px | 600 | 1.5 | Subsection headers |
| Body | 14px | 400 | 1.6 | Primary text |
| Caption | 12px | 500 | 1.5 | Metadata, timestamps |
| Overline | 10px | 700 | 1.4 | Labels, badges (uppercase) |

### 5.3 Token Scope Clarification

The Allura design system uses a **dual-palette architecture**:

| Scope | Purpose | Primary Color | Background | CTA |
|-------|---------|--------------|------------|-----|
| **Brand Identity** | Marketing, logo contexts, headers, external surfaces | Deep Navy `#1A2B4A` | White/neutral | Coral `#E85D4E` |
| **Dashboard Application** | Operator UI, Mission Control, Curator, Memory Viewer | Charcoal `#1A1A1A` (text) | Warm Cream `#F5F0E8` | Orange `#F97316` |

These palettes coexist deliberately:
- **Brand tokens** (`--allura-deep-navy`, `--allura-coral`) are used for brand-level surfaces and marketing.
- **Dashboard tokens** (`--dashboard-bg`, `--dashboard-cta-primary`) are used for the operator application UI per Dashboard Visual Spec v2.
- Dark mode (Epic 11 Story 11.3) must define both brand and dashboard dark variants, not flatten them into a single palette.

Reference: [Dashboard Visual Spec v2](../../../../archive/docs/design/DASHBOARD-VISUAL-SPEC-v2.md)

### 5.4 Logo Usage

| Asset | File | Usage |
|-------|------|-------|
| Wordmark | `public/readme/logo-v2.png` | Dashboard header, marketing |
| AL Lettermark | Figma hash: `6aed0ce75775072290fc6449e04b29bd4c4324a8` | Favicon, app icon, small spaces |
| Wordmark (alt) | Figma hash: `2cc1e03fb0d2364749e9b0b0027dcda3bdce6b4d` | Mission Control wireframe |

---

## 6. Figma File Organization

### 6.1 File Structure

```
Allura Design System (Figma)
├── 📁 01 — Brand Identity
│   ├── Logo (wordmark + lettermark)
│   ├── Color Tokens
│   ├── Typography Scale
│   └── Icon Library
├── 📁 02 — Design Tokens
│   ├── Colors (semantic roles)
│   ├── Spacing
│   ├── Shadows
│   └── Border Radius
├── 📁 03 — Components
│   ├── StatusBadge
│   ├── ConfidenceBar
│   ├── TraceCard
│   ├── EmptyState
│   ├── PanelDrawer
│   ├── MemoryCard
│   └── GraphTab
├── 📁 04 — Dashboard Pages
│   ├── Mission Control (/dashboard)
│   ├── Allura Route (/allura)
│   ├── Curator Queue (/curator)
│   └── Memory Viewer (/memory)
├── 📁 05 — Responsive States
│   ├── Desktop (1280px+)
│   ├── Tablet (768px)
│   └── Mobile (375px)
└── 📁 06 — Prototypes
    ├── Curator Approval Flow
    ├── Memory Search Flow
    └── Graph Exploration Flow
```

### 6.2 Key Dates for Figma

| Date | Milestone | Figma Action |
|------|-----------|--------------|
| **2026-05-23** | Research complete, Phase 1 consensus | Update roadmap timeline in Mission Control wireframe |
| **2026-05-24** | pgvector 0.8 upgrade | Add system health metric card variant |
| **2026-05-27** | Temporal queries | Add "time range" filter to search component |
| **2026-06-02** | Ed25519 signing | Add signature verification badge to audit trail |
| **2026-06-09** | Cross-encoder reranker | Add confidence breakdown tooltip (vector + text + rerank scores) |
| **2026-06-16** | HITL pipeline complete | Finalize Curator approval flow prototype |

---

## 7. Accessibility Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Color contrast | WCAG 2.1 AA 4.5:1 | All text/background pairs verified |
| Keyboard navigation | WCAG 2.1 AA 2.1.1 | All interactive elements tab-accessible |
| Focus indicators | WCAG 2.1 AA 2.4.7 | 2px outline, deep_navy color |
| Screen reader | WCAG 2.1 AA 1.3.1 | ARIA labels on all status badges, confidence bars |
| Motion | WCAG 2.1 AA 2.3.3 | `prefers-reduced-motion` respected |
| Touch targets | WCAG 2.1 AA 2.5.5 | Minimum 44×44px on mobile |

---

## 8. Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Desktop XL | 1440px+ | Full sidebar, 3-column metrics, graph visible |
| Desktop | 1280px | Standard sidebar, 2-column metrics |
| Tablet | 768px | Collapsible sidebar, stacked metrics, simplified graph |
| Mobile | 375px | Bottom navigation, single column, drawer-based detail |

---

## 9. Deliverables

| Deliverable | Format | Owner | Due |
|-------------|--------|-------|-----|
| Design tokens (JSON) | `figma-brand-tokens.json` | Design Team | 2026-05-24 |
| Component library (Figma) | Published team library | Design Team | 2026-05-27 |
| Mission Control wireframe (updated) | Figma file | Design Team | 2026-05-27 |
| Curator flow prototype | Figma prototype | Design Team | 2026-06-02 |
| Responsive mockups | Figma frames | Design Team | 2026-06-09 |
| Accessibility audit report | Markdown | Design Team + QA | 2026-06-16 |

---

## 10. Open Questions

1. **Dark mode**: Is this required for v1.0 or deferred to v1.1?
2. **Animation/micro-interactions**: What is the budget for motion design (e.g., card hover states, drawer transitions)?
3. **Graph visualization**: ForceGraph2D performance targets for >1000 nodes?
4. **Mobile app**: Is there a native mobile requirement, or responsive web sufficient?
5. **White-label**: Should the design system support tenant-specific brand overrides?

---

## 11. References

- [Allura Brand Identity — Figma](https://www.figma.com/design/DsCWyaq4W9xHzcFhCQEIPL/Allura-Brand-Identity)
- [Allura Mission Control Wireframe — Figma](https://www.figma.com/design/eRSV0zBWwSObthcBzrXEtZ/Allura-Mission-Control-Wireframe)
- [Allura GPT Designs — Figma](https://www.figma.com/design/PAQpnxQZENNwbhmk5qxOjR/allura-gpt)
- [DESIGN-ALLURA.md](./DESIGN-ALLURA.md)
- [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md)

---

📝 Reflection
├─ Action Taken: Created PRD for design team covering tokens, components, dashboard, curator, Figma organization
├─ Principle Applied: Conceptual Integrity — single design system across all surfaces; Separation of Architecture from Implementation
├─ Event Logged: ADR_CREATED (design-system-v1-prd)
├─ Neo4j Promoted: No (task-level, not reusable architectural decision)
└─ Confidence: High
