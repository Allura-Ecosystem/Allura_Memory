# Development Readiness

> [!NOTE]
> **AI-Assisted Documentation** — workflow correction; no implementation, deployment or board-status approval is implied.

Use [AI guidelines](../guidelines/AI-GUIDELINES.md), the
[canonical development gates](../docs/allura/REQUIREMENTS-MATRIX.md#development-slices-and-handoff-gates)
and [allura-dev-story](skills/allura-dev-story/SKILL.md) before implementation.

1. **Establish authority and source.** Record exact revision, relevant dirty-diff
   digest, objective, tenant/workspace, prerequisites and access. Preserve existing
   work; use an isolated checkout without production dotenv or credentials.
2. **Hydrate bounded context.** Load task-relevant files and attempt a scoped Brain
   search through actual permitted tools. The canonical endpoint is
   `https://mcp.faithmeats.org/mcp`; never change endpoint/tenant after denial or a
   slow request. Record tool discovery, authenticated access and individual request
   results separately. Missing recall does not stop independent local preparation.
3. **Resolve the story.** Ready for preparation, Needs a decision and Blocked are
   scope-specific. Do not implement unresolved product/security/schema decisions.
   Assign one writer and independent reviewers; assignment is not execution proof.
4. **Choose executable validation.** Inspect current `package.json` and lane
   configs. Use `bun run test:unit`, integration, curator or the applicable approved
   disposable live lane, plus `bun run typecheck` and real ESLint where affected.
   `bun run lint` currently aliases typecheck; it is not separate lint evidence.
   Verify test discovery, pass/fail/skip counts and exit codes. No implicit live
   database access, service restart or production configuration is authorized.
5. **Review and attest.** Check acceptance, negative/failure paths, exact reviewed
   diff, rollback and receipts. Passing documentation guards prove their bounded
   checks only. Check required hosted results on the exact PR head before merging.
6. **Close honestly.** A bounded loop needs measurable acceptance and a stop
   condition; a DONE marker is not completion evidence. Observe separate release,
   board-status, remote-transfer and semantic-promotion approvals. Append a single
   outcome only through the [governed memory contract](skills/allura-memory-skill/SKILL.md).

Current source presence, local preview behavior, passing tests, merged changes and
released behavior are distinct claims. Missing required evidence leaves the
specific story gate open; unrelated authorized preparation may continue.
