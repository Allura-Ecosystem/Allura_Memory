# Epic 30 mobile comparison contrast preflight

This receipt addresses only the single `color-contrast` item marked `incomplete` by axe-core 4.11.3 in `accessibility-audit.json` for the 320 px comparison screenshot. It does not convert the automated result to a pass or close Story 30.2.

- Candidate source commit: `4370cac3f77d1ed9a10c069aaebaab470f9e69c7`.
- CSS SHA-256: `c0e5536779a0116305d0c460b98553aebb7972015cb5fcb94197c33d6f3015ba`.
- `mobile-comparison.png` SHA-256: `9ecebe42ea750c102dfeb16f117ad82ba36978b9247b57d52be824c79329b45a`.
- `accessibility-audit.json` SHA-256: `8691c503e48be9791d70482458a5c2e274ce23979c5509fdad1b9c472fccce45`.

The incomplete node is `.comparison > .lede`, whose text is 16 px normal weight. The candidate CSS declares `#c3cbd1` for `.lede` and opaque `#141f2a` for `.comparison`. Using sRGB relative luminance and `(L_lighter + 0.05) / (L_darker + 0.05)`, these colors calculate to **10.15:1**. The audit names 4.5:1 as its expected threshold.

Read-only pixel inspection of the hash-bound 320 × 900 PNG found `#141f2a` as the dominant color in the paragraph rectangle (16,849 sampled pixels) and `#c3cbd1` in 299 full-color glyph pixels. Other sampled colors are antialiasing shades. The screenshot visually shows the paragraph fully within the solid comparison pane; axe reported that it could not determine the background because the fixed pane partially overlaps other elements.

## Bounded AI visual-review disposition — 2026-09-21

The hash-bound 320 × 900 rendered comparison capture was inspected at original resolution alongside the unchanged CSS and axe node. The entire `.comparison > .lede` paragraph is visible within the solid comparison pane; its glyphs do not cross the pane boundary or sit over underlying content. The pane's declared background is opaque `#141f2a`, and the paragraph's declared text color is `#c3cbd1`. The independently calculated **10.15:1** ratio exceeds axe's stated **4.5:1** threshold for 16 px normal text. **Disposition: PASS for this one rendered color-contrast item.** Axe's original result remains `incomplete` in the immutable audit JSON; this human-readable disposition supplements it rather than rewriting machine evidence.

This is an AI visual and source review of one synthetic screenshot, not a human accessibility sign-off or a fresh live-browser audit. Screen-reader, actual 200% browser zoom, live restricted-database browser proof, and five-person testing remain open. The design baseline was approved separately on 2026-09-21; neither that approval nor this narrow disposition changes the story status.
