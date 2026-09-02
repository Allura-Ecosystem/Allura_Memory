# Contributing to Allura Memory

Thanks for helping improve Allura. This repository follows the
[Allura Contribution Guide](https://github.com/Allura-Ecosystem/.github/blob/main/CONTRIBUTING.md);
the notes below are the local gates specific to this repo.

## Before you start

1. Read the local instructions and governance files (`AGENTS.md`, `CLAUDE.md`,
   `.opencode/agent/`) before making changes.
2. State the intended change and the evidence that will prove it works —
   a pull request should say which command produces the proof.
3. Keep client data, credentials, and private operational details out of
   public artifacts.

## Repository rules

- **Bun only.** npm/npx are banned (zero-trust supply chain policy).
- **Never mutate historical rows.** PostgreSQL traces are append-only.
- **Versioned knowledge.** Semantic updates create `SUPERSEDES` lineage;
  existing nodes are not edited.
- **HITL for promotion.** Agents cannot autonomously promote to the semantic
  graph; route through the curator approval path.

## Pull requests

Include:

- A short description of the change and why.
- The validation command(s) you ran and their result:

  ```bash
  bun run typecheck
  bun run test
  ```

- E2E suites require live infrastructure and are gated by `RUN_E2E_TESTS=true`;
  say when you did not run them and why.

Required pull-request validation produces a commit-bound evidence manifest;
see [`docs/portfolio/evidence-index.md`](docs/portfolio/evidence-index.md).

## Reporting issues

Include the expected behavior, the observed behavior, and the command or
endpoint that reproduces the difference. Vulnerability reports should go
through [private reporting](https://github.com/Allura-Ecosystem/Allura_Memory/security)
rather than a public issue.
