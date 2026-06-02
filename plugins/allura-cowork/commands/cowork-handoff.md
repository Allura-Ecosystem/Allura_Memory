# cowork-handoff

Create a governed handoff packet between Claude and Codex.

## Required Fields

- from runtime/persona
- to runtime/persona
- goal
- context searched
- project overlay
- files touched or read
- decisions
- open risks
- validation run
- next action
- memory status
- approval needed

## Rules

- A written packet is not executed work.
- Do not claim tests, tools, or subagents ran unless they did.
- Keep the next action singular and concrete.
- Use `schemas/handoff.schema.json` when a machine-readable packet is needed.
