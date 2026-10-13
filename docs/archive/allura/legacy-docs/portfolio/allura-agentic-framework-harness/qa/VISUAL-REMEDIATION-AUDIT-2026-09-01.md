# Portfolio visual remediation audit

## Result: production approved

The six deck-embedded SVG/PNG pairs were rebuilt from `build-assets.mjs`, raster-inspected at 100%, then placed in and inspected through the rebuilt ten-slide PowerPoint deck. The previous blocked assets are superseded by the files listed below.

| Asset | Result | Rendered verification |
| --- | --- | --- |
| `01-framework-harness-architecture` | Pass | Official wordmark visible; interfaces join a governed core through an isolated connector lane; proof field and source strip are separate. |
| `02-deterministic-harness` | Pass | Official wordmark visible; the replay/evaluate card has a full 130px text-safe height; its connector ends above the card. |
| `03-enterprise-governance` | Pass | Deliberate primary workflow and secondary control-pattern composition; all four nodes remain inside the story field. |
| `04-developer-interfaces` | Pass | Three interface cards join a governed core through a dedicated lane; legend and source strip are outside the diagram surface. |
| `05-governed-memory-lifecycle` | Pass | Lifecycle labels remain within cards; the return path has its own lower lane and does not enter text-safe areas. |
| `06-evidence-to-release-chain` | Pass | Claim, manifest and inspection form a primary evidence path; the separate proof field states the review boundary and source. |

## Measured composition rules

- Canvas: 1600 × 900, with a 1460px usable width from x=70 to x=1530.
- Primary story field: x=70, width=902px (0.618 of usable width).
- Secondary proof field: x=972, width=558px (0.382 of usable width).
- Vertical rhythm: 34px text-safe insets, 55px lower-story offset, 89px header-to-story transition.
- Connectors occupy explicit lanes between or below text cards. No connector enters a card’s 34px text-safe inset.
- The official Allura wordmark is embedded in every SVG and composited again into every PNG header to prevent a raster header-anchor regression.

## Production gate evidence

- Palette: Allura Blue `#0D47A1`, Orange `#FF4D1F`, Green `#148A4B`, Ink `#0F1720`, Cream `#F7F3EE`.
- Typography: Aeonik fallback stack (`Noto Sans`) for editorial copy and IBM Plex Mono for technical labels.
- Each SVG has editable title, description, labels, connectors, legend, and source strip; the PNG is a 1600 × 900 companion render.
- No gradients, shadows, glow, 3D, fake UI, unlabelled control symbols, SOC 2 claims, client affiliation claims, or unsupported certification claims appear in the six visuals.

## Reproducible checks

```bash
node docs/portfolio/allura-agentic-framework-harness/build-assets.mjs
node docs/portfolio/allura-agentic-framework-harness/qa/validate-infographics.mjs
node docs/portfolio/allura-agentic-framework-harness/build-deck.mjs
python3 /home/ronin704/.codex/plugins/cache/openai-primary-runtime/presentations/26.826.12353/skills/presentations/container_tools/slides_test.py docs/portfolio/allura-agentic-framework-harness/deck/Allura-Agentic-AI-Framework-Harness-Portfolio.pptx
```

The structural check validates all six SVG/PNG pairs, their exact 902/558 layout anchors, accessibility metadata, official-wordmark embedding, legend/source band, approved palette, and raster dimensions. The slide test confirms the ten-slide PowerPoint has no detected canvas overflow. The visual pass remains a human review step and was completed against the current renders.
