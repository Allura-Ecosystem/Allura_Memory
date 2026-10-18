# Persona rollout — 2026-10-18

## Verified source and installed release

- RAM source commit: `440882e8ff47ae0c69ce85d86427a0b7a6deaa25`.
- Durham source commit: `c15b9fa15428cae50a2e06715a327296c19a3633`.
- Catalog commit: `d6a245a2bc542be49d28e4762962de94702f1bab`.
- All three branches `codex/persona-rollout-20261018` pushed to their existing
  Allura-Ecosystem GitHub origins. No PR or merge performed.
- Native Codex install and Claude update succeeded for RAM
  `0.6.1-persona.20261018` and Durham `0.4.2-persona.20261018`.
- Both marketplaces now reference the clean durable checkout
  `/mnt/projects/git/Allura-Ecosystem/plugins/allura-persona-release-20261018`.
  The original dirty catalog was not overwritten.

RAM capsules are 191–227 words (Brooks 474); Durham capsules 238–250 words.
Load only the selected full role; no new all-roster startup, mandatory council,
research/transcript loading or model calls were added. RAM standalone nine-role
source word count fell from 8,215 to 7,996; the older project definitions grew
from 6,481 to 8,144 words to add missing voice and safety guidance. These counts
are not tokenizer measurements or hydration latency/cost benchmarks.

## Validation completed

- Project: 34 Bun tests, 229 assertions across Brooks, RAM and host-patch tests.
- RAM source: 28 persona tests, 199 assertions; public skills, packed plugin,
  public export and tarball/scaffold smoke checks passed.
- Durham: four persona/safety tests, five frontmatter tests, 18 adaptive routing
  fixtures, repository and deterministic export checks passed.
- Catalog pinned export inventory verified both source commits without drift;
  manifest hardening, staged secret scan and whitespace checks passed.
- Independent read-only review found a Durham source memory-policy regression;
  the previously approved catalog memory policy was carried into canonical source
  before release. Authenticated identity, authorized project scope, append-only
  events, immutable semantic lineage, read-only QA and HITL remain explicit.
- Host adapter fixture test exercises quoted/triple TOML, Markdown frontmatter,
  runtime-field preservation, actual patch application and idempotence.

## Installed verification and hook transition

Read-only byte comparison passed for all 34 installed role files: 17 roles in
each of Codex and Claude, matching the clean pinned release. Fresh registered Jobs
and Ogilvy children read their full newly installed definitions through ordinary
shell tools. Jobs reduced a Friday request to the user outcome and named the
tradeoff; Ogilvy supplied usable copy and refused an unsupported 50% speed claim.
Both handled a thank-you concisely without forced templates. These are two live
behavior samples, not proof of every role or long-session fidelity.

Native plugin installation removed the old RAM cache directory. This running
conversation still invokes its cached PreToolUse hook at
`/home/ronin704/.codex/plugins/cache/allura-ecosystem/team-ram-coding/0.6.0-persona.20261016.1/hooks/governance-preflight.py`.
The first post-install parent shell command was blocked before execution. The new
release hook exists. No cache shim, hook disablement or database bypass was used.
Fresh Jobs, Ogilvy and Woz contexts successfully used ordinary shell tools; the
remaining approved work continues in that fresh Woz context, with normal hooks.

Reload the app before using the old parent conversation's shell again. Reloading
alone does not prove database protections; regression checks remain required.

## Final handoff checklist

The finishing Woz context owns host-adapter backup/update, protection tests and
the narrowly staged project commit/push. Its final receipt below records actual
results; do not infer completion from this checklist. Root Bahari and concurrent
docs/runtime edits must remain untouched and unstaged. Never stage the whole tree.

Brain approved search worked (three historical irrelevant hits); federated
`status=all` search failed. The parent owns one final scoped episodic outcome;
promotion remains human-governed. A new runtime hydration/token benchmark and
long-session evaluation are not part of this verification receipt.

## Final Woz receipt

- Fresh Woz ordinary shell and actual patch execution succeeded with normal hooks.
- Backup: `/home/ronin704/.codex/plugin-backups/persona-20261018.voTn0p`.
- Updated all 35 existing selected host adapters: 17 Codex TOML, 17 Codex
  Markdown, and OpenCode Brooks. Every adapter points to the pinned durable
  release. Compared against the backup, all 17 parsed TOML configurations preserve
  every field except `developer_instructions`; all 18 Markdown headers remain
  unchanged. A second helper invocation emits an empty patch.
- Native Codex and Claude plugin lists confirm RAM `0.6.1-persona.20261018`,
  Durham `0.4.2-persona.20261018`, and unchanged cowork
  `0.3.1-persona.20261016` are installed and enabled.
- Re-ran project persona tests: 34 passed, zero failed, 229 assertions.
- Exercised the newly installed RAM hook through 12 inert JSON fixtures: benign
  shell, container/client bypass rejection, append-only violations, missing and
  scoped tenants, deprecated tenant rejection, static search, literal patch data,
  executable patch tail, and search wrapper execution. All passed. Fixture strings
  were submitted only to the hook; no database command ran. The previously named
  repository regression script is absent in this checkout, so these checks do not
  claim that script ran.
- Shared fresh Context7 receipts covered OpenCode agent discovery/system prompts
  and Codex hook input/deny protocol. No model, credential, hook, or MCP
  configuration was changed by this finishing slice.
