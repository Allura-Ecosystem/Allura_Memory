# Allura Cowork

Allura Cowork is a dual-runtime plugin package for Claude Code and Codex.
It helps new users run governed AI collaboration without learning the whole
Allura operating model first.

## Promise

This plugin does not prevent every hallucination. It reduces unsupported claims
by making the agent search memory, name its runtime, produce evidence, validate
work, and write a receipt before calling work done.

## What Users Get

- A shared Claude/Codex cowork protocol.
- Commands for starting, handing off, validating, and closing work.
- A reusable handoff schema.
- Runtime honesty rules: perspective is not execution.
- Allura Brain defaults: `group_id=allura-system`.
- Approval boundaries for config, cron, runtime, production, semantic promotion,
  Notion sync, and Done/Approved status mutation.

## Commands

- `cowork-start`: hydrate project and memory context, then choose route.
- `cowork-handoff`: create a structured packet between Claude and Codex.
- `cowork-validate`: check claims and evidence before close.
- `cowork-close`: write outcome summary and remaining risk.

## Validation

Run:

```bash
python3 /home/ronin704/plugins/allura-cowork/scripts/validate_plugin.py /home/ronin704/plugins/allura-cowork
```
