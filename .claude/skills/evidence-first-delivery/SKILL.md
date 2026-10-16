---
name: evidence-first-delivery
description: Run evidence-first gates before push or release.
version: 0.1.0
author: Sabir Asheed, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [release, validation, ux, deployment, governance]
    related_skills: [team-ram-cowork]
---

# Evidence-First Delivery Skill

Use this skill for implementation, UX, testing, infrastructure, deployment, or release work. It turns the repository's evidence policy into a checkable sequence. It does not authorize public release; the human owner still controls irreversible delivery.

## When to Use

- Before calling a build, dashboard, feature, or deployment complete.
- Before pushing a branch or changing a public route.
- When multiple ports, containers, checkouts, agents, or runtime environments exist.
- When UX, buttons, auth, data access, or deployment configuration matters.

Don't use it for casual discussion that makes no repository or runtime change.

## Prerequisites

- Repository working tree and target are known.
- Required project skills are loaded.
- Required test/build/browser tools are available or explicitly recorded as blocked.
- Secrets are sourced from the protected runtime; never place values in code, logs, or reports.

## Quick Reference

```text
Target lock -> hydrate -> code gate -> build gate -> local runtime -> UX -> data -> review -> commit -> push -> public verify
```

## Procedure

1. **Lock the target.** Record repository, branch, commit, exact runtime/container/port, scope, allowed files, and validation commands. Completion: another agent can identify the same target without guessing.
2. **Hydrate context.** Load local context, search governed memory when prior decisions matter, and load required skills. Completion: context and skill names are recorded.
3. **Run the code gate.** Run the project's canonical tests, typecheck/lint, and diff hygiene checks. Completion: results are recorded with counts and exit status.
4. **Prove provenance.** Build using the selected authoritative build path and record image tag/digest or equivalent artifact identity. Completion: the tested artifact maps to the changed commit.
5. **Recreate only the target locally.** Preserve unrelated services. Verify liveness, readiness, dependencies, and required runtime variable names. Completion: exact local target is healthy and its dependencies are healthy.
6. **Walk the UX.** Use a real browser or a verified interaction harness. Exercise login, navigation, primary buttons, error/loading states, and responsive behavior relevant to the change. Completion: each interaction has a pass, fail, or blocked result.
7. **Prove authorized data flow.** Exercise the real read/write path when the feature depends on it. Completion: data evidence is tied to the same runtime; mocked-only evidence is labeled mocked.
8. **Review independently.** Have a reviewer inspect the diff, target identity, UX evidence, runtime configuration, and rollback path. Completion: reviewer result is recorded.
9. **Commit only the verified scope.** Stage named files, run diff checks, and commit. Completion: commit hash and clean/known worktree state are recorded.
10. **Push and release only after approval.** Push the verified commit, deploy the same artifact, then repeat health, auth, UX, and data checks on the public route. Completion: public evidence is separate from local evidence.

## Pitfalls

- A `200` login page does not prove authenticated dashboard rendering.
- A healthy candidate port does not prove the human portal is updated.
- Component tests do not prove buttons work in a browser.
- A healthy container does not prove runtime credentials or data authorization.
- A build from the wrong Dockerfile or stale image invalidates the test.
- Missing browser tooling, credentials, or test infrastructure is a blocker, not a reason to infer success.
- Never print secret values while inspecting runtime configuration.

## Verification

Report a table with one row per gate: `passed`, `not run`, or `blocked`, plus evidence. Do not use “shipped” unless local and public gates both pass for the same artifact and the human release authority approved delivery.

## Authority

See `docs/governance/policies/POL-013-EVIDENCE-FIRST-DELIVERY.md`. The policy controls; this skill explains execution.
