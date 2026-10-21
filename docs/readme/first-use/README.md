# Three questions about project memory

These educational drafts explain Allura's existing memory task. They use an illustrative PostgreSQL decision; they are **not screenshots, a verified live walkthrough, or proof that every approval path satisfies its intended contract**.

Choose the explanation needed:

| Question | Explanation | Text alternative |
|---|---|---|
| How could a decision help the next agent session? | [Remember a decision](png/01-remember-a-decision.png) · [phone version](png/01-remember-a-decision-mobile.png) | [Reading order and meaning](ALT-TEXT.md#remember-a-decision) |
| Who does the work? | [Who does what?](png/02-who-does-what.png) · [phone version](png/02-who-does-what-mobile.png) | [Responsibilities](ALT-TEXT.md#who-does-what) |
| Does saving mean approval? | [Saved versus approved](png/03-saved-versus-approved.png) · [phone version](png/03-saved-versus-approved-mobile.png) | [Review boundary](ALT-TEXT.md#saved-versus-approved) |

The [responsive preview](preview.html) shows a reflowed phone version below 1200px rather than shrinking the desktop labels. Source SVGs in `svg/` retain editable text and shapes. Each desktop PNG is 1440×900; phone sources are 780px wide with a 390px inspection render. Every essential phone body/connector/source label renders at least 16px at 390px width. Use the phone variant for narrow README embeds; an image link alone cannot select a responsive layout.

## Rebuild and inspect

From the repository root, with the existing Bun dependencies installed:

```bash
bun docs/readme/first-use/build.mjs
```

The generator reads the repository's official wordmark, copies the exact original to `assets/`, removes only transparent padding for the displayed lockup, and emits the SVG/PNG pairs, 390px inspection images, HTML preview and manifest. It does not alter visible logo pixels or redraw the mark. Aeonik was unavailable locally, so these renders use the approved neutral Noto Sans fallback. No font or icon is generated.

[Source and claim map](SOURCES.md) records the inspected contracts and limitations. [Producer checks](producer-checks.md) record render inspection; independent Munari QA, live demonstration and human study remain separate gates. The [first-use guide](../../user-guide/getting-started.md) owns the actual setup steps.

AI-assisted production, 2026-10-20. Identity and palette follow the supplied Allura reference; these drafts do not establish a new strategy lock or publication approval.
