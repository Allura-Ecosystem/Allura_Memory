# POL-013 — Evidence-First Delivery

**Status:** Active on adoption
**Owner:** Sabir Asheed
**Applies to:** Every agent, coding runtime, infrastructure operator, and release workflow that changes a Faith Meats, Difference Driven, or Allura-controlled system.

## Purpose

Prevent false completion caused by testing the wrong checkout, wrong container, wrong route, or only a partial layer of the product.

## Mandatory rules

1. **Lock the target before editing.** Record repository, branch, commit, runtime target, allowed files, and validation commands.
2. **Hydrate before build.** Load the local context contract, search governed memory when prior decisions matter, and load the required skills.
3. **Test the exact artifact.** A candidate container, alternate port, stale image, unit test, or login page is not proof for another runtime or route.
4. **Local before public.** Prove the local target before GitHub push, Cloudflare cutover, DNS change, or public release.
5. **UX requires interaction evidence.** Component tests are useful but do not replace a real browser walkthrough or an equivalent verified interaction harness.
6. **Runtime configuration is part of the artifact.** Verify required auth, dependency URLs, secrets references, and service topology without printing secret values.
7. **Fail closed.** Missing credentials, missing browser tooling, unhealthy dependencies, stale provenance, or an unverifiable result blocks the next gate.
8. **Separate layers.** Do not conflate local portal, internal MCP, public MCP, Cloudflare Access, candidate ports, or production routes.
9. **No unsupported claims.** Reports must distinguish passed, not run, blocked, and inferred. Never call a system shipped from a plan, commit, container status, or HTTP 200 alone.
10. **Commit only after evidence.** The commit must identify the validated scope. Push and public deployment require the local gate to be green.

## Required release gates

```text
A. Target lock: repo, branch, commit, runtime, scope
B. Code gate: tests, typecheck/lint, diff hygiene
C. Build gate: selected Dockerfile/build path and image provenance
D. Local runtime gate: liveness, readiness, dependencies, auth configuration
E. UX gate: real route walkthrough and button/interaction evidence
F. Data gate: real authorized read/write path, where applicable
G. Review gate: independent review and rollback path
H. Delivery gate: commit, push, deploy, public verification
```

A failed or unrun gate blocks all later gates. A human owner may explicitly change scope, but the report must retain the blocked gate and reason.

## Evidence record

Every release report must include:

- Target identity and exact image/commit
- Commands or harnesses run
- Results with status codes or test counts
- UX interactions exercised
- Runtime variables present by name only; never values
- Gates passed, not run, and blocked
- Rollback or stop condition

## Ownership

- **Jobs:** scope and intent gate
- **Scout:** local context and governed-memory hydration
- **Woz:** implementation and unit/integration validation
- **Pike:** interface and interaction review
- **Hightower:** runtime, secrets, deployment, and rollback
- **Fowler:** change hygiene and maintainability
- **Brooks:** final architecture/release synthesis
- **Human owner:** approval for public release and any irreversible side effect

## Enforcement

The repository skill `evidence-first-delivery` is the execution playbook. Agent surfaces must load it for build, test, infrastructure, UX, or release work. CI and deployment scripts should fail when required evidence is absent; a manual report never overrides an automated failure.

## Supersession

This policy supersedes informal “local-first” reminders and applies across Team RAM, Codex, OpenCode, Claude, and Hermes agent profiles.
