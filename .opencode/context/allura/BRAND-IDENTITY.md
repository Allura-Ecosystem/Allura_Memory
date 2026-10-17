<!-- Context: allura/brand-identity | Priority: high | Version: 2.0 | Updated: 2026-04-26 -->

# allura Brand Identity — Quick Reference

> Full machine-readable canon: `docs/branding/deliverables/06_allura-memory_brand-truth.json`  
> Brand guide screenshots: `docs/screenshots/ChatGPT Image Apr 26, 2026, 02_23_35 AM.png`  
> Brand system index: `docs/branding/deliverables/README.md`  
> **⚠️ v2 — Color palette and typography corrected 2026-04-26 from finalized brand guide**

---

## Name Rules

| Rule | Correct | Wrong |
|------|---------|-------|
| Always lowercase in copy | `allura` | `Allura`, `ALLURA` |
| Legal / title context | `Allura Memory` | — |
| No articles | `allura helps you…` | `The allura helps…` |
| Possessive | `allura's memory` | `Allura's memory` |
| Sub-brands | `allura memory` · `allura insights` · `allura graph` | — |

---

## Tagline & Positioning

**Tagline:** MEMORY THAT SHOWS ITS WORK  
**Brand DNA pillars:**
- **Memory + Intelligence** — capture, organize, understand what matters
- **Connection + Community** — connect people, ideas, and cultures
- **Clarity + Impact** — transform complexity into clarity

---

## Core Values

| Value | Color | Meaning |
|-------|-------|---------|
| MEMORY | Blue `#1D4ED8` | Preserving what matters, faithfully |
| CONNECTION | Green `#157A4A` | Bridging people and their AI |
| CLARITY | Orange `#FF5A2E` | Making memory visible, not hidden |

---

## Color Palette

> **Canonical — from finalized brand guide (2026-04-26)**

| Token | Hex | Usage |
|-------|-----|-------|
| Blue | `#1D4ED8` | Primary brand, Memory pillar, nodes, CTA |
| Orange | `#FF5A2E` | Clarity pillar, alerts, High severity |
| Green | `#157A4A` | Connection pillar, success, approved states |
| Charcoal | `#0F1115` | Text, nav background, edges |
| Gold | `#C89B3C` | Medium severity, secondary accent |
| Cream | `#F6F4EF` | Page background, cards (light mode) |

**Gradients:**
- Blue → Green: `#1D4ED8 → #157A4A`
- Orange → Gold: `#FF5A2E → #C89B3C`
- Blue → Charcoal: `#1D4ED8 → #0F1115`

**Logo rules:** Never recolor · Never stretch · Never rotate · Never add effects · Never alter the lockup

---

## Typography

> **Canonical — IBM Plex Sans (not Outfit/Inter — those were pre-finalization)**

**Primary font:** IBM Plex Sans  
**Fallback:** `System-ui · -apple-system · Segoe UI · Roboto · Helvetica Neue · Arial · sans-serif`

| Style | Weight | Size (px / rem) | Line Height |
|-------|--------|-----------------|-------------|
| H1 | Bold | 56 / 3.5rem | 1.1 |
| H2 | SemiBold | 40 / 2.5rem | 1.2 |
| H3 | SemiBold | 32 / 2rem | 1.25 |
| H4 | Medium | 24 / 1.5rem | 1.3 |
| Body Large | Regular | 18 / 1.125rem | 1.6 |
| Body | Regular | 16 / 1rem | 1.6 |
| Caption | Regular | 14 / 0.875rem | 1.6 |
| Overline | Medium | 12 / 0.75rem | 1.5 |

**Install:**
```bash
bun add @fontsource/ibm-plex-sans
```

---

## Sub-brands & Lockups

| Sub-brand | Lockup | Usage |
|-----------|--------|-------|
| `allura memory` | Primary product | Memory storage and retrieval |
| `allura insights` | Knowledge surface | Curator-approved semantic insights |
| `allura graph` | Graph view | Knowledge graph visualization |

**Monogram:** AL (stacked, tricolor — Blue/Green/Orange)  
**App icon:** Dark background with AL monogram  
**Min size:** 32px (wordmark) · 24px (monogram)  
**Clear space:** X = height of the "l" on all sides

---

## Graph Node Color Semantics

> For the Graph View screen (`/dashboard/graph`) — maps Allura brand to node types

| Node Type | Color | Hex |
|-----------|-------|-----|
| Agent | Blue | `#1D4ED8` |
| Outcome | Green | `#157A4A` |
| Event | Charcoal | `#0F1115` |
| Insight | Orange | `#FF5A2E` |
| Project | Gold | `#C89B3C` |

*Pending design team confirmation — see PRD: Team Durham (2026-04-26)*

---

## Voice & Tone

**Use:** Memory · Intelligence · Connection · Community · Clarity · Impact  
**Avoid:** "users" (→ "people") · frictionless · leverage · seamless · scalable · transactional · jargon

**Brand principles:**
- Clarity over complexity
- Empathy in design
- Inclusive by default
- Purposeful technology
- Design for all devices

---

## Logos & Assets

| Asset | Location |
|-------|----------|
| Primary wordmark | `docs/branding/assets/logos/allura-logo/logo main.png` |
| Favicon set (7 sizes) | `docs/branding/assets/favicons/` |
| Brand icons (10 SVGs) | `docs/branding/assets/icons/` |
| Brand guide PNG | `docs/screenshots/ChatGPT Image Apr 26, 2026, 02_23_35 AM.png` |
| Download all assets | `/brand/allura-brand-assets` (per brand guide) |
