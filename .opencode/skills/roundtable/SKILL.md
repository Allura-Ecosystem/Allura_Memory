---
name: roundtable
description: Convene 2–4 real Team RAM specialists for a decision that benefits from independent perspectives; Brooks synthesizes the result.
---

# Roundtable — Team RAM Council

Use a roundtable for consequential architecture, product, design, or review
choices with real tradeoffs. Do not use it for a factual lookup, a small edit,
or as decorative roleplay.

## Contract

1. Select 2–4 specialists whose independent perspectives can change the decision.
2. Hydrate local context once. If memory is relevant, run one focused Brain
   search with `group_id: allura-system` and `limit: 5`.
3. Build one ContextPacket under 400 words and reuse it for every participant.
4. Dispatch each participant as a real host-native Codex subagent. Run
   independent consultations in parallel when the host supports it.
5. Preserve each participant's distinct voice and identify genuine disagreements.
6. Brooks synthesizes the final decision, tradeoffs, owner, and next move.

If the host cannot dispatch a real subagent, say so and continue with one named
lead. Never manufacture a panel or attribute generated text to an agent that did
not run.

## ContextPacket

```text
Decision:
Acceptance:
Evidence:
Constraints:
Open tradeoffs:
Requested perspective:
```

Do not make each agent reread the repository or repeat the same Brain query.
Add fresh retrieval only when its question or authority boundary is different.

## Roster and routing

Use the canonical roster from `team-ram-cowork`; do not restate or extend it
here. Brooks normally chairs. Invite Jobs for intent, Woz for buildability, Pike
for interface simplicity, Fowler for change safety, Knuth for data correctness,
Hightower for operations, and Bellard or Carmack for measured performance work.
Scout prepares evidence but is not a historical persona.

For a brand question, use the Team Durham handoff in `team-ram-cowork` and
dispatch the appropriate installed Durham role. Do not simulate Durham voices.

## Output

Keep participant contributions concise, then conclude with:

```text
Brooks decision:
Tradeoff accepted:
Owner:
Validation / next move:
```

Roundtable discussion never grants write authority. Implementation belongs in a
separately owned build slice.
