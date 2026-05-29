---
description: "Transform a vague idea into a clear goal with success criteria and definition of done"
allowed-tools: ["Read", "Write"]
---

# Define Goal

**Usage:** `/define-goal <your idea or project concept>`

Turn `$ARGUMENTS` into a structured goal definition.

## Steps

1. Extract core intent — remove ambiguity, state objective in one sentence
2. Describe the desired outcome — what "finished" looks like as a tangible result
3. Identify 3–5 non-negotiable core requirements
4. Define measurable success criteria (numbers, percentages, binary checks)
5. Write a definition of done — specific checkpoints confirming completion

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOAL DEFINITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Goal: [clear objective in one sentence]
Outcome: [what finished looks like]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [requirement 1]
2. [requirement 2]
3. [requirement 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUCCESS CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [measurable criteria 1]
- [measurable criteria 2]
- [measurable criteria 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINITION OF DONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [checkpoint 1]
- [checkpoint 2]
- [checkpoint 3]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rules

- No vague terms like "better" or "improved" without specifics
- Use numbers, percentages, or clear yes/no checks
- Write in imperative mood
- If the input is too vague, ask one clarifying question before generating
- Offer to save the output to `docs/archive/planning-artifacts/goals/` if the user wants to reference it later
