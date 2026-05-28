# DESIGN-BRAND-RULES-dashboard-v2.md
# Allura Dashboard Brand Rules v2
# Governance Artifact — RuVix Kernel Enforced

**Version:** 2.0.0  
**Date:** 2026-05-28  
**Owner:** Team Durham (Brand/Design)  
**Approver:** Captain (Ronin / Gene)  
**Status:** Draft — Pending Durham Gate  
**Source Figma:** [Allura — Brand Identity](https://www.figma.com/design/DsCWyaq4W9xHzcFhCQEIPL/Allura-%E2%80%94-Brand-Identity)  
**Wireframe:** [Allura Mission Control](https://www.figma.com/design/eRSV0zBWwSObthcBzrXEtZ/Allura-Mission-Control-Wireframe)

---

## 1. Scope

These rules govern **Allura Dashboard surfaces only**:

| Surface | Port | Status |
|---------|------|--------|
| Mission Control dev | `localhost:3334` | Active build target |
| Visual/reference dashboard | `localhost:6420` | Reference memory dashboard UX |
| Current Docker dashboard | `localhost:3100` | Do not replace until cutover gates pass |

**Explicitly excluded:** Difference Driven (`dd-site-payload`) — DD has its own brand truth (`clients/difference-driven/brand-truth.json`). No DD tokens may leak into Allura surfaces.

---

## 2. Locked Brand Constants

These values are **frozen** as of 2026-05-09. Any change requires Captain approval and an ADR.

### 2.1 Colors (HEX)

| Name | Hex | Role | CSS Custom Property |
|------|-----|------|-------------------|
| Allura Blue | `#1D4ED8` | Primary accent, links, logo shapes, stat accent | `--allura-blue` |
| Allura Orange | `#FF5A2E` | Secondary accent, warmth, primary buttons, live state, active nav | `--allura-orange` |
| Allura Green | `#157A4A` | Tertiary accent, growth, positive feedback, done lane, online status | `--allura-green` |
| Allura Charcoal | `#111827` | Primary text, dark backgrounds, logo base | `--allura-charcoal` |
| Allura Gold | `#C89B3C` | Premium accent, lockup, queued-task accent | `--allura-gold` |
| Allura Cream | `#F5F1E6` | Page backgrounds, warmth, print base | `--allura-cream` |
| Allura Deep Ink | `#172522` | Headline / brand-forward text | `--allura-ink-deep` |
| Allura Muted | `#6B7280` | Secondary text, timestamps, labels | `--allura-muted` |

### 2.2 Typography

| Role | Font | Weights | Usage |
|------|------|---------|-------|
| Display | Outfit | 700, 900 | Headlines, stat values, page titles |
| Body | Inter | 400, 500, 600 | Body text, UI labels, nav items |
| Tagline | Inter (wide-tracked) | 400 | Tagline display, tracking +400 to +600 |
| Monospace | JetBrains Mono | 400 | Code blocks, trace logs, memory IDs |

### 2.3 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| `--text-display-1` | 48px | 900 | 1.1 | -0.02em |
| `--text-display-2` | 36px | 700 | 1.2 | -0.01em |
| `--text-headline` | 24px | 700 | 1.3 | 0 |
| `--text-title` | 20px | 600 | 1.4 | 0 |
| `--text-body` | 16px | 400 | 1.6 | 0 |
| `--text-label` | 14px | 500 | 1.4 | +0.05em (uppercase) |
| `--text-caption` | 12px | 400 | 1.4 | +0.02em |

### 2.4 Logo & Lockups

| Asset | Spec | Location |
|-------|------|----------|
| Primary wordmark | Horizontal, base `#111827`, clear space = height of lowercase "ll" pair | `mockup-pages/logos/wordmark.png` |
| Lettermark "AL" | 400×400, geometric | `mockup-pages/logos/lettermark-AL.png` |
| Lockup "Allura memory" | Wordmark + gold horizontal bar beneath, **dark backgrounds only** | Figma: `DsCWyaq4W9xHzcFhCQEIPL` node 173:2 |
| Minimum size | 32px screen / 10mm print | — |

### 2.5 Spacing Rhythm (Durham Grid)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-4` | 4px | Micro gaps, icon padding |
| `--space-8` | 8px | Tight internal padding |
| `--space-12` | 12px | Button padding vertical |
| `--space-16` | 16px | Card internal padding |
| `--space-24` | 24px | Section gutters |
| `--space-32` | 32px | Panel padding |
| `--space-48` | 48px | Major section breaks |
| `--space-64` | 64px | Page margins |

---

## 3. The 6 Brand Rules (Enforceable Kernel Invariants)

### BRAND-001 — Durham Token Exclusivity

**Rule:** Dashboard CSS may use **only** `--durham-*` / `--allura-*` custom properties. DD tokens (`dark-green`, `brand-gold`, `Poppins`, `Inter` when used as DD body, `Montserrat` for non-Allura contexts) are **forbidden**.

**Enforcement:**
- `grep -r "dark-green\|brand-gold\|Poppins\|Montserrat" src/app/(main)/dashboard*/` must return zero results
- Stylelint rule: `declaration-property-value-no-unknown` with custom property allowlist
- CI gate: `npm run lint:brand` fails build on token leakage

**Failure Mode:** Build blocked. PR rejected.

**Evidence Required:**
- [ ] `lint:brand` output showing zero DD token matches
- [ ] Screenshot of computed styles in DevTools showing only `--allura-*` values

---

### BRAND-002 — Mission-Control Voice

**Rule:** Dashboard copy stays mission-control: factual, precise, operator-oriented. No fake certainty, no marketing fluff, no DD voice patterns.

**Forbidden Patterns:**

| Forbidden | Why | Approved Alternative |
|-----------|-----|---------------------|
| "Revolutionary" | Marketing fluff | "Replaces manual lookup with graph search" |
| "Seamlessly integrated" | Fake certainty | "Connected to Neo4j via MCP bridge" |
| "Best-in-class" | Unverifiable claim | "P@5 retrieval score: 0.867" |
| "Empower your workflow" | DD voice pattern | "Query memory by agent, project, or time range" |
| "Unlock potential" | Marketing speak | "Browse approved semantic memories" |
| "The future of memory" | Hype | — (delete, replace with feature description) |

**Enforcement:**
- Copy review in PR template: "Does any copy match the forbidden list?"
- Munari QA pass includes voice audit
- `grep -i` for forbidden phrases in dashboard source

**Failure Mode:** PR returned for copy revision.

**Evidence Required:**
- [ ] QA report section: "Voice audit — 0 forbidden phrases found"
- [ ] Screenshot of all visible dashboard copy

---

### BRAND-003 — Evidence-Gated Completion

**Rule:** No dashboard work is marked "done" until the evidence packet exists.

**Required Evidence:**

| Gate | Artifact | Checker |
|------|----------|---------|
| Screenshot packet | PNG of all states (desktop + mobile) | Evidence Collector |
| Mobile pass | Viewport 375px, no horizontal overflow | Playwright test |
| Accessibility pass | axe-core scan, 0 violations | Munari |
| Anti-drift audit | `grep` for DD tokens, voice, color leakage | Aaker |
| Performance pass | Lighthouse ≥ 90 | TALON |

**Enforcement:**
- PR template checkbox: "Evidence packet attached"
- Merge blocked without evidence packet link
- RuVix POL-003: Claims without evidence are rejected

**Failure Mode:** PR cannot be merged. Status stays "In Progress."

**Evidence Required:**
- [ ] `evidence/` directory in PR with screenshots
- [ ] `accessibility-report.json` with 0 critical/serious violations
- [ ] `brand-audit.log` showing 0 DD token leaks

---

### BRAND-004 — Accessibility Mandatory

**Rule:** AA contrast, visible focus rings, keyboard-operable flows are required. No exceptions.

**WCAG AA Valid Token Pairs:**

| Foreground | Background | Ratio | Passes AA? | Usage |
|------------|------------|-------|-----------|-------|
| `#111827` (charcoal) | `#F5F1E6` (cream) | 15.2:1 | ✅ Yes | Primary text |
| `#1D4ED8` (blue) | `#F5F1E6` (cream) | 5.8:1 | ✅ Yes | Links, accents |
| `#FF5A2E` (orange) | `#F5F1E6` (cream) | 3.1:1 | ⚠️ Large text only | Primary buttons (≥18px bold) |
| `#157A4A` (green) | `#F5F1E6` (cream) | 4.8:1 | ✅ Yes | Success states |
| `#C89B3C` (gold) | `#F5F1E6` (cream) | 2.1:1 | ❌ No | Decorative only — NOT for text |
| `#FFFFFF` (white) | `#111827` (charcoal) | 15.2:1 | ✅ Yes | Dark mode text |
| `#FFFFFF` (white) | `#1D4ED8` (blue) | 4.5:1 | ✅ Yes | Blue button text |
| `#6B7280` (muted) | `#F5F1E6` (cream) | 4.6:1 | ✅ Yes | Secondary text |

**⚠️ CRITICAL:** Allura Gold `#C89B3C` on Cream `#F5F1E6` = **2.1:1 — FAILS AA for all text sizes**. Gold may only be used for:
- Decorative borders/accents
- Icons (if accompanied by text label with sufficient contrast)
- Non-text UI elements

**Enforcement:**
- axe-core automated scan in CI
- Manual keyboard navigation test (Tab through all interactive elements)
- Focus ring visibility check (2px solid `--allura-orange`)

**Failure Mode:** PR rejected. Accessibility report must show 0 violations.

**Evidence Required:**
- [ ] axe-core JSON report: 0 violations
- [ ] Keyboard navigation video/GIF showing Tab order
- [ ] Focus ring screenshot for each interactive element

---

### BRAND-005 — Component Consistency

**Rule:** Reuse established Durham patterns. No ad-hoc variants.

**Component Inventory:**

| Component | Source | Reuse Rule |
|-----------|--------|-----------|
| `agency-card` | Durham design system | For agent roster panels; avatar + name + status + role |
| `metric-card` | Durham design system | For stat cards; value + label + trend indicator |
| `agency-badge` | Durham design system | For status pills; online/standby/review/done |
| `curator-table` | Durham design system | For approval queue; row per proposal with score + action |
| `kanban-column` | Mission Control wireframe | For task board; header + task cards + drop zone |
| `task-card` | Mission Control wireframe | For kanban items; title + meta + priority + assignee |
| `chat-line` | Mission Control wireframe | For team chat; avatar + name + message + timestamp |
| `activity-feed-item` | Mission Control wireframe | For live feed; dot + message + timestamp |

**Spacing Rhythm:**
- Panel padding: `--space-32` (32px)
- Card internal padding: `--space-16` (16px)
- Element gap: `--space-8` (8px)
- Section gap: `--space-24` (24px)
- Border radius: 8px for cards, 4px for buttons, 2px for inputs

**Enforcement:**
- Component audit in PR: list every UI element, map to inventory above
- Any "new" component requires ADR and Munari approval
- CSS custom properties only — no hardcoded values

**Failure Mode:** PR returned with component inventory mismatch.

**Evidence Required:**
- [ ] Component audit spreadsheet mapping every rendered element to inventory item
- [ ] Screenshot showing consistent spacing (measurement overlay acceptable)

---

### BRAND-006 — Durham Gate Before Ship

**Rule:** Aaker + Glaser + Munari must pass before dashboard release.

**Gate Sequence:**

```
Woz builds → Aaker review → Glaser review → Munari QA → Evidence Collector → Ship decision
           (strategy)     (visual)        (accessibility + voice)   (screenshots)   (Captain)
```

**Review Checklist per Agent:**

| Agent | Reviews | Pass Criteria |
|-------|---------|--------------|
| Aaker | Brand strategy alignment, token consistency, voice compliance | 0 DD token leaks, voice audit clean |
| Glaser | Visual fidelity, typography, color usage, logo correctness | Pixel match to Figma within 2px, colors exact |
| Munari | Accessibility, usability, keyboard nav, contrast | axe-core 0 violations, keyboard pass |

**Enforcement:**
- Each agent signs off in PR with checklist comment
- RuVix blocks merge until all three checkboxes are checked
- Captain has final veto

**Failure Mode:** Any reviewer rejects → fix → re-review → re-evidence.

**Evidence Required:**
- [ ] Aaker sign-off comment in PR
- [ ] Glaser sign-off comment in PR
- [ ] Munari sign-off comment in PR
- [ ] Evidence Collector screenshot packet attached

---

## 4. Anti-Drift Clause

### Detecting DD Token Leakage

DD-004 is the canonical token authority for Difference Driven. Allura must never reference it.

**Detection commands:**

```bash
# Check for DD colors
grep -r "dark-green\|forest-green\|emerald" src/app/(main)/dashboard*/

# Check for DD typography
grep -r "Poppins\|Montserrat" src/app/(main)/dashboard*/

# Check for DD voice patterns
grep -ri "empower\|seamless\|revolutionary\|unlock.*potential" src/app/(main)/dashboard*/

# Check for DD components
grep -r "dd-card\|dd-button\|difference-driven" src/app/(main)/dashboard*/
```

**All must return empty.** Any match = drift detected = fix before merge.

### Detecting Figma Drift

| Check | Method | Frequency |
|-------|--------|-----------|
| Color match | Figma Dev Mode → CSS copy → compare to `--allura-*` | Per release |
| Typography match | Figma text styles → compare to type scale | Per release |
| Spacing match | Figma spacing tokens → compare to `--space-*` | Per release |
| Logo match | Export Figma asset → diff against `mockup-pages/logos/` | Per release |

---

## 5. Cutover Residual Risks

These gaps are **explicitly acknowledged** and **Captain-owned**:

| Risk | Impact | Owner | Mitigation |
|------|--------|-------|-----------|
| Wireframe ↔ implementation gap | Visual mismatch between Figma and code | Woz + Glaser | Pixel-diff gate in CI |
| Mission Control (3334) ↔ current Docker (3100) data sync | Old dashboard shows stale data during transition | Captain | Dual-write period, cutover announcement |
| Mobile breakpoint coverage | Untested below 375px | Munari | Add 320px viewport tests |
| Dark mode tokens incomplete | `--allura-*` dark variants undefined | Durham | Define dark palette before cutover |
| LCP/FID not measured | Performance claims unverified | TALON | Add Web Vitals monitoring |
| Graph node targeting | Neo4j node IDs not URL-addressable | Woz | Add node deep-linking post-cutover |

---

## 6. Token → CSS Property Map

```css
:root {
  /* Colors */
  --allura-blue: #1D4ED8;
  --allura-orange: #FF5A2E;
  --allura-green: #157A4A;
  --allura-charcoal: #111827;
  --allura-gold: #C89B3C;
  --allura-cream: #F5F1E6;
  --allura-ink-deep: #172522;
  --allura-muted: #6B7280;

  /* Typography */
  --font-display: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Type scale */
  --text-display-1: 48px;
  --text-display-2: 36px;
  --text-headline: 24px;
  --text-title: 20px;
  --text-body: 16px;
  --text-label: 14px;
  --text-caption: 12px;

  /* Spacing */
  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-24: 24px;
  --space-32: 32px;
  --space-48: 48px;
  --space-64: 64px;

  /* Border radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;
}
```

---

## 7. Sign-Off Block

| Role | Name | Check | Date |
|------|------|-------|------|
| Brand Strategy | Aaker | ☐ Reviewed — tokens, voice, strategy aligned | |
| Visual Design | Glaser | ☐ Reviewed — pixel fidelity, color exact, typography correct | |
| QA / Accessibility | Munari | ☐ Reviewed — axe-core 0 violations, keyboard pass, contrast pass | |
| Evidence Collector | — | ☐ Screenshot packet attached | |
| Ship Approval | Captain | ☐ Approved for merge | |

---

## 8. References

| Document | Path | Role |
|----------|------|------|
| RISKS-AND-DECISIONS.md | `./RISKS-AND-DECISIONS.md` | AD-XX+1: RuVix Brand Governance Rules |
| REQUIREMENTS-MATRIX.md | `./REQUIREMENTS-MATRIX.md` | REQ-DURHAM-001 through REQ-DURHAM-005 |
| DATA-DICTIONARY.md | `./DATA-DICTIONARY.md` | `DurhamTokenAudit`, `DurhamGateEvent` schemas |
| SOLUTION-ARCHITECTURE.md | `./SOLUTION-ARCHITECTURE.md` | Section 3.4.2: Brand Governance Layer |
| Figma Brand Identity | `DsCWyaq4W9xHzcFhCQEIPL` | Source of visual truth |
| Figma Wireframe | `eRSV0zBWwSObthcBzrXEtZ` | Mission Control layout truth |
| Design Spec | `mockup-pages/allura-mission-control-alignment.md` | Local implementation alignment |
| Brand Truth JSON | `clients/allura-memory/06_allura-memory_brand-truth.json` | Locked brand constants |

---

*Produced by Team Durham via Kotler orchestration. Canonical artifact for RuVix kernel enforcement. Do not modify without ADR and Captain approval.*
