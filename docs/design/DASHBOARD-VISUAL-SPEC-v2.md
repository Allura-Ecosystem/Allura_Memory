# Dashboard Visual Spec v2
**Reference:** http://localhost:6420  
**Date:** 2026-05-21  
**Status:** Active — replaces all prior dashboard design docs  
**Enforced by:** CI guard `.github/scripts/dashboard-guard.sh`

---

## Global Design Rules

| Token | Value | Usage |
|-------|-------|-------|
| Background | warm cream `#F5F0E8` | `var(--color-cream)` or `--dashboard-bg` | Page background |
| Surfaces | white `#FFFFFF` | `var(--dashboard-surface)` | Cards, panels, input fields |
| Text primary | charcoal `#1A1A1A` | `var(--dashboard-text-primary)` | Headings, body text |
| Text secondary | gray `#6B7280` | `var(--dashboard-text-secondary)` | Descriptions, metadata |
| Text muted | lighter gray `#9CA3AF` | `var(--dashboard-text-muted)` | Labels, timestamps |
| Primary CTA | orange `#F97316` | `var(--dashboard-cta-primary)` | Search, main actions |
| Approval CTA | green `#22C55E` | `var(--dashboard-cta-approval)` | Approve, confirm |
| Borders | soft, 1px, low opacity | `var(--dashboard-border)` | Separators, card outlines |
| Radii | 12–16px | — | Cards, buttons, inputs |
| Heading font | Outfit | — | Allura headings, hero text |
| Interface font | Inter | — | UI labels, body, buttons |

---

## /dashboard — Main Surface

### Layout
- **Left:** Thin workflow navigation (not a heavy sidebar)
  - Items: Dashboard, Memories, Insights, Trace logs, Provenance, Extracted, Agents, Approvals, Settings
  - Collapsible, minimal footprint
- **Center:** Memory search (primary action) + recent memories
  - Search bar is the hero element
  - Results show memory cards with provenance preview
- **Right:** Approvals queue + selected memory detail/provenance
  - Shows pending vs approved
  - Click a memory → see full provenance chain
- **Bottom:** Thin Mission board strip
  - Lanes: Intake · Ready · Doing · Review · Done · Blocked
  - Minimal, scrollable horizontal strip

### Hero Copy
> **"Find memories. Follow provenance. Govern what sticks."**

This replaces all old header framing like "What We Know" or "Dashboard — Allura Memory".

### Empty States
- **No memories yet:** "No memories indexed. Start by adding your first memory."
- **No approvals pending:** "No pending proposals. Every memory here passed through a gate you can inspect."
- **Search no results:** "No memories match. Try broader terms or check your filters."

---

## /dashboard/memory-space

- Force-directed graph of memory relationships
- Error state: friendly message + retry, not crash
- Warm cream background, not dark

---

## /dashboard/agents

- Agent cards with live status
- Empty state: "No agents active. Add an agent to see it here."

---

## /dashboard/insights

- Tabs: All / Pending / Approved / Rejected
- Approve/reject actions with clear receipts
- Each insight shows: score, policy that gated it, provenance

---

## /dashboard/builder

- Compose form for new memories
- Curator queue showing pending approvals
- HITL gate: human approval required before promotion

---

## Forbidden (Mechanically Enforced)

| Violation | Evidence |
|-----------|----------|
| ❌ Dark sidebar shell | Old `src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx` |
| ❌ Generic card grid as hero | Old metric/health cards as primary view |
| ❌ "Allura Memory" branding | Old `layout.tsx`, `app-sidebar.tsx`, `top-nav-bar.tsx` |
| ❌ Old logo lockup | `lettermark-AL.png`, `wordmark.png` old branding |
| ❌ System status as primary | CPU, memory, uptime panels as hero |
| ❌ Import `@/components/dashboard` | All old route files |

---

## What Routes Should Exist

| Route | Purpose | Status |
|-------|---------|--------|
| `/dashboard` | Main memory workspace | Needs rebuild to spec |
| `/dashboard/memory-space` | Graph + provenance | Stabilized, needs visual pass |
| `/dashboard/agents` | Agent cards | Stabilized, needs visual pass |
| `/dashboard/insights` | Approval queue + tabs | Stabilized, needs visual pass |
| `/dashboard/builder` | Compose + curator | Stabilized, needs visual pass |
| `/allura` | Mission Control | Unchanged, separate surface |

**Not in this phase:**
- `/dashboard/health` — system status is not the product
- `/dashboard/feed` — activity feed is Phase 4+
- `/dashboard/settings` — minimal, not a primary surface
- `/dashboard/decisions` — deprecated old surface
- `/dashboard/projects` — deprecated old surface

---

## 6420 Reference Verification

Before any route is marked "done":
1. Screenshot `localhost:3100/[route]`
2. Compare to `localhost:6420` (or extrapolated spec if 6420 lacks the route)
3. Visual diff must pass: warm cream, search-first, no dark shell, no old branding
4. IRIS sign-off required

---

## Related Docs

- `memory/2026-05-20.md` — Dashboard direction correction (source of kill list)
- `memory/2026-05-21-talon-dashboard-fix-plan.md` — TALON enforcement plan
- `memory/2026-05-21-iris-dashboard-fix-plan.md` — IRIS verification plan
- `.github/scripts/dashboard-guard.sh` — CI enforcement

---

*Spec by: Troy Curator / Team IRIS*  
*Approved by: Captain (pending)*  
*Enforced by: TALON CI guard + IRIS screenshot gate*
