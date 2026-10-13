# Allura Design System

> General reference: [Allura Brand Style Guide](https://app.notion.com/p/3481d9be65b381109a74f02c224d9e23), fetched through the remote Notion MCP on 2026-08-22. For this Epic 25 project, the user-approved current `index.html` plus `allura-brand-renewal.css` control the active palette and typography. AionUI is sunset and is not brand authority.

## Epic 25 approved visual direction

The current enterprise mockup is the approved visual authority for this project. Its active tokens are `#0D47A1` blue, `#FF4D1F` orange, `#148A4B` green, `#0F1720` ink, `#F7F3EE` cream, `#FFFDF8` paper, and `#58616D` muted text. Its typography is Aeonik with IBM Plex Sans and system fallbacks. These choices are intentional for Epic 25 and must not be normalized back to this document's earlier general tokens without explicit user direction.

Canonical local wordmark and AL lettermark assets remain required; technical fixes may improve accessibility, state behavior, and responsive layout without replacing the approved color branding.

## 1. Visual Theme & Atmosphere

Allura is **Warm + Connected**: a modern, human-centered technology brand that brings clarity to the moments that matter. The brand purpose is to give people the power to hold on to what matters and share it with the people who matter most through intelligent, human-centered technology.

Personality balance:
- Caregiver 50%: lead with empathy, protect what matters, put people first.
- Creator 30%: build with purpose, design intentionally, simplify intelligent ideas.
- Explorer 20%: remain curious, challenge the status quo, keep evolving.

Photography is warm, community-focused, authentic, and urban. Prefer natural or golden-hour light, soft shadows, diverse communities, genuine interaction, approachable composition, slightly warm grading, and high clarity.

Illustration uses soft rounded line icons with droplet influences: 2px strokes, round joins and caps, arch forms, a 24×24 grid, and one color—Deep Navy or Ink Black.

## 2. Color System

| Token | Hex | Usage |
|---|---:|---|
| Deep Navy | `#1A2B4A` | Primary brand, trust, depth, intelligence |
| Coral | `#E85A3C` | Primary action, warmth, energy, human touch |
| Trust Green | `#4CAF50` | Success, growth, positive reinforcement |
| Clarity Blue | `#5B8DB8` | Information, calm, clarity |
| Pure White | `#F5F5F5` | Backgrounds and breathing room |
| Ink Black | `#1A1A1A` | Primary text |
| Warm Gray | `#737373` | Secondary text and subtle elements |

Target composition ratio: 50% Pure White, 25% Deep Navy, 15% Coral, 7% Trust Green, 3% Clarity Blue. Use semantic colors according to meaning; do not use success or information colors as arbitrary decoration.

## 3. Typography

Primary typeface: **Inter**. Fallback: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.

Supported weights: Regular 400, Medium 500, SemiBold 600, Bold 700.

| Style | Specification |
|---|---|
| Hero | 64px / 700 / 1.1 |
| H1 | 48px / 700 / 1.1 |
| H2 | 36px / 600 / 1.1 |
| H3 | 28px / 600 / 1.5 |
| H4 | 24px / 600 / 1.5 |
| Body Large | 18px / 400 / 1.75 |
| Body | 16px / 400 / 1.5 |
| Caption | 14px / 400 / 1.5 |
| Overline | 12px / 600 / 1.5 / 0.05em / uppercase |

Use sentence case for interface language. Reserve uppercase for short overlines—not emphasis.

## 4. Spacing & Shape

Use the canonical 4px-based spacing scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128px`.

Favor generous whitespace, soft rounded geometry, calm grouping, and deliberate hierarchy. Curves may echo the droplet forms in the identity, but should remain functional rather than decorative.

Logo clear space equals the x-height of the lowercase `l` on all sides. Minimum wordmark size: 120px digital or 1.5 inches print.

## 5. Layout

- Use clear, readable hierarchy and generous breathing room.
- Lead with one human-centered message, followed by evidence and actions.
- Use Deep Navy for structural anchors and Coral for the primary action.
- Keep content widths readable; avoid dense enterprise dashboards unless the task genuinely requires one.
- Feature authentic community photography rather than abstract AI imagery.
- Hero applications may use the extended graphic mark; ordinary contexts use the full wordmark.

## 6. Components

Buttons:
- Primary: Coral action surface with accessible foreground contrast.
- Secondary: Deep Navy or outlined treatment with explicit hover and disabled states.
- Preserve comfortable touch targets and obvious focus states.

Cards:
- Calm neutral surfaces, clear hierarchy, minimal borders, and rounded geometry.
- Use status colors only for status meaning.

Icons:
- 24×24 grid, 2px rounded stroke, single-color treatment.

Logo variants:
- Full wordmark is the default.
- Extended graphic mark is for hero applications.
- Icon-only is for avatars and application icons.
- Simplified droplet is for favicons.
- Use canonical artwork; never redraw the mark from text.

Canonical Open Design assets:
- `assets/allura-wordmark.png`
- `assets/allura-wordmark-runtime.png`
- `assets/allura-wordmark-figma.png`
- `assets/allura-lettermark.png`
- `assets/allura-lettermark-al-figma.png`
- `assets/allura-brand-overview-figma.png`

Use `assets/allura-wordmark.png` as the normal wordmark and `assets/allura-lettermark-al-figma.png` for compact identity applications. These are provenance-tracked local assets, not generated replacements.

## 7. Motion & Accessibility

Motion should clarify state and preserve calm. Use short, subtle transitions; honor reduced-motion preferences; avoid gratuitous parallax, bouncing, or perpetual animation.

- Maintain WCAG-readable contrast.
- Provide alt text for meaningful imagery.
- Keep keyboard focus visible.
- Do not communicate status by color alone.
- Preserve readable line lengths and scalable type.

## 8. Voice & Brand

Voice is warm, empowering, and authentic.

Preferred:
- “Join your community.”
- “We build belonging.”
- “Come as you are.”

Avoid:
- “Sign up as a user.”
- “We leverage synergy.”
- “Optimize your profile.”

Use **community**, not **users**. Write conversationally, lead with care, explain intelligent technology plainly, and avoid corporate jargon.

## 9. Anti-Patterns & Governance

Never:
- Use AionUI as current brand authority.
- Invent, redraw, stretch, or recolor the Allura logo.
- Substitute generic AI gradients, glowing brains, robot imagery, or sci-fi chrome for the documented identity.
- Replace Inter with ornamental display typography.
- Overuse Coral, Trust Green, or Clarity Blue beyond their semantic roles.
- Use all caps for emphasis.
- Describe people as “users” in outward-facing brand language.
- Claim local assets or component files exist unless their paths are verified.

Canonical Notion guidance controls when local or historical artifacts disagree. Logo images embedded in Notion are canonical references; store permanent local copies with provenance rather than retaining expiring signed URLs.
