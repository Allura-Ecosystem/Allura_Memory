# Lessons from TALON & IRIS — Patterns to Adopt

**Created:** 2026-07-10
**Status:** TALON and IRIS are sunset. This document extracts their best patterns for adoption by Team RAM, Team Durham, Bahari, and Sarah Boone.

---

## The 9 Patterns Worth Keeping

### 1. Gated Execution Model (MOST VALUABLE)

Every TALON/IRIS agent has explicit numbered gates that MUST pass before any action:

```
## Gates (MUST pass before action)
1. Context loaded
2. Typecheck/lint/test path known
3. Release readiness confirmed
4. Allura reflection written
```

**Why it matters:** This is a pre-flight checklist. It prevents agents from jumping straight into work without verifying they have what they need. RAM agents have principles but lack this structured gate pattern.

**Adopt for:** Every RAM and Durham agent. Each should have 3-8 numbered gates specific to their role.

**Example for Woz:**
```
## Gates (MUST pass before action)
1. Context loaded — Brooks or Jobs has scoped the task
2. Allura Brain searched for prior patterns
3. Test path known — TDD or existing test suite identified
4. Acceptance criteria written
5. Allura reflection written after completion
```

---

### 2. Sister Agent Pattern (CROSS-TEAM LEARNING)

Each TALON/IRIS agent has a named counterpart in the other team:

| TALON Agent | Sister Agent | Relationship |
|------------|-------------|--------------|
| Lens (code-reviewer) | RAM Fowler | Fowler refactors in CLI, Lens verifies in OpenClaw |
| Probe (api-tester) | RAM Bellard | Bellard finds perf issues, Probe verifies contracts |
| Guardian (deploy) | RAM Hightower | Hightower builds pipeline, Guardian gates release |
| QA (qa-tester) | Durham Munari | Munari crafts quality, QA verifies it |
| Brand (brand-designer) | Durham Glaser/Aaker | Durham designs, Brand verifies tokens |
| Flow (ux-researcher) | Durham Scout | Scout onboards, Flow verifies journey |
| Voice (copywriter) | Durham Ogilvy | Ogilvy crafts copy, Voice verifies clarity |

**Why it matters:** Cross-runtime verification. One agent does the work, the sister agent independently verifies from a different perspective. This catches drift that a single agent misses.

**Adopt for:** Pair RAM and Durham agents as sisters. When RAM builds, Durham verifies. When Durham designs, RAM checks feasibility.

**Proposed sister pairs:**
| RAM Agent | Durham Sister | Verification |
|----------|--------------|-------------|
| Brooks | Kotler | Architecture ↔ Strategy alignment |
| Woz | Glaser | Implementation ↔ Visual fidelity |
| Pike | Munari | Interface ergonomics ↔ Brand compliance |
| Fowler | Rand | Refactor safety ↔ Identity preservation |
| Bellard | Tufte | Diagnostics ↔ Data evidence |
| Carmack | Aaker | Performance ↔ User perception |
| Hightower | Ogilvy | Deploy ↔ Copy/voice integrity |
| Knuth | Munari | Data truth ↔ Quality gate |
| Scout | Scout | Shared recon (already paired) |

---

### 3. Explicit Input/Output Contracts

Every TALON/IRIS agent defines exactly what it accepts and produces:

```
## Input Contract
diff or PR, review layer, source docs when not blind

## Output Contract
findings, severity, category, evidence, clean/blocked verdict
```

**Why it matters:** When you dispatch an agent, you know exactly what to give it and what you'll get back. No ambiguity. RAM agents currently take "a task" and produce "work" — too loose.

**Adopt for:** Every RAM and Durham agent should have explicit input/output contracts.

---

### 4. Required Evidence

Each agent specifies what evidence must be produced:

```
## Required Evidence
changed files, line refs, tests reviewed, risk notes
```

```
## Required Evidence
browser/screenshot evidence, repro steps, accessibility notes, regression check output
```

**Why it matters:** "Done" is not done without evidence. This is the verification-before-completion principle baked into the agent definition.

**Adopt for:** Every agent should list what evidence proves their work is complete.

---

### 5. Escalation Triggers

Clear conditions for when to stop and escalate:

```
## Escalation Triggers
failed review layer, security issue, architecture drift
```

```
## Escalation Triggers
blocking bug, missing acceptance criteria, accessibility failure
```

**Why it matters:** Agents know when to stop and ask for help instead of pushing through a problem they shouldn't solve alone.

**Adopt for:** Every agent should have 3-5 escalation triggers.

---

### 6. Two-Tier Permission Model

```
## Forbidden Actions
mutating files during blind review, deploy, merge PRs

## Approval Required
applying patches, security exception
```

**Why it matters:** Not all restrictions are equal. "Forbidden" means never do this. "Approval required" means you can do it but must ask first. This is more nuanced than a single "don't do X" list.

**Adopt for:** Replace RAM/Durham's current "don't do" lists with this two-tier model.

---

### 7. Allura Memory Protocol (STANDARDIZED)

Every TALON/IRIS agent has the same memory discipline block:

```
## Allura Memory Protocol
- group_id: "allura-system"
- user_id: <canonical manifest ID>
- Before action: search Allura for context
- After action: log findings, routing, decisions
- Sister lessons: search sister agent's user_id for patterns
- No memory promotion without HITL — Curator → Auditor approval required
```

**Why it matters:** Memory discipline is baked into the agent definition, not an afterthought. The "sister lessons" search is particularly powerful — agents learn from their counterparts' past experiences.

**Adopt for:** Every agent across all teams. Standardize this block.

---

### 8. Anti-Patterns List

Explicit "don't do this" list:

```
## Anti-Patterns
- ❌ Acting without gates — every gate must pass
- ❌ Skipping Allura search — memory before action
- ❌ Self-promoting memory — HITL required for promotion
- ❌ Ignoring sister agent lessons — shared domain, shared learning
- ❌ Using short names — always use canonical manifest IDs
```

**Why it matters:** Stating what NOT to do is as important as stating what TO do. Agents need guardrails.

**Adopt for:** Every agent. Standardize the 5 anti-patterns above, then add role-specific ones.

---

### 9. Codename Pattern

Each agent has a one-word codename that captures their essence:

| Agent | Codename | Tagline |
|-------|----------|---------|
| talon-code-reviewer | **Lens** | "Lens sees what you missed" |
| talon-test-writer | **Test** | "Tests prove the path, not the code" |
| talon-api-tester | **Probe** | "Probe tests contracts, not just endpoints" |
| talon-deploy-guardian | **Guardian** | "Guardian gates — no unverified deploys" |
| iris-qa-tester | **QA** | "QA verifies before shipping" |
| iris-brand-designer | **Brand** | "Brand builds the visual system" |
| iris-ux-researcher | **Flow** | "Flow finds friction before users do" |
| iris-copywriter | **Voice** | "Voice writes what users read" |

**Why it matters:** A codename makes the agent's role instantly memorable. The tagline is a one-sentence mission statement that guides behavior.

**Adopt for:** Give every RAM and Durham agent a codename and tagline.

**Proposed for RAM:**
| Agent | Codename | Tagline |
|-------|----------|---------|
| Brooks | **Architect** | "Architect keeps the castle standing" |
| Jobs | **Gate** | "Gate kills scope before scope kills you" |
| Woz | **Builder** | "Builder ships working code" |
| Scout | **Recon** | "Recon maps the terrain before anyone moves" |
| Bellard | **Diag** | "Diag finds the root, not the symptom" |
| Carmack | **Speed** | "Speed serves the user, not the benchmark" |
| Pike | **Surface** | "Surface minimizes what users must learn" |
| Fowler | **Refactor** | "Refactor keeps change reversible" |
| Knuth | **Truth** | "Truth is non-negotiable" |
| Hightower | **Deploy** | "Deploy or it didn't happen" |

**Proposed for Durham:**
| Agent | Codename | Tagline |
|-------|----------|---------|
| Kotler | **Market** | "Market connects value to need" |
| Aaker | **Position** | "Position owns the space in the mind" |
| Glaser | **Visual** | "Visual makes the invisible visible" |
| Ogilvy | **Words** | "Words sell without shouting" |
| Rand | **Identity** | "Identity makes it recognizable" |
| Munari | **Craft** | "Craft is in the details you don't notice" |
| Tufte | **Evidence** | "Evidence shows the truth in the data" |

---

## What NOT to Adopt

1. **Don't copy the OpenClaw-specific tool lists** — RAM/Durham run on OpenCode/Claude Code, not OpenClaw. Tool lists should match the runtime.

2. **Don't copy the `allura_brain_group_id: allura-system` frontmatter** — Bahari uses the user's group_id, not allura-system. RAM uses allura-system. Durham uses allura-team-durham. The group_id discipline is good, but the value varies by agent.

3. **Don't create 17 new agents** — The lesson is about patterns, not headcount. Fewer interfaces, stronger contracts.

---

## Implementation Plan

### Phase 1: Pilot with 3 RAM agents (1 week)
Update Brooks, Woz, and Scout with:
- Codename + tagline
- Gates (MUST pass before action)
- Input/Output contracts
- Required evidence
- Sister agent pairing
- Two-tier permission model
- Anti-patterns list

### Phase 2: Roll out to all RAM + Durham (2 weeks)
Apply the pattern to the remaining 8 RAM agents and 7 Durham agents.

### Phase 3: Bahari + Sarah Boone (1 week)
Adapt the pattern for personal assistants — lighter gates, but same memory discipline and evidence contracts.

### Phase 4: Validate
Run one sprint with the updated agents. Measure: fewer "I started without context" failures, fewer "I don't know what to produce" ambiguities, faster sister-agent verification.