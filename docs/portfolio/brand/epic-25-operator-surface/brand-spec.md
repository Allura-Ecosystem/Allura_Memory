# Allura Operator Surface — Brand Specification

The system is a calm, evidence-first operator workstation: paper-toned surfaces, precise blue structure, sparse orange review attention, and technical identifiers set apart in mono.

## OKLch tokens

```css
:root {
  --bg: oklch(96.3% 0.012 88);
  --surface: oklch(99.2% 0.010 88);
  --fg: oklch(22% 0.012 260);
  --muted: oklch(49% 0.012 255);
  --border: oklch(84% 0.014 82);
  --accent: oklch(49% 0.145 256);
}
```

## Type stacks

- Display: `"IBM Plex Sans", "Segoe UI", sans-serif`
- Body: `"IBM Plex Sans", "Segoe UI", sans-serif`
- Mono: `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`

## Observed visual rules

1. Use cream canvas and warm white surfaces; avoid dashboard gloss and gradients.
2. Preserve the reading order: tenant and role, queue state, proposal, evidence, allowed decision, receipt.
3. Reserve blue for structure and navigation, and orange for review attention only.
4. Use mono type for traces, timestamps, versions, hashes, and machine-issued values.
5. Make degraded, forbidden, loading, empty, gated, and specimen states explicit in language, not color alone.
