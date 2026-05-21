# Dashboard Visual Audit — 2026-05-21
**Auditor:** Team IRIS (Troy Curator subagent)  
**Reference:** localhost:6420 (static HTML reference)  
**Target:** localhost:3100 (current Next.js build)  
**Spec:** docs/design/DASHBOARD-VISUAL-SPEC-v2.md  
**Tooling:** Playwright Chromium screenshots, manual code review  

---

## 1. Screenshot Diff Report

### Reference Status
| Endpoint | Status | Notes |
|----------|--------|-------|
| `http://localhost:6420` | ✅ Alive | Static HTML reference with full sidebar nav, search hero, warm cream bg |
| `http://localhost:3100/dashboard` | ✅ Alive | Next.js app rendering with CSS variable tokens |
| `http://localhost:3100/dashboard/memory-space` | ✅ Alive | Two implementations exist: `(dashboard)` and `(main)/dashboard` |
| `http://localhost:3100/allura` | ✅ Alive | "Allura Brain" mission control surface |

### Captured Baselines
All screenshots archived in `tests/visual-baselines/screenshots-2026-05-21/`:

| File | Route | Size | Notes |
|------|-------|------|-------|
| `6420-ref.png` | `localhost:6420/` | 209 KB | Full reference: thin sidebar, warm cream, search hero |
| `3100-dashboard.png` | `/dashboard` | 197 KB | Current build — see violations below |
| `3100-memory-space.png` | `/dashboard/memory-space` | 127 KB | Dark graph container on dark background |
| `3100-allura.png` | `/allura` | 56 KB | Metric cards + "Allura Brain" header |
| `3100-insights.png` | `/dashboard/insights` | 97 KB | Tab UI + approval queue cards |
| `3100-agents.png` | `/dashboard/agents` | 78 KB | Metric card hero + agent cards |
| `3100-builder.png` | `/dashboard/builder` | — | Compose form + curator queue |
| `3100-settings.png` | `/dashboard/settings` | — | Placeholder page |
| `3100-health.png` | `/dashboard/health` | — | System status (deprecated route) |
| `3100-feed.png` | `/dashboard/feed` | — | Activity feed (Phase 4+) |

---

### Violation Matrix

| # | Violation | Severity | Evidence | Route(s) |
|---|-----------|----------|----------|----------|
| **V1** | ❌ **Dark sidebar shell** from root layout | **Critical** | `src/app/layout.tsx` injects `data-sidebar-variant="inset"` and `data-sidebar-collapsible="icon"` globally. The root theme system renders a heavy `sidebar-wrapper` with `bg-sidebar` on all pages. The 6420 reference shows a **thin** sidebar ( Workspace / Governance / System groups). The 3100 build shows the old heavy sidebar framework even though `src/app/(main)/dashboard/layout.tsx` tries to hide it with a minimal nav. | `/dashboard`, `/allura`, all routes |
| **V2** | ❌ **Generic metric cards as hero** | **Critical** | `/allura` renders "Episodic / Semantic / Searches" stat cards at top. `/dashboard/agents` renders "Total Agents / Active / Pending / Avg Confidence" metric cards as hero. Spec forbids: "Generic card grid as hero — Old metric/health cards as primary view." | `/allura`, `/dashboard/agents` |
| **V3** | ❌ **"Allura Memory" branding / old logo lockup** | **Critical** | `src/app/layout.tsx` icons reference `/brand/lettermark-AL.png`. Root metadata title template includes `APP_CONFIG.name`. The `/allura` page title is "Allura Brain — Mission Control" with old metric framing. Spec forbids: "Allura Memory branding" and "Old logo lockup". | Root layout, `/allura` |
| **V4** | ❌ **System status as primary** | **Major** | `/dashboard/health` route exists and renders system panels. `/dashboard/agents` uses metric cards. `/allura` uses stats cards. Spec says: "System status as primary — CPU, memory, uptime panels as hero" is forbidden. | `/dashboard/health`, `/dashboard/agents`, `/allura` |
| **V5** | ❌ **Memory-space dark background** | **Major** | `src/app/(dashboard)/memory-space/layout.tsx` uses `bg-[var(--allura-charcoal)]` (dark). `src/app/(main)/dashboard/memory-space/page.tsx` graph container uses `bg-slate-950`. Spec requires: "Warm cream background, not dark" for `/dashboard/memory-space`. | `/dashboard/memory-space` |
| **V6** | ❌ **Missing primary CTA orange** | **Major** | The dashboard search bar uses `focus-within:ring-[var(--dashboard-cta-primary)]/30` but the actual Submit buttons on `/dashboard/builder` and approval actions do not consistently use the spec orange `#F97316`. The root tokens map `--dashboard-cta-primary` to `var(--allura-orange)` which is `#ff5a2e` — close but not the exact spec value `#F97316`. | Global token mismatch |
| **V7** | ❌ **Old route files still imported** | **Major** | `src/app/(main)/dashboard/_components/` still contains `budget-card.tsx`, `health-table.tsx`, `live-kpis.tsx` — evidence of old dashboard component layer. Spec forbids: "Import `@/components/dashboard` — All old route files". | `/dashboard` (dead code) |
| **V8** | ⚠️ **Background color token drift** | **Minor** | Spec says warm cream `#F5F0E8`. Current token is `--allura-cream: #f5f1e6` — slightly different hex. Acceptable but should be aligned to spec exactly. | Global CSS |
| **V9** | ⚠️ **No thin workflow navigation** | **Minor** | The 6420 reference shows a thin sidebar with sections: Workspace (Dashboard, Memories, Insights, Trace logs), Governance (Provenance, Extracted), System (Agents, Approvals, Settings). The 3100 build lacks this entirely — only a sticky top nav with "Allura" text. Spec requires: "Left: Thin workflow navigation (not a heavy sidebar)". | `/dashboard` |
| **V10** | ⚠️ **Missing hero search bar on `/allura`** | **Minor** | The `/allura` route is meant to be "Mission Control" (unchanged per spec), but it still uses old framing (stats cards, tabbed memories) rather than the search-first hero. Spec says `/allura` is "Unchanged, separate surface" — but if it's meant to match the new warm-cream + search-first language, it needs a pass. | `/allura` |

---

## 2. Accessibility (a11y) Findings

### Contrast
| Element | Foreground | Background | Ratio | Status |
|---------|------------|------------|-------|--------|
| Primary text (`--dashboard-text-primary` = `#111827`) | `#111827` | `--dashboard-surface` = `#ffffff` | ~15:1 | ✅ Pass |
| Secondary text (`--dashboard-text-secondary` = `#6b7280`) | `#6b7280` | `#ffffff` | ~5.4:1 | ✅ Pass (AA) |
| Muted text (`--dashboard-text-muted` = `#9ca3af`) | `#9ca3af` | `#ffffff` | ~2.4:1 | ❌ **Fail** — below 4.5:1 for small text. Used in labels, timestamps, tab metadata. |
| Muted text on cream (`#9ca3af` on `#f5f1e6`) | `#9ca3af` | `#f5f1e6` | ~2.2:1 | ❌ **Fail** — even worse on cream backgrounds. |
| Graph node labels (white on `bg-slate-950`) | `#ffffff` | `#020617` | ~18:1 | ✅ Pass (but wrong background per spec) |
| Orange CTA text on white (`#ff5a2e` on `#ffffff`) | `#ff5a2e` | `#ffffff` | ~3.0:1 | ❌ **Fail** for small text — below 4.5:1. Need darker orange or larger/bold text. |

### Keyboard Navigation
| Issue | Severity | Evidence |
|-------|----------|----------|
| Graph canvas (`MemoryCanvas`, `ForceGraph2D`) is not keyboard accessible | **Critical** | Canvas elements have no `tabindex`, no keyboard node selection, no arrow-key navigation. Screen reader users cannot explore the memory graph. |
| Tab buttons in `/dashboard/insights` use `<button>` without `role="tab"` / `aria-selected` | **Major** | Custom tab UI lacks ARIA tab pattern. Should use `role="tablist"`, `role="tab"`, `aria-selected`, and `aria-controls`. |
| Search input focus ring is subtle (`focus-within:ring-2 ... /30`) | **Minor** | 30% opacity ring may be hard to see for low-vision users. |
| Reject-flow input in `/dashboard/builder` appears on click without focus management | **Minor** | When "Reject" is clicked, the rationale input appears but focus is not moved to it. |

### Screen Reader Labels
| Element | Status | Notes |
|---------|--------|-------|
| Search input on `/dashboard` | ✅ | `aria-label="Search memories"` present. |
| Approve/Reject buttons in queue cards | ✅ | `aria-label={`Approve ${insight.title}`}` present. |
| Memory cards | ⚠️ | No `aria-label` on card container; content is text-only so mostly okay, but structured navigation could be improved with `<article>` and headings. |
| Graph nodes | ❌ | No accessible names for canvas-rendered nodes. Alternative: provide a textual list view of graph data. |
| Mission board strip | ⚠️ | Static content; no interactive elements, but lane labels are just `<span>` with colored dots. Acceptable but could use `aria-label` for color meaning. |

### Heading Hierarchy
| Route | Structure | Status |
|-------|-----------|--------|
| `/dashboard` | `h1` (hero) → `h2` (section titles) → card titles as `h3` via `CardTitle` | ✅ Good |
| `/dashboard/insights` | `h1` → tab buttons are `<button>` (not headings) | ⚠️ Missing section headings for tab panels |
| `/dashboard/agents` | `h1` → metric `CardTitle` renders as `h3` (no `h2`) | ⚠️ Skipped heading level |
| `/allura` | `h1` "Allura Brain" → stats cards have `CardTitle` as `h3` | ⚠️ Skipped heading level |

---

## 3. Component Inventory

### Dashboard Route Components

| Route | File | Status | Visual Work Needed |
|-------|------|--------|-------------------|
| `/dashboard` | `src/app/(main)/dashboard/page.tsx` | ✅ Rebuilt to spec | **Done** — search hero, warm cream, memory cards, approvals queue, mission strip. Minor: token exactness, focus ring opacity. |
| `/dashboard/memory-space` | `src/app/(dashboard)/memory-space/page.tsx` + `layout.tsx` | ⚠️ Two implementations | **Needs rebuild** — `(dashboard)` version has dark charcoal background + "Allura Memory Space" branding. `(main)/dashboard` version has `bg-slate-950` graph. Both violate warm-cream spec. |
| `/dashboard/agents` | `src/app/(main)/dashboard/agents/page.tsx` | ❌ Violations | **Needs rebuild** — metric cards as hero (V2). Must remove stat cards and make agent cards the primary surface. |
| `/dashboard/insights` | `src/app/(main)/dashboard/insights/page.tsx` | ⚠️ Partial | **Needs visual pass** — tab UI works but lacks ARIA tab pattern. Approve/Reject buttons are green/red but not spec-exact orange/green CTAs. |
| `/dashboard/builder` | `src/app/(main)/dashboard/builder/page.tsx` | ⚠️ Partial | **Needs visual pass** — Compose form is okay. Curator queue cards need spec-exact styling. HITL gate exists but not visually prominent. |
| `/dashboard/settings` | `src/app/(main)/dashboard/settings/page.tsx` | ⚠️ Placeholder | **Needs build** — Currently a single placeholder card. Not a primary surface per spec, but should be functional. |
| `/dashboard/health` | `src/app/(main)/dashboard/health/page.tsx` | ❌ Deprecated | **Should be removed** — Spec says "Not in this phase". Route still renders system status. |
| `/dashboard/feed` | `src/app/(main)/dashboard/feed/page.tsx` | ❌ Not in phase | **Should be removed or hidden** — Spec says "activity feed is Phase 4+". |
| `/dashboard/audit` | `src/app/(main)/dashboard/audit/page.tsx` | ❓ Unaudited | Not in spec route list. Needs evaluation. |
| `/dashboard/decisions` | `src/app/(main)/dashboard/decisions/page.tsx` | ❌ Deprecated | **Should be removed** — Spec says deprecated. |
| `/dashboard/projects` | `src/app/(main)/dashboard/projects/page.tsx` | ❌ Deprecated | **Should be removed** — Spec says deprecated. |
| `/allura` | `src/app/(main)/allura/page.tsx` + `layout.tsx` | ❌ Violations | **Needs rebuild** — Metric cards as hero, "Allura Brain" old branding, dark sidebar from root layout. Should match warm-cream + search-first language or be explicitly exempted as "separate surface". |

### Shared / Legacy Components to Audit

| Component | Location | Status | Action |
|-----------|----------|--------|--------|
| `app-sidebar.tsx` | `src/app/(main)/dashboard/_components/` (old path) | ❌ Forbidden | Already removed from active import chain, but files still exist. Delete. |
| `budget-card.tsx` | `src/app/(main)/dashboard/_components/` | ❌ Dead code | Delete. Old metric component. |
| `health-table.tsx` | `src/app/(main)/dashboard/_components/` | ❌ Dead code | Delete. Old system-status component. |
| `live-kpis.tsx` | `src/app/(main)/dashboard/_components/` | ❌ Dead code | Delete. Old KPI component. |
| `MemoryCanvas` | `src/components/memory-space/` | ⚠️ Inaccessible | Needs a11y pass — add keyboard navigation or textual fallback. |
| `SearchBar` | `src/components/memory-space/` | ⚠️ OK | Works, but focus management could be improved. |
| `DetailPanel` | `src/components/memory-space/` | ⚠️ OK | Slide-in panel; add `aria-expanded` and focus trap. |

---

## 4. Visual Regression Baselines

### Setup Status
| Item | Status |
|------|--------|
| Screenshot directory | ✅ Created `tests/visual-baselines/screenshots-2026-05-21/` |
| Playwright | ✅ Installed and functional (Chromium v1217) |
| Baseline capture | ✅ All active routes captured at 1280×900 |
| Automated diff tool | ❌ Not yet set up |
| CI integration | ❌ Not yet set up |

### Recommended Next Steps for Baselines
1. **Add a Playwright test spec** at `tests/visual-baselines/dashboard.spec.ts` that:
   - Screenshots each route against a viewport matrix (1280×900, 768×1024, 375×667)
   - Compares to `tests/visual-baselines/screenshots-2026-05-21/` references
   - Fails on >2% pixel diff
2. **Add GitHub Action step** in `.github/workflows/ci.yml` to run `npx playwright test tests/visual-baselines/` on PR.
3. **Update `dashboard-guard.sh`** to include a visual-regression gate (pixel diff or structural DOM check).
4. **Baseline refresh policy**: Re-capture baselines after every approved design change; PR must include updated screenshots.

---

## 5. Blockers

| Blocker | Severity | Impact | Resolution Path |
|---------|----------|--------|-----------------|
| **B1: Root layout sidebar framework** | 🔴 Critical | The global `data-sidebar-variant="inset"` injects a heavy sidebar wrapper on ALL routes, including `/dashboard` and `/allura`. The 3100 screenshots show the sidebar shell even though `src/app/(main)/dashboard/layout.tsx` tries to render a minimal top nav. | Remove or override `sidebar-wrapper` in dashboard group layout. Conditionally suppress sidebar for `/dashboard/*` and `/allura` routes. |
| **B2: Dark memory-space backgrounds** | 🔴 Critical | Two `memory-space` implementations both use dark backgrounds (`charcoal` and `slate-950`), directly violating the warm-cream spec. | Rebuild both layouts to use `bg-[var(--dashboard-bg)]` (`#f5f1e6`). Re-color graph canvas to work on light backgrounds (dark node labels, light edges). |
| **B3: Old component files still present** | 🟡 Major | `budget-card.tsx`, `health-table.tsx`, `live-kpis.tsx` exist in the repo. Even if not imported, they are evidence of old architecture and could be accidentally re-imported. | Delete `src/app/(main)/dashboard/_components/budget-card.tsx`, `health-table.tsx`, `live-kpis.tsx`. Verify no imports reference them. |
| **B4: Deprecated routes still render** | 🟡 Major | `/dashboard/health`, `/dashboard/feed`, `/dashboard/decisions`, `/dashboard/projects` are accessible and render content. Spec says these are "not in this phase" or "deprecated". | Add redirects to `/dashboard` or return 404 with friendly message. Do not render old surfaces. |
| **B5: Token exactness** | 🟡 Minor | `--allura-cream` is `#f5f1e6`, spec says `#F5F0E8`. `--allura-orange` is `#ff5a2e`, spec says `#F97316`. Close but not exact. | Align tokens to spec hex values in `src/styles/presets/allura.css`. |
| **B6: No automated visual diff** | 🟢 Low | Visual regressions are caught only by manual audit. | Implement Playwright pixel-diff tests (see Section 4). |

---

## 6. IRIS Sign-off Status

| Route | Warm Cream | Search-First | No Dark Shell | No Old Branding | IRIS Sign-off |
|-------|:----------:|:------------:|:-------------:|:---------------:|:-------------:|
| `/dashboard` | ✅ | ✅ | ❌ (sidebar shell) | ⚠️ (root icon) | ⛔ **BLOCKED** by B1 |
| `/dashboard/memory-space` | ❌ | N/A | ❌ | ⚠️ | ⛔ **BLOCKED** by B2 |
| `/dashboard/agents` | ✅ | ❌ (metric hero) | ❌ | ✅ | ⛔ **BLOCKED** by V2, B1 |
| `/dashboard/insights` | ✅ | ❌ (tabs, not search) | ❌ | ✅ | ⛔ **BLOCKED** by B1 |
| `/dashboard/builder` | ✅ | ❌ (compose, not search) | ❌ | ✅ | ⛔ **BLOCKED** by B1 |
| `/dashboard/settings` | ✅ | N/A | ❌ | ✅ | ⛔ **BLOCKED** by B1 |
| `/allura` | ✅ | ❌ (stats hero) | ❌ | ❌ ("Allura Brain") | ⛔ **BLOCKED** by V2, V3, B1 |

> **No route passes IRIS sign-off in the current build.**

The primary blocking issue is **B1 (root layout sidebar shell)**. Until the global sidebar framework is suppressed for dashboard routes, every route fails the "no dark shell" gate. After B1 is resolved, the remaining per-route fixes are manageable.

---

## 7. Recommendations (Priority Order)

1. **Fix B1** — Suppress or override the global `sidebar-wrapper` for `/dashboard/*` and `/allura`. Implement the thin workflow nav per 6420 reference.
2. **Fix B2** — Rebuild `/dashboard/memory-space` with warm-cream background and light-theme graph rendering.
3. **Fix V2/V3/V4** — Remove metric cards from `/allura` and `/dashboard/agents`. Replace with search-first or content-first surfaces. Remove old branding references.
4. **Fix B3/B4** — Delete old component files and deprecated routes.
5. **Fix a11y** — Add ARIA tab pattern, improve muted-text contrast, add keyboard navigation for graph canvas (or provide list fallback).
6. **Align tokens** — Update `--allura-cream` to `#F5F0E8` and `--allura-orange` to `#F97316`.
7. **Set up automated visual regression** — Playwright spec + CI gate.

---

*Audit completed by Team IRIS on 2026-05-21.*  
*Next action: Brooks routing + Woz build for B1 (sidebar suppression) and B2 (memory-space light theme).*
