---
name: systematic-debugging-memory
description: Use for bugs, failed tests, or unexpected behavior. Hydrate evidence, prove root cause, test one hypothesis, apply one focused fix, and record one governed outcome.
---

# Systematic Debugging with Governed Memory

> [!NOTE]
> **AI-Assisted Documentation** — reconciled from the installed Team RAM debugging workflow against the current repository memory contract; full human review remains pending.

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

If a Brain operation is unavailable, pending or returns no relevant result, report
the observed operation/layer and continue independent local work where permitted.
A timeout is not evidence of disconnection. Inherit the [shared memory contract](../allura-memory-skill/SKILL.md), including MCP_DOCKER routing, schema discovery,
one supported idempotency key and verified read-back before claiming persistence.

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

After verified completion, follow the [shared governed memory contract](../allura-memory-skill/SKILL.md)
to append one outcome containing the problem, root cause, fix, source revision,
validation, prevention and remaining risk. Preserve one server-supported idempotency
key and verify destination/principal/record/content/receipt through read-back.
If the required route or key/read-back mechanism is missing, report the unmet gate;
do not invent a field, retry with a new key or insert directly into event tables.
Transport owns identity; omit persona `user_id` and unverified agent attribution.
Human curators alone authorize semantic promotion. Retain active write holds.

## Completion receipt

Report:

- Root cause and confirming evidence
- Files changed
- Tests and validation actually run
- Outcome write success, failure, or unavailability
- Remaining risk
- Semantic promotion: not requested by this ordinary workflow

## Investigation safety and tracing

Inspect sanitized boundary inputs/outputs and presence of required configuration;
never print credentials, raw authorization headers, private keys or entire
environments. When a value originates deep in the call stack, trace its callers backward to
the first incorrect input or authority boundary and fix that source. Extra instrumentation requires its own scope
and must not become permanent telemetry without the relevant decision.

End substantive final replies with the five-field reflection required by the
[shared operating core](../allura-team-ram/SKILL.md#reflection). A debugging
phase or completion marker does not authorize a database event or prove acceptance.
