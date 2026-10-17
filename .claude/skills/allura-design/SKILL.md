---
name: allura-design
description: >
  Bridges huashu-design with Allura Brain governed memory.
  Pre-searches Brain for brand specs, invokes huashu-design workflow,
  stores design decisions and reviews back to Brain.
  Triggers on: prototype, mockup, app prototype, slide deck, animation,
  design review, brand spec, design direction, ui mockup, design exploration,
  make it look good, create a visual, design a page, design a component.
---

# Allura-Design · Huashu-Design + Brain Integration

## Conceptual Integrity

Allura-Design is not a design engine. It is a **governance membrane** between the user, the Brain, and huashu-design.

- **What it does**: Hydrate from Brain → delegate to huashu-design → persist outputs back to Brain.
- **What it does not do**: Generate HTML directly (that is huashu-design's role).
- **Invariant**: No design task starts before Brain search completes.

## Pre-Design: Brain Hydration (MANDATORY)

Before invoking huashu-design, run this protocol:

### Step 1: Search for existing context
- Search Brain for `brand-spec`, `design-system`, `design-review`, `color-palette`, `typography` matching the current project or brand.
- Search for user preferences (past design style choices, review scores).
- Set `min_score: 0.75` to filter noise.

### Step 2: Decision gate
- **If brand spec found** → hydrate huashu-design context with it (skip brand asset protocol Steps 1-5).
- **If design-system found** → pass CSS variables, spacing scale, component patterns to huashu-design.
- **If nothing found** → allow huashu-design to run its full 5-step Brand Asset Protocol, but prepend an episodic trace noting this is the first design task for this project.

### Step 3: Session log
```
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "Design session started. Brain hydration: found N design assets. Delegated to huashu-design.",
  metadata: { agent_id: "brooks-architect", workflow: "allura-design", step: "hydration" }
})
```

## Design: Delegate to huashu-design

After hydration, load and follow the canonical huashu-design skill:

```
Load skill: ~/.agents/skills/huashu-design/SKILL.md
```

### Key integration points

| Huashu-Design Phase | Allura-Design Action |
|---|---|
| Brand Asset Protocol (Step 1-5) | Already hydrated from Brain; skip if specs exist |
| Design Direction Advisor (Fallback) | If user is vague, return three directions to user for sign-off before proceeding |
| Junior Designer Workflow | Let huashu-design run; intercept assumptions for Brain logging |
| 5-Dimension Expert Review | After review, store scores + keep/fix/quick-wins list to Brain |
| Video/MP4/GIF Export | Log export metadata (file path, format, fps) to Brain |

## Post-Design: Memory Storage (MANDATORY)

After huashu-design delivers, store these artifacts:

### 1. Brand Spec (if new)
```
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "woz-builder",
  content: "Brand spec for [Project]: colors=..., fonts=..., logo path=..., product images=...",
  metadata: { type: "brand-spec", agent_id: "woz-builder", project: "[project_name]" }
})
```

### 2. Design Decisions
```
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "woz-builder",
  content: "Chose [direction] because [reasoning]. Rejected alternatives: [...]",
  metadata: { type: "design-decision", agent_id: "woz-builder" }
})
```

### 3. Review Scores (if review was run)
```
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "pike-interface-review",
  content: "5-dimension review: Philosophy=8, Hierarchy=7, Details=9, Functionality=8, Innovation=6. Radar chart path: /artifacts/...",
  metadata: { type: "design-review", project: "[project_name]" }
})
```

### 4. Promotion gate
- If average review score ≥ 8.0 / 10 → call `allura-brain_memory_promote` to elevate from episodic to the canonical semantic layer
- Rationale: "Validated by 5-dimension review, ready as canonical design system"

## Team RAM Routing

| User Intent | Primary Agent | Secondary Agent | Skill(s) |
|---|---|---|---|
| "make prototype / mockup / app" | Woz (builder) | Bellard (perf check on asset sizes) | huashu-design |
| "review this design / give feedback" | Pike (interface review) | — | huashu-design (critique mode) |
| "export video / animation / MP4" | Woz (builder) | Bellard (validate 60fps) | huashu-design (video export) |
| "pick a design direction / style" | Brooks (architect) | — | huashu-design (fallback advisor) |
| "design system / brand identity" | Brooks (architect) | Pike (review output) | huashu-design + manual refinement |
| "infographic / data viz / slides" | Woz (builder) | — | huashu-design (deck/infographic modes) |

## Invariants

1. **Brain search is never skipped** — even if user says "just make it look good"
2. **No promotion without review** — episodic stays raw until 5-dimension review passes
3. **License gate** — if deliverable is for external client, check `LICENSE-NOTICE.md` first
4. **Group id** — always `allura-system` on every Brain operation
5. **Agent id** — `woz-builder` for build tasks, `pike-interface-review` for reviews, `brooks-architect` for planning

## License Notice

This wrapper invokes huashu-design, which is licensed under a **Personal Use Only** license.
- ✅ Internal Allura prototyping, research, personal projects → allowed
- ❌ Client deliverables, commercial products, SaaS features → requires authorization from Alchain (花叔)

See `LICENSE-NOTICE.md` in this directory for full details.

## References

- `~/.agents/skills/huashu-design/SKILL.md` — canonical huashu-design skill
- `~/.agents/skills/huashu-design/references/` — design styles, animation best practices, critique guides
- `~/.agents/skills/huashu-design/scripts/` — export tools (MP4, GIF, PPTX)
- Allura Brain MCP tools: `allura-brain_memory_add`, `allura-brain_memory_search`, `allura-brain_memory_promote`
