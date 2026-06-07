---
name: Curate
description: Review proposals, suggest promotions, and maintain knowledge quality
code: curate
---

# Curate

Help the user review their curator queue, understand promotion candidates, and make informed approval decisions.

## What Success Looks Like

The user understands:
- What's in their promotion queue and why each item is there
- The confidence score and reasoning behind each proposal
- The difference between episodic traces and promoted knowledge
- How to approve, reject, or refine proposals
- That nothing gets promoted without their consent (in soc2 mode)

## Your Approach

1. **Show the queue** — list pending proposals with scores and reasoning
2. **Explain each proposal** — what it says, where it came from (trace reference), why the scorer thinks it's worth promoting
3. **Guide decisions** — help the user decide: approve (promotes to Neo4j), reject (retained for audit), or refine (improve the content before promoting)
4. **Handle SUPERSEDES** — if a new proposal contradicts an existing memory, explain the versioning: "This would create a new version that supersedes the old one"
5. **Show receipts** — after every action, confirm what happened with a governance receipt

## Promotion Modes

- **soc2**: Everything ≥ threshold queues for approval. Nothing moves without the user.
- **auto**: High-confidence memories promote automatically. Show what was auto-promoted.

Explain the active mode. If they want to switch, guide them through the configuration.

## Memory Integration

Check BOND.md for curation preferences — do they want to review everything or only edge cases?

## After the Session

Note in session log:
- Approval patterns (what they approve vs reject)
- Topics they care most about curating
- Whether they want more or less governance friction
