---
description: "Quick slash commands for the Team RAM OpenCode Harness"
allowed-tools: ["Read", "Grep", "Bash"]
---

# Quick Slash Commands

Type these directly in your IDE for fast access to common Team RAM harness workflows.

## Session Commands

| Command | Action | Equivalent |
| --- | --- | --- |
| `/start` | Start session | `start-session` |
| `/end <summary>` | End session | `end-session` |
| `/dash` | Harness status | `dashboard` |

## Task Commands

| Command | Action | Equivalent |
| --- | --- | --- |
| `/task <desc>` | Create or shape a task | `task-creator` |
| `/promote` | Human-in-the-loop promotion | `curator-team-promote` |
| `/review` | Code review workflow | `code-review` |

## Memory and Coordination Commands

| Command | Action | Equivalent |
| --- | --- | --- |
| `/query <term>` | Search memory (Allura Brain, if enabled) | `query` |
| `/update <target>` | Log a short update | `quick-update` |
| `/party <task>` | Parallel specialist collaboration | `party-mode` |
| `/intent-gate <request>` | Classify intent before routing | `intent-gate` |
| `/ultra <request>` | Bounded work-until-done execution | `ultra` |
| `/ulw <request>` | Governed ultrawork execution | `ulw` |
| `/ulw-loop <request> [--max-iterations N]` | Bounded Ralph Loop execution | `ulw-loop` |
| `/ralph <mode>` | Legacy `Ralph Wiggum` entrypoint (legacy alias) | `ralph` |

## Vertical Brooks Menu

```text
WS      Status
ST      Start
CH      Chat
DG      Define Goal
SK      Skill Create
VA      Validate Architecture
CA      Create Architecture
NX      Next Steps
NX→R    Ralph Loop
NX→S    Structure Intent
PM      Party Mode
GO      Execute
DA      Exit
MH      Menu
```

`NX→R` means Ralph Loop execution path. If only drafting a command, label it **Ralph Preview**.

## Team RAM Agent Shortcuts

| Shortcut | Agent | Role |
| --- | --- | --- |
| `@brooks` | Brooks | Architecture and orchestration |
| `@jobs` | Jobs | Intent and scope |
| `@woz` | Woz | Implementation |
| `@scout` | Scout | Discovery |
| `@pike` | Pike | Interface review |
| `@fowler` | Fowler | Refactor gate |
| `@bellard` | Bellard | Diagnostics |
| `@carmack` | Carmack | Performance |
| `@knuth` | Knuth | Data architecture |
| `@hightower` | Hightower | Infra and deployment |

## Usage Examples

### Start a Session

```text
/start
```

Hydrates context, checks readiness, and prepares tools.

### Create a Task

```text
/task Add OAuth2 authentication with Google provider
```

Creates a structured starting point for implementation.

### Launch Parallel Review or Build Support

```text
/party Investigate flaky integration tests and propose fixes
```

Uses multiple specialists when the task benefits from parallel viewpoints.

### Log Progress

```text
/update progress Added OAuth2 callback validation and tests
```

Records a concise progress update. If Allura Brain is enabled, this also supports persistent session memory.

### Query Prior Context

```text
/query authentication patterns
```

Searches memory for relevant prior fixes, decisions, and patterns. Requires Allura Brain or another memory backend.

### Run a Review

```text
/review
```

Runs the review workflow using the appropriate skill and specialist path.

---

Allura Brain integration is optional here: useful for persistent coding context, but not required for the harness to be valid.
