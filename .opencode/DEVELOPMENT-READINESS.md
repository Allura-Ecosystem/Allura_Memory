# Development readiness — isolated local work

**Do not use the production Brain as a development database.** The historical
`brain:up`, `brain:down`, recovery, root Compose, and migration recipes are
operations commands, not the local-development bootstrap path.

## Before editing

1. Check `git status --short --branch` and `git worktree list`.
   Preserve unrelated changes; never reset, stash, prune, or remove another
   worktree to make this one look clean.
2. Use a durable worktree outside `/tmp`, on a dedicated branch. Lock the
   worktree against accidental pruning. Do not merge unreleased feature work
   merely to prepare the environment.
3. Read local context and retrieve authorized Allura context through MCP.
   Retrieval is context only: no test writes, fixtures, migrations, or
   development credentials belong in the live Brain.
4. Follow [the isolated development runbook](../docs/guides/isolated-development.md).
   Use the repository-pinned Bun runtime and frozen lockfile. Do not copy a
   production `.env`, API token, or database credential into the worktree.
5. Name the acceptance tests before implementation. Run focused tests, typecheck,
   and the unit lane before independent review and a local commit.

## Isolation requirements

- Development PostgreSQL: `127.0.0.1:55432`, database `allura_dev`.
- Development dashboard: `127.0.0.1:4100`, loopback only.
- Dedicated Compose project; synthetic fixtures and disposable storage only.
- No production containers, database volumes, tunnels, or auth configuration changes.
- Use the safe launcher from the runbook. Bare runtime commands bypass its checks.
- On a shared low-memory machine, run heavy validation lanes sequentially with
  one worker. Stop at a real resource or test blocker rather than hiding failures.

## Ready means evidence, not intent

A clean development checkout is not a production release approval. Record the
base commit, executed checks, failures or skips, local endpoint results, and
preservation of the original work. Push, merge, and deployment remain separate
explicit actions. No command can guarantee future edits will never break things.

AI-assisted maintenance note: this checklist was updated to separate local
software development from production operations. Code and executed tests remain
the authority for the launcher behavior.
