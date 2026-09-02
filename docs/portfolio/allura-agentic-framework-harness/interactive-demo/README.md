# Allura — Interactive Governed-Control-Plane Demo

A single self-contained HTML file that presents the Allura governed operator surface as a
clickable product. No install, no Docker, no external dependencies — open it and explore.

**Live:** https://allura-governed-demo.vercel.app

<p align="center">
  <a href="https://allura-governed-demo.vercel.app"><img src="../assets/dashboard-command-center.png" alt="Command Center — review queue, evidence panel, and rationale-required human-review gate." width="820" /></a>
</p>

## What's inside

A full dashboard shell with a persistent nav across nine surfaces:

| Surface | Shows |
| --- | --- |
| **Command Center** | The evidence desk — review queue → evidence → human review → receipt, with a guided mortgage case. |
| **Framework &amp; Harness** | The engineering case: fail-closed boot, DB-enforced policy denial (forced RLS), deterministic replay, nine live evaluation lanes, and the Bumblebee promote-or-held pipeline. |
| **Governance / Evidence / Receipts** | How a decision is curated, sourced (source vs OCR derivative), and recorded on a server-owned append-only receipt. |
| **Module Registry / Mortgage Approval Gate** | First-party signed modules; a domain add-on that is *declared, not privileged*. |
| **Organization Admin / Platform Settings** | Enablement, lifecycle, and inherited typed configuration. |

## Guided walkthrough

- **Guided tour** — a 14-stop coached walkthrough (dim backdrop + spotlight + popover with Back / Next / Skip and progress dots) that drives the app as it narrates. It auto-runs once on first visit and is replayable anytime via the **Take the tour** button.
- **Hover hints** — hover, tap, or keyboard-focus any nav item, tab, or control for a one-line explanation.
- Keyboard-driven (←/→/Esc); honors `prefers-reduced-motion`.

## Design &amp; provenance

- Conforms to the Epic 25 brand-locked authority: paper canvas, IBM Plex Sans + IBM Plex Mono, blue for structure / orange for action, canonical Allura wordmark.
- **Self-contained**: CSS inlined, wordmark and lettermark embedded as `data:` URIs, tour engine is ~120 lines of vanilla JS. No CDN, no runtime fetch.
- Every figure resolves to a committed artifact — see [`DEMO-EVIDENCE-PACK.md`](../../DEMO-EVIDENCE-PACK.md) and [`artifacts/portfolio-demo/`](../../../../artifacts/portfolio-demo/).

## Deploy

It is one static file. To host it anywhere:

```bash
# Vercel (static, no build step)
vercel deploy --prod
```

Optional Vercel Web Analytics: enable it on the project, and the page's built-in
`/_vercel/insights/script.js` beacon (added at deploy time) begins recording page views
and which tour stops are reached. The beacon is kept out of the committed source.

## Boundary

Synthetic specimen data only. No affiliation with, deployment by, or endorsement from any
organization is claimed; no live underwriting, and Bumblebee is default-off.
