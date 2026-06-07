---
name: guide-skill-creator
description: Learn how to use the skill-creator workflow to define, test, and package new OpenCode skills.
---

# Guide: Skill Creator

Use this skill before creating or modifying reusable assistant behavior.

## Purpose

This skill translates a task into an installable `.skill` artifact using the `skill-creator` workflow. It covers usage elicitation, SKILL.md authoring, packaging, and usage verification.

## When to use

- You need to create a new `.opencode/skills/<name>/` directory.
- You need repeatable instructions for an agent workflow.
- You need to capture command-level, MCP-level, or review checks in one place.
- Existing skills are missing clear trigger conditions or verification steps.

## Required setup

- You have loaded `skill-creator`.
- You have write access to `.opencode/skills/`.
- You know the intended skill name (lowercase, dash-separated).

## How to use the skill-creator process

1. **Define the scope in one sentence**
   - What does the skill make easier?
   - What exact user intent should trigger it?
   - What is in/out (inputs → outputs)?

2. **Collect 1–3 concrete examples**
   - Example command or user intent.
   - Expected tool calls (tool names only).
   - Expected decision point or exit criteria.

3. **Prepare skeleton directories**

```bash
mkdir -p .opencode/skills/<skill-name>/{references,scripts,agents,assets}
```

4. **Create `SKILL.md` first**
   - Use imperative language: “Do X”, “Collect Y”, “Call Z”.
   - Include:
     - purpose
     - triggers
     - exact execution steps
     - required tools and tool order
     - verification commands
     - failure handling

5. **If MCP servers are needed**

- Discover servers.
- Configure credentials.
- Add and activate server.
- Run a validation command before documenting capabilities.

6. **Package**

```bash
python .opencode/skill/skill-creator/scripts/package_skill.py .opencode/skills/<skill-name> [./dist]
```

7. **Verify**

- Run the tool loading test path once.
- Confirm examples execute from prompt to result.
- If failing, update `SKILL.md` and rerun packaging.

8. **Promote with evidence**

- Log usage, outcomes, and edge cases in the memory trace.
- Add references/checklists under `references/` as the skill evolves.

## Minimum required content in every skill

- **frontmatter metadata** (`name`, `description`)
- **one-line purpose**
- **trigger list**
- **execution steps**
- **tooling and permissions caveats**
- **validation/verification steps**

## Error handling checklist

- If the name already exists: update existing skill instead of duplicating.
- If required tooling is unavailable: document fallback in `SKILL.md`.
- If packaging fails: record exact failure and minimal reproduction case.
- If skill behavior is ambiguous: block and ask for 1 concrete command example.

## Quick validation checklist

- [ ] Is there a clear trigger phrase?
- [ ] Are outputs machine-usable (commands/tool names listed)?
- [ ] Are failure branches documented?
- [ ] Is verification defined (`test` / `smoke` / example call)?
- [ ] Is the skill installable from `.opencode/skills/<name>/SKILL.md`?

## Notes

- Keep the skill small and reusable.
- Prefer plain deterministic steps over narrative prose.
- Move reusable scripts, test fixtures, or docs into `scripts/`, `references/`, `assets/`.
