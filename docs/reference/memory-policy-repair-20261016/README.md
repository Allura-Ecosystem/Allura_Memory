# Memory policy and hook repair — 2026-10-16

## Outcome

The governance hook no longer treats literal patch data or a narrowly recognized
static search as a database mutation. Executable tails, substitutions, database
clients, unsafe ripgrep helpers/configuration, and original SQL/tenant checks
remain guarded. This is a heuristic guard, not a general shell/SQL sandbox.

Durham's memory policy, references, metadata, and diagnostic helpers now use
authenticated scope and identity, no direct storage fallback, append-only
corrections, immutable semantic versions, and human-approved promotion. Helpers
print honest manual checklists; they do not mutate production data.

Gillian's upgraded Bahari role is preserved: authorized capture, correction,
hygiene, soft-delete/restore, promotion proposals and human-approved transitions.
Audit-only limits apply only to explicitly audit-only tasks. Permission still
depends on the task and authenticated credential; a role file is not live RBAC
proof. No production curator mutation was performed as an access test.

## Validation

- Reloaded Codex wrapper successfully executed a standalone `rg --no-config`
  search containing a SQL mutation example against a documentation fixture.
- Five synthetic hook regression groups passed against installed governance,
  installed RAM, and the governance source snapshot below. Tests execute hooks
  with synthetic inputs only, never database mutation strings.
- 53 actual-source policy assertions passed, including Bahari's upgraded curator
  capabilities, read-only QA boundaries, live-schema-compatible examples, mirror
  equality, metadata, and safe helper behavior.
- Three skill frontmatters passed the bundled skill validator.
- Agent generator `--check` passed for all eleven source agents and runtime mirrors.
- Source/installed Durham skill directory and both hook files matched exactly.
- Independent review found stale Durham metadata; it was corrected before delivery.
- The guard conservatively denies compound shell strings containing dangerous
  examples. Use a standalone static search; do not broaden the exemption.

Run the durable checks with the actual source locations:

```sh
python3 tests/scripts/governance-preflight-regression.py /path/to/governance-preflight.py
bun tests/scripts/verify-memory-policy.mjs /path/to/allura-plugins /path/to/allura-team-ram /path/to/allura-memory-core/SKILL.md
```

The second check validates source contracts, not production authorization.

## Installed releases

| Plugin | Release |
| --- | --- |
| Allura governance | 0.1.4 |
| Team RAM coding | 0.6.0-persona.20261016.1 |
| Team Durham | 0.4.1-essentials.20261016.3 |

Installed through supported Codex and Claude marketplace commands, not cache
edits. Durham's final metadata update requires a new Claude session/restart to
load there; no app was restarted automatically. Runtime models, MCP endpoints,
credentials and database permissions were not changed by this repair.

## Ownership and rollback

Scoped source commits:

- `allura-team-ram`: `7bfb63b4` — preserve Bahari's curator upgrade and fix hook parsing.
- `allura-plugins`: `5fbbdf1` — governed Durham memory policy, safe diagnostics,
  metadata, distributed hook, and matching release versions.

Delivery branch in each repository: `codex/memory-policy-repair-20261016`.
No pull request or merge was requested. Main application source is unchanged.

Canonical Bahari and RAM hook source lives in `Allura-Ecosystem/allura-team-ram`.
Durham policy and the distributed RAM hook live in `Allura-Ecosystem/allura-plugins`.
Only this repair's explicit paths/version hunks are committed; unrelated dirty
persona/workflow/CI changes remain uncommitted.

`local-source-snapshots/` preserves the changed governance and OpenClaw files
whose installed owners are outside a Git checkout. These are review/recovery
snapshots, not an automatically loaded plugin, a complete install package, or a
local replacement memory bank. Current local owners:

- `/home/ronin704/.claude/recovered-allura-legacy/allura-governance/`
- `/home/ronin704/.agents/skills/allura-memory-core/SKILL.md`

For rollback, review/revert the scoped commits, regenerate Bahari mirrors using
the existing generator, and reinstall the selected plugin release through its
supported marketplace workflow. Do not disable hooks, edit caches, reset a dirty
checkout, alter credentials, or roll back another person's changes.

## Scope and remaining limits

Brain retrieval succeeded in `allura-system` with `include_global: false`, but
returned old graph-only records. Memory writeback remains paused because an
earlier `stored: both` response needs deployed-path/provenance verification; this
repair neither proves an unauthorized promotion nor resolves that investigation.
No memories were deleted or promoted. Production health/retrieval changes,
hydration-branch integration, and a new hydration timing run are outside this
policy-only delivery. No full application/DB E2E pass is claimed.
