---
name: allura-menu
description: Show the compact Allura and Team RAM command surface on request. Default responses expose only the active lead and next useful move.
---

# Allura Menu

Do not print a menu during ordinary work. By default, show only the active lead,
the decision or result, and one compact next move.

When the user asks for `menu`, `help`, or `MH`, show:

```text
Council      Convene 2–4 real specialists for a Brooks-synthesized decision
Durham       Hand brand work to the installed governed Team Durham roles
RAM          Use or inspect the canonical ten-role Team RAM roster
Rehydrate    Refresh local context plus one focused allura-system Brain query
Status       Report verified task, evidence, collaborators, blockers, and state
Next Move    Show the smallest safely actionable next step
```

## Command behavior

- **Council** uses `roundtable`; it never simulates specialists.
- **Durham** uses the handoff contract in `team-ram-cowork`; it never duplicates
  the Durham roster.
- **RAM** names only the canonical roster in `team-ram-cowork` and distinguishes
  the active perspective from a real dispatched subagent.
- **Rehydrate** reuses a compact ContextPacket. Search Brain with
  `group_id: allura-system`, normally `limit: 5`, only when the task needs it.
- **Status** reports verified evidence and clearly marks unavailable sources.
- **Next Move** avoids ceremony and does not broaden authority.

Memory promotion is a separate human-governed workflow, never a quick-menu side
effect. Party mode dispatches only useful independent slices, never every agent.
