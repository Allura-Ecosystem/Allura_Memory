# Three questions about project memory

These educational drafts explain Allura's existing memory task. They use an illustrative PostgreSQL decision; they are **not screenshots, a verified live walkthrough, or proof that every approval path satisfies its intended contract**.

Choose the explanation needed:

| Question | Explanation | Text alternative |
|---|---|---|
| How could a decision help the next agent session? | [Remember a decision](png/01-remember-a-decision.png) · [phone version](png/01-remember-a-decision-mobile.png) | [Reading order and meaning](ALT-TEXT.md#remember-a-decision) |
| Who does the work? | [Who does what?](png/02-who-does-what.png) · [phone version](png/02-who-does-what-mobile.png) | [Responsibilities](ALT-TEXT.md#who-does-what) |
| Does saving mean approval? | [Saved versus approved](png/03-saved-versus-approved.png) · [phone version](png/03-saved-versus-approved-mobile.png) | [Review boundary](ALT-TEXT.md#saved-versus-approved) |

Use the image and text links above to read these explanations online. The [local responsive preview source](preview.html) opens as HTML code on GitHub; after checking out the repository, open that file in a browser to use its reflowed phone layout below 1200px. Source SVGs in `svg/` retain editable text and shapes. Each desktop PNG is 1440×900; phone sources are 780px wide with a 390px inspection render. Every essential phone body/connector/source label renders at least 16px at 390px width. Use the phone variant for narrow README embeds; an image link alone cannot select a responsive layout.

## Rebuild and inspect

From the repository root, with the existing Bun dependencies installed:

```bash
bun docs/readme/first-use/build.mjs
```

The generator reads the repository's official wordmark, copies the exact original to `assets/`, removes only transparent padding for the displayed lockup, and emits the SVG/PNG pairs, 390px inspection images, HTML preview and manifest. It does not alter visible logo pixels or redraw the mark. Aeonik was unavailable locally, so these renders use the approved neutral Noto Sans fallback. No font or icon is generated.

The root README uses [the Cream-ground wordmark PNG](assets/allura-wordmark-on-cream.png), exported from its [editable SVG frame](assets/allura-wordmark-on-cream.svg). The SVG embeds the original PNG bytes unchanged, keeps all visible artwork with 80 source pixels of clear space on each side, and supplies an opaque Cream ground for either light or dark page themes. Its 280px display width makes the visible mark approximately 232px wide; this presentation change does not create a new logo variant.

[Source and claim map](SOURCES.md) records the inspected contracts and limitations. [Producer checks](producer-checks.md) record render inspection; independent Munari QA, live demonstration and human study remain separate gates. The [first-use guide](../../user-guide/getting-started.md) owns the actual setup steps.

AI-Assisted Documentation: production, 2026-10-20. Identity and palette follow the supplied Allura reference; these drafts do not establish a new strategy lock or publication approval.
