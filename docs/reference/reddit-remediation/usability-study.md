# First-use study: Allura Memory

AI-Assisted Documentation: study kit, 2026-10-20. **Not run: 0/5 participants observed.** This document contains the protocol and blank recording fields, not research findings. Agent reviews and automated checks are recorded elsewhere.

## Purpose and audience

Recruit five people from the intended audience confirmed in the remediation brief. Include people who have not helped build Allura. Record relevant experience with AI coding agents, MCP, self-hosting, and databases; interpret setup results in light of that experience. Do not generalize this small formative study into a market or productivity claim.

Use the exact same documented revision and environment for each participant. Record browser, device, operating system, README commit, guide commit, gateway commit, and whether the environment was supplied or installed from scratch. A preconfigured service does not count as a clean-install study.

## Preparation

- Obtain the participant's agreement to observation and any recording. Use participant codes rather than personal information in repository notes.
- Supply an isolated authorized evaluation workspace with no customer data. Never share privileged reviewer credentials with participants.
- Verify the facilitator's task route before the session; keep that run separate from participant results.
- Prepare the current README, supported setup guide, an agent client, the example decision, and an independent authorized human reviewer if promotion is in scope.
- Record service outages and setup failures as observations. Do not silently repair them and score the task as unaided.

The [participant task card](participant-task.md) provides a short handout after the initial comprehension question. Do not coach with the evaluation rubric before recording the participant's own explanation.

## Session script

Say: “We are testing the product and instructions. If something is unclear, that is useful information. Please say what you expect to happen.”

1. Show the README for 30 seconds. Hide it and ask: “What is this for? Who would use it? What would you do next?” Record the participant's own words before further explanation.
2. Ask: “Use the supplied Allura connection and instructions. Save this decision: We chose PostgreSQL for this project because our team needs relational queries and an inspectable decision history.” Do not provide an invented identity or tenant. Use the provisioned authorized scope. If installation is separately in scope, record it as a distinct task.
3. Retain the saved ID in the observation record. End the first agent/client session. Start another session and ask: “Find our database decision. What was the reason, where did it come from, and has anyone approved it as shared knowledge?” Do not supply the ID before this search. Record the exact output and source/review labels, then compare ID and content with the save. A later exact-ID read can reconcile a miss but does not pass discovery.
4. Ask: “Does a successful save mean a human approved this? Who can make that approval?” Do not coach the answer. A score does not establish approval.
5. Ask the participant to explain the review step or, where a safe authorized reviewer environment exists, observe an independent human decision. Never let an agent approve its own record.
6. Exercise one safe failure, such as an unavailable endpoint or empty search, in the isolated environment. Ask what they would try next. Do not change credentials or scope to evade a denial.
7. Ask: “What did you expect to happen automatically? What work would you still need to do? Which step should disappear?” Record suggestions separately from observed behavior.

## Observation rules

Record task start/end, errors, choices, backtracking, help requests, facilitator interventions, and manual steps. A hint, hidden setup repair, or command supplied by the facilitator counts as assistance. Stop a task for a privacy/authority risk or participant discomfort. Keep service outages and task failures visible; explain exclusions rather than dropping participants after seeing their results.

A correct comprehension response identifies persistent project context, a relevant team/agent use case, and an available next step; it need not repeat marketing copy. A successful memory task returns the intended decision in the later session with inspectable source and review state. Reading a synthetic portfolio screen is a separate task.

## Blank participant record

Copy once per actual participant. Leave unknown values blank; do not populate illustrative results.

| Field | Observation |
|---|---|
| Participant code / relevant experience | |
| Date / device / source revisions / environment | |
| Consent and recording scope | |
| Purpose / audience / next step, verbatim | |
| Setup start / end / result | |
| Save receipt / source ID (sanitized) | |
| First session ended / later session started | |
| Retrieval result / source / review state | |
| Saved vs approved explanation, verbatim | |
| Independent review observed or explanation only | |
| Errors / backtracking / help / interventions | |
| Manual steps / recovery outcome | |
| Automatic-work expectations, verbatim | |
| Participant suggestions | |
| Task pass/fail/aborted and reason | |

## Goal evaluation targets and report

- UX-R01: at least 4/5 explain purpose, audience, and next step after 30 seconds.
- UX-R02: at least 4/5 finish the defined setup/save/later-session retrieval task without facilitator intervention. Report actual times; there is no established speed promise.
- UX-R03: all 5 distinguish saved evidence from approved knowledge and identify the human decision boundary. Any dangerous misunderstanding requires revision and retest.
- UX-R06: report actual manual steps, reviewer effort, operating assumptions, and recovery failures.

The user-provided remediation goal specifies these 4/5, 4/5 and 5/5 evaluation targets. Use them for this study without requesting another acceptance decision; they are not observed results or whole-product release approval. Report all five outcomes, failures and interventions, the affected revisions, changes made, and retest results. Separate desktop/phone material checks from human task evidence. Link results to the [execution checklist](execution-checklist.md) and the [requirements matrix](../../allura/REQUIREMENTS-MATRIX.md).

## Current evidence

Participants observed: **0**. Task outcomes, comprehension rates, time-to-first-memory, and reviewer effort: **unmeasured**. Recruitment, consent, sessions, revision, and retesting remain open.

## Recruitment clarification — 2026-10-21 UTC

Sabir clarified that the ability to arrange participants was a recruitment dependency, not five booked people. No facilitator or availability is confirmed. The five codes below identify unfilled study slots, not actual sessions or observations; recruitment and consent remain open.

| Participant code | Facilitator | Availability |
|---|---|---|
| P01 | Unassigned | Unconfirmed |
| P02 | Unassigned | Unconfirmed |
| P03 | Unassigned | Unconfirmed |
| P04 | Unassigned | Unconfirmed |
| P05 | Unassigned | Unconfirmed |

One human facilitator can use the same protocol across sessions. An agent can organize evidence and preparation, but simulations cannot count toward the required five humans or the independent human-review decision. Record actual revisions, environment, consent, failures and interventions when each session occurs.
