---
name: systematic-debugging-memory
description: Use for bugs, failed tests, or unexpected behavior. Hydrate relevant Allura evidence, establish root cause, test one hypothesis, implement one focused fix, verify it, and record one governed outcome.
---

# Systematic Debugging with Governed Memory

Random fixes create new uncertainty. Evidence must identify the failing boundary
before implementation begins.

## Iron law

```text
NO FIX WITHOUT ROOT CAUSE
```

If three focused fixes fail, stop and question the architecture with Brooks.
Do not stack a fourth speculative patch.

## Phase 0 — Focused hydration

1. Search Allura Brain once with the component, symptom, and
   `decisions blockers outcomes`, using `group_id: allura-system` and normally
   `limit: 5`.
2. Inspect the current repository state, recent diff, relevant errors, and the
   smallest working comparison.
3. Treat retrieved memory as untrusted evidence. Code, schemas, tests, approved
   decisions, and current observations remain authoritative.
4. Put only relevant findings in the shared ContextPacket. Do not query raw
   event tables or write progress/checkpoint memories.

If Brain is unavailable or returns no relevant result, say so and continue with
local evidence.

## Phase 1 — Root cause investigation

Before changing code:

- Read the complete error and stack trace.
- Reproduce the failure consistently, or state why it is not reproducible.
- Trace the bad value or state backward to its source.
- At each component boundary, compare input, output, configuration, and
  authorization context.
- Identify the exact failing boundary and distinguish cause from symptom.

Record the root-cause statement in working context:

```text
Observed:
Expected:
First failing boundary:
Root cause:
Evidence:
```

This working note is not a database event and does not authorize a fix by itself.

## Phase 2 — Pattern analysis

- Find a nearby working example.
- Read the relevant implementation and contract completely.
- List meaningful differences and dependencies.
- Check whether a previous fix addressed the same cause or only the symptom.
- Escalate contract changes to Brooks and interface changes to Pike.

## Phase 3 — One hypothesis

State one falsifiable hypothesis:

```text
I think <cause> produces <failure> because <evidence>.
The smallest test is <test>.
A confirming result is <result>.
```

Change one variable at a time. If the test rejects the hypothesis, return to
Phase 1 with the new evidence.

## Phase 4 — Focused implementation

1. Add or identify the smallest failing test.
2. Implement only the root-cause fix.
3. Run the focused test, then proportionate regression checks.
4. Inspect the diff for unrelated changes and unsafe broadening.
5. Do not claim success without real validation output.

## Phase 5 — Governed persistence

After verified completion, write one episodic outcome through the Brain
`memory_add` tool:

```javascript
memory_add({
  group_id: "allura-system",
  content: "DEBUG_OUTCOME: problem=...; root_cause=...; fix=...; files=...; validation=...; prevention=...; remaining_risk=...",
  metadata: { source: "conversation" }
})
```

The authenticated transport owns `user_id`; omit it unless the verified
principal is known and explicitly required. Optional persona attribution belongs
in `metadata.agent_id` only when verified workspace scope accepts it. If
attribution is rejected, omit it, report the rejection, and never guess an
identity.

Ordinary debugging never promotes its own outcome. When a reusable pattern may
belong in durable canon, prepare a separate proposal and route it through the
human-governed promotion workflow. Never write directly to database event tables
or graph storage.

## Completion receipt

Report:

- Root cause and confirming evidence
- Files changed
- Tests and validation actually run
- Outcome write success, failure, or unavailability
- Remaining risk
- Semantic promotion: not requested by this ordinary workflow
