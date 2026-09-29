---
name: multi-search
description: Comprehensive multi-source research skill coordinating five intelligence sources — Context7 (official docs), prompts.chat (AI instruction patterns), grep-mcp (real GitHub code), Perplexica (self-hosted AI search), and local grep (our codebase). Use this skill when you need to answer complex technical questions, research libraries/frameworks, find implementation patterns, or gather information from multiple sources to solve problems. Automatically orchestrates all five sources with correct tool names and intake-only policy for prompts.chat.
---

# Multi-Search — Five-Source Intelligence Orchestration

## Overview

This skill coordinates **five complementary intelligence sources** to build complete answers from every angle. No single source covers every need — together they form a comprehensive research toolkit.

| Source           | Answers                                       | Analogy                            |
| ---------------- | --------------------------------------------- | ---------------------------------- |
| **Context7**     | "What does the API officially say?"           | The reference manual               |
| **prompts.chat** | "How do people instruct AI to do X?"          | The cookbook of agent recipes      |
| **grep-mcp**     | "How do people actually code X?"              | The corpus of real implementations |
| **Perplexica**   | "What's the current best practice right now?" | The live knowledge feed (self-hosted) |
| **Local grep**   | "How did WE implement this?"                  | Our own mirror                     |

**The triad** (Context7 + prompts.chat + grep-mcp) covers canonical docs, AI patterns, and real code. **Perplexica** fills gaps for current events and recent best practices (self-hosted, no API key). **Local grep** keeps us honest about our own codebase.

## When to Use This Skill

Use multi-search when:

- **One source isn't enough** — you need docs + examples + community knowledge
- **Researching libraries/frameworks** — official API + real usage + current best practices
- **Solving implementation problems** — see how others solved it, then verify against docs
- **Understanding APIs** — canonical reference + community patterns + working code
- **Finding patterns in our codebase** — local grep first, then external validation
- **Designing agent instructions** — prompts.chat for patterns, improve locally
- **Debugging** — local code + Perplexica for solutions + docs for correctness

Use **manual tool selection** when:

- You know exactly which source you need (e.g., just Context7 for an API signature)
- Rate limit conservation matters (manual selection uses fewer API calls)
- You need precise control over query parameters

## Priority Matrix

Pick the right source for the job. Fall back to others when the primary is insufficient.

| Info Need              | Context7   | prompts.chat | grep-mcp   | Perplexica | Local grep |
| ---------------------- | ---------- | ------------ | ---------- | ---------- | ---------- |
| Official API           | ✅ Primary | —            | —          | Fallback   | —          |
| AI agent instructions  | —          | ✅ Primary   | —          | Fallback   | —          |
| Real code examples     | —          | —            | ✅ Primary | Fallback   | Fallback   |
| Current best practices | Fallback   | Fallback     | Fallback   | ✅ Primary | —          |
| Library/Framework docs | ✅ Primary | —            | grep-mcp   | Fallback   | —          |
| Debugging solutions    | —          | —            | grep-mcp   | ✅ Primary | Fallback   |
| Pattern discovery      | grep-mcp   | Context7     | —          | Perplexica | ✅ Primary |
| Prompt engineering     | —          | ✅ Primary   | —          | —          | —          |
| Our own codebase       | —          | —            | —          | —          | ✅ Primary |
| Community knowledge    | —          | ✅ Primary   | —          | Fallback   | —          |

**Reading the matrix:** Row = what you need. Cell = which tool to use. `✅ Primary` = go here first. Named tool = strong secondary. `Fallback` = use if primary is empty.

## Core Workflow

### Step 1: Analyze the Query

Determine what information is needed:

- **Library/Framework docs** → Context7 (primary), grep-mcp (secondary)
- **AI instruction patterns** → prompts.chat (primary)
- **Real code examples** → grep-mcp (primary), local grep (our code)
- **Current best practices** → Perplexica (primary)
- **Our implementation** → local grep (primary)
- **Debugging** → local grep + Perplexica + Context7 + grep-mcp

### Step 2: Pick Sources from Matrix

Select 2–4 sources based on the priority matrix. Don't use all five unless the question truly spans every domain.

### Step 3: Execute in Parallel

Run independent searches simultaneously. Each source returns different perspectives:

```
# Parallel execution — all five sources at once (if needed)
MCP_DOCKER_resolve-library-id(libraryName="next.js")
prompts_chat_search_prompts(query="server actions", limit=10)
grep-mcp_grep_query(query="useServer.*export", language="TypeScript")
MCP_DOCKER_perplexica_search(query="Next.js server actions best practices 2025")
# Local grep runs natively against our codebase
```

### Step 4: Synthesize

Combine findings into a coherent answer:

1. **Start with Context7** for canonical API definitions
2. **Layer prompts.chat** for established AI instruction patterns
3. **Validate with grep-mcp** for real-world working implementations
4. **Ground with Perplexica** for current best practices and recent changes
5. **Check local grep** for our own implementation patterns

When sources agree → high confidence. When they disagree → investigate the gap (usually where bugs or deprecated patterns hide).

## Intake-Only Policy: prompts.chat

**prompts.chat is CONSUME ONLY.** Allura takes prompts and skills FROM prompts.chat. We NEVER publish TO prompts.chat.

### What this means:

| Action                 | Tool                                  | Status                |
| ---------------------- | ------------------------------------- | --------------------- |
| Search prompts         | `prompts_chat_search_prompts`         | ✅ USE                |
| Get prompt details     | `prompts_chat_get_prompt`             | ✅ USE                |
| Search skills          | `prompts_chat_search_skills`          | ✅ USE                |
| Get skill details      | `prompts_chat_get_skill`              | ✅ USE                |
| Improve prompt         | `prompts_chat_improve_prompt`         | ✅ USE (save locally) |
| Save prompt            | `prompts_chat_save_prompt`            | ❌ NEVER              |
| Save skill             | `prompts_chat_save_skill`             | ❌ NEVER              |
| Add file to skill      | `prompts_chat_add_file_to_skill`      | ❌ NEVER              |
| Update skill file      | `prompts_chat_update_skill_file`      | ❌ NEVER              |
| Remove file from skill | `prompts_chat_remove_file_from_skill` | ❌ NEVER              |

### Why?

We are a consumer, not a publisher, on prompts.chat. Our internal prompts and skills live in `.opencode/skills/` and `.opencode/agent/` under our own version control. Publishing to prompts.chat would create an external dependency and a synchronization problem.

### How to use `improve_prompt` correctly:

```
# Step 1: Improve a draft prompt (this is allowed — it's a transformation)
prompts_chat_improve_prompt(
  prompt="Review code for bugs",
  outputType="text",
  outputFormat="structured_json"
)

# Step 2: Save the IMPROVED result LOCALLY — NOT to prompts.chat
# Write to .opencode/skills/my-skill/SKILL.md or similar local file
```

## Search Strategies

### Strategy 1: Library Research

**Goal:** Understand a library or framework thoroughly before writing code.

**Pattern:** Context7 → grep-mcp → Perplexica

```
# Step 1: Get official docs (resolve first, then fetch)
MCP_DOCKER_resolve-library-id(libraryName="zustand")
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="/pmndrs/zustand",
  topic="persist middleware usage",
  tokens=5000
)

# Step 2: Find real implementations
grep-mcp_grep_query(query="persist.*create", language="TypeScript", repo="pmndrs/zustand")

# Step 3: Get current best practices
MCP_DOCKER_perplexica_search(query="Zustand persist middleware TypeScript best practices 2025")
```

### Strategy 2: Problem Solving

**Goal:** Find solutions to specific errors or problems.

**Pattern:** Perplexica → Context7 → grep-mcp → Local grep

```
# Step 1: Search for the error message and solutions
MCP_DOCKER_perplexica_search(query="TypeScript cannot find module moduleResolution bundler")

# Step 2: Check official docs for proper usage
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="/microsoft/typescript",
  topic="moduleResolution bundler vs nodeNext",
  tokens=3000
)

# Step 3: Find working implementations
grep-mcp_grep_query(query="moduleResolution", language="TypeScript", path="tsconfig.json")

# Step 4: Check our own codebase
# Use local grep tool: pattern="moduleResolution" path=/home/ronin704/Projects/allura memory/
```

### Strategy 3: Pattern Discovery

**Goal:** Find how to implement a specific pattern across multiple sources.

**Pattern:** grep-mcp → Context7 → Perplexica → Local grep

```
# Step 1: Search for the pattern in popular repos
grep-mcp_grep_query(query="try.*catch.*async function", language="TypeScript")

# Step 2: Understand the official way
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="/microsoft/typescript",
  topic="error handling async await patterns",
  tokens=3000
)

# Step 3: See variations and tradeoffs
MCP_DOCKER_perplexica_search(query="TypeScript error handling patterns 2025 best practices")

# Step 4: Check our own patterns
# Use local grep tool: pattern="catch" include="*.ts" path=/home/ronin704/Projects/allura memory/src/
```

### Strategy 4: Agent Instruction Design

**Goal:** Design, improve, or validate AI agent prompts and skills.

**Pattern:** prompts.chat → improve_prompt → save locally

```
# Step 1: Find existing patterns for inspiration (INTAKE ONLY)
prompts_chat_search_prompts(query="code review", limit=10)
prompts_chat_search_prompts(query="architecture review", category="development", limit=5)
prompts_chat_search_skills(query="debugging agent", limit=10)

# Step 2: Get specific prompt content for study
prompts_chat_get_prompt(id="interesting_prompt_id")

# Step 3: Improve our draft prompt (transformation — allowed)
prompts_chat_improve_prompt(
  prompt="Review the following code for bugs, security issues, and performance problems",
  outputType="text",
  outputFormat="structured_json"
)

# Step 4: Save the IMPROVED result LOCALLY — NOT to prompts.chat
# Write to .opencode/skills/ or .opencode/agent/ under git version control
```

### Strategy 5: Bug Investigation

**Goal:** Debug an error or unexpected behavior in our codebase.

**Pattern:** Local grep → Perplexica → Context7 → grep-mcp

```
# Step 1: Search our own codebase first
# Use local grep tool: pattern="ECONNREFUSED" path=/home/ronin704/Projects/allura memory/
# Use local grep tool: pattern="pool\.query.*group_id" include="*.ts"

# Step 2: Search for the error message online
MCP_DOCKER_perplexica_search(query="node-postgres pg Pool connection refused ECONNREFUSED TypeScript")

# Step 3: Check official API docs (resolve the library ID first)
MCP_DOCKER_resolve-library-id(libraryName="node-postgres")
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="<id from resolve-library-id>",
  topic="pool connection configuration error handling",
  tokens=3000
)

# Step 4: Find working implementations on GitHub
grep-mcp_grep_query(query="new Pool\\(.*connectionString", language="TypeScript")
```

## Team RAM Dispatch

Each agent has preferred intelligence sources based on their role. Use this map to decide which combination to invoke.

| Agent         | Context7                           | prompts.chat                  | grep-mcp                                | Perplexica                     | Local grep                  |
| ------------- | ---------------------------------- | ----------------------------- | --------------------------------------- | ------------------------------ | --------------------------- |
| **Brooks**    | Architecture docs before decisions | Intake arch review prompts    | Reference architectures in top repos    | Fallback for recent ADRs       | Existing ADRs and patterns  |
| **Woz**       | API signatures before writing code | Implementation templates      | Real code examples before building      | Fallback for deployment guides | Our existing implementation |
| **Scout**     | Fast library resolution            | Prompt/skill discovery        | Codebase scans for patterns             | Fallback for context gathering | Quick local searches        |
| **Bellard**   | Version-diff debugging             | Intake debug prompts          | Bug fix patterns in similar repos       | Error message searches         | Our bug history             |
| **Knuth**     | Schema/driver docs                 | Data modeling prompts         | Migration patterns, SQL examples        | Fallback for recent migrations | Our schema and migrations   |
| **Fowler**    | Deprecation detection              | Refactor instruction patterns | Before/after refactoring examples       | Refactoring best practices     | Our refactoring candidates  |
| **Pike**      | API surface validation             | API design skills             | Interface contract patterns             | API design trends              | Our interface definitions   |
| **Carmack**   | Optimization API docs              | Optimization prompt templates | Performance patterns in high-perf repos | Recent perf techniques         | Our hot paths               |
| **Hightower** | Infra tool docs                    | Deployment/CI skills          | Docker/K8s config patterns              | Recent infra changes           | Our Docker/CI configs       |
| **Jobs**      | —                                  | Validate gate prompts         | Scope management patterns               | —                              | Our scope definitions       |

## Tool Reference

### 1. Context7 — Official Library Documentation (via MCP_DOCKER)

Context7 provides version-locked, authoritative documentation from library maintainers. Always resolve the library ID first, then fetch docs.

#### MCP_DOCKER_resolve-library-id

Resolve a library name to a Context7-compatible ID. **Always call this first** — IDs follow `/org/project` format and are not always guessable.

```
MCP_DOCKER_resolve-library-id(libraryName="next.js")
# Returns: { id: "/vercel/next.js", trust: 10, snippets: 2306, ... }
```

**Parameters:**

- `libraryName` (string, required) — Library name to search for (e.g., "next.js", "zustand", "pgvector")

#### MCP_DOCKER_get-library-docs

Fetch documentation for a resolved library, optionally focused on a topic.

```
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="/vercel/next.js",
  topic="server actions",
  tokens=5000
)
```

**Parameters:**

- `context7CompatibleLibraryID` (string, required) — The ID from resolve-library-id, e.g., `/vercel/next.js`
- `topic` (string, optional) — Focus docs on this subject (e.g., `"middleware"`, `"server actions"`)
- `tokens` (number, optional) — Max tokens to return. Default 10000. Use 2000–5000 for focused queries, 10000+ for broad exploration.

### 2. prompts.chat — AI Instruction Patterns (native tools)

prompts.chat is a registry of prompts and skills for AI agents. **INTAKE ONLY** — we consume, never publish.

#### prompts_chat_search_prompts

Search for prompts by keyword, type, category, or tags.

```
prompts_chat_search_prompts(query="code review", limit=10)
prompts_chat_search_prompts(query="refactoring", category="development", limit=10)
prompts_chat_search_prompts(query="debugging", type="STRUCTURED", tag="agent")
```

**Parameters:**

- `query` (string, required) — Search query
- `limit` (number, optional) — Max results (default 10, max 50)
- `category` (string, optional) — Filter by category slug (e.g., "development")
- `tag` (string, optional) — Filter by tag slug
- `type` (string, optional) — Filter by type: TEXT, STRUCTURED, IMAGE, VIDEO, AUDIO

#### prompts_chat_get_prompt

Retrieve a specific prompt by ID. Optionally fill template variables.

```
prompts_chat_get_prompt(id="prompt_id")
prompts_chat_get_prompt(id="prompt_id", fill_variables=true)
```

**Parameters:**

- `id` (string, required) — The prompt ID from search results
- `fill_variables` (boolean, optional) — If true and the prompt has template variables, triggers interactive variable filling

#### prompts_chat_improve_prompt

Transform a basic prompt into a well-structured, comprehensive one using AI.

```
prompts_chat_improve_prompt(
  prompt="Review this code for bugs",
  outputType="text",
  outputFormat="structured_json"
)
```

**Parameters:**

- `prompt` (string, required) — The basic prompt to enhance
- `outputType` (string, optional) — Content type: "text", "image", "video", "sound"
- `outputFormat` (string, optional) — Response format: "text", "structured_json", "structured_yaml"

⚠️ **Save improved prompts locally** — never use `prompts_chat_save_prompt`.

#### prompts_chat_search_skills

Discover multi-file agent skill packages.

```
prompts_chat_search_skills(query="deployment", limit=10)
```

**Parameters:**

- `query` (string, required) — Search query
- `limit` (number, optional) — Max results (default 10, max 50)

#### prompts_chat_get_skill

Retrieve a full skill package by ID, including all files.

```
prompts_chat_get_skill(id="skill_id")
```

**Parameters:**

- `id` (string, required) — The skill ID from search results

#### ❌ NEVER USE — prompts.chat Write Operations

These tools exist but we NEVER invoke them:

- `prompts_chat_save_prompt` — ❌ Do not publish to prompts.chat
- `prompts_chat_save_skill` — ❌ Do not publish to prompts.chat
- `prompts_chat_add_file_to_skill` — ❌ Do not publish to prompts.chat
- `prompts_chat_update_skill_file` — ❌ Do not modify prompts.chat content
- `prompts_chat_remove_file_from_skill` — ❌ Do not modify prompts.chat content

### 3. grep-mcp — Real GitHub Code Search (native tool)

Search GitHub's public code corpus for real, working implementations.

#### grep-mcp_grep_query

```
grep-mcp_grep_query(query="SUPERSEDES", language="TypeScript")
grep-mcp_grep_query(query="createStore.*persist", repo="pmndrs/zustand")
grep-mcp_grep_query(query="middleware.*NextResponse", language="TypeScript", path="middleware.ts")
```

**Parameters:**

- `query` (string, required) — Search query. Literal strings and simple regex patterns.
- `language` (string, optional) — Filter by programming language (e.g., "TypeScript", "Python")
- `repo` (string, optional) — Filter to a specific repo in `owner/repo` format (e.g., "vercel/next.js")
- `path` (string, optional) — Filter by file path pattern (e.g., "src/lib/", "tsconfig.json")

**Tips:**

- Use specific code patterns, not natural language: `"useServer.*export"` not "how to use server actions"
- Combine with `repo` to narrow results: `"middleware"` in `vercel/next.js` is more useful than everywhere
- Always specify `language="TypeScript"` for Allura's stack to reduce noise
- `path` is powerful for config patterns: `path="tsconfig.json"` for TypeScript configs

### 4. Perplexica — Self-Hosted AI Search (via MCP_DOCKER)

Current information, tutorials, best practices, and anything too recent for Context7 or grep-mcp. Self-hosted on port 7722 — no API key required.

#### MCP_DOCKER_perplexica_search

```
MCP_DOCKER_perplexica_search(
  query="Next.js 15 server actions best practices 2025"
)
```

**Parameters:**

- `query` (string, required) — Search query
- Self-hosted via Vane backend with Ollama embeddings — no external API key needed
- Runs on port 7722 (HTTP MCP transport)

### 5. Local grep — Our Codebase Search (built-in tool)

Search our own codebase at `/home/ronin704/Projects/allura memory/`. Instant, no rate limits, codebase-specific.

#### Usage

Use the built-in `grep` tool to search file contents by regex pattern, or `glob` to find files by name pattern.

```
# Search for a pattern in our codebase
grep(pattern="SUPERSEDES", path="/home/ronin704/Projects/allura memory/src/")

# Find all TypeScript files matching a pattern
grep(pattern="group_id", include="*.ts", path="/home/ronin704/Projects/allura memory/src/")

# Find files by glob pattern
glob(pattern="**/*.test.ts", path="/home/ronin704/Projects/allura memory/src/")
```

**When to use local grep:**

- Before making changes — understand our current implementation
- During debugging — find where an error originates
- For consistency checks — verify patterns are used consistently
- Before grep-mcp — know what we have before searching externally

## Allura Libraries — Pre-Resolved Context7 IDs

These libraries are pre-resolved for Allura's stack. Use their IDs directly — no need to resolve again.

| Library       | Context7 ID                             | Trust | Snippets | Use For                                 |
| ------------- | --------------------------------------- | ----- | -------- | --------------------------------------- |
| Next.js       | `/vercel/next.js`                       | 10    | 2,306    | Server actions, App Router, middleware  |
| Zustand       | `/pmndrs/zustand`                       | 9.6   | 453      | State management patterns               |

**Usage example — fetch Next.js server-actions docs:**

```
MCP_DOCKER_get-library-docs(
  context7CompatibleLibraryID="/vercel/next.js",
  topic="server actions",
  tokens=5000
)
```

## Rate Limits & Quirks

### Context7

- **API key:** `CONTEXT7_API_KEY` is configured in `.env.local` — no manual setup needed.
- **Token budget:** Default 10000 tokens per query. Use `tokens` param to control cost vs. detail. 2000–5000 for focused queries; 10000+ for broad exploration.
- **Trust scores:** Libraries with trust ≥ 9 are production-grade. Those below may have incomplete or outdated docs.
- **Quirk:** Always call `MCP_DOCKER_resolve-library-id` first — IDs follow `/org/project` format and are not always guessable. Ambiguous names (e.g., "react" vs "react-native") require resolution.
- **Quirk:** When multiple libraries match, pick the one with the highest trust score and snippet count.

### prompts.chat

- **Rate limit:** Standard API rate limits apply. Batch operations rather than rapid-fire individual calls.
- **Quirk:** `search_prompts` and `search_skills` return metadata only. Use `get_prompt` or `get_skill` to retrieve full content.
- **Quirk:** `improve_prompt` is AI-powered and may take a few seconds — worth the wait for complex prompts.
- **INTAKE ONLY:** We consume from prompts.chat. We NEVER save, update, or publish to prompts.chat. Improved prompts are saved locally in `.opencode/skills/` or `.opencode/agent/`.

### grep-mcp

- **Rate limit:** ~10 requests per minute on the free tier. Target queries carefully rather than spraying broad ones. Use serial queries with spacing between them.
- **Quirk:** Returns a maximum of 10 results per query. Narrow with `language`, `repo`, and `path` filters to get the most relevant 10.
- **Quirk:** GitHub's index may lag up to 24 hours behind live repos. Brand-new code may not appear immediately.
- **Quirk:** No `useRegexp` parameter — the `query` field accepts both literal strings and regex patterns directly. Simple patterns work reliably; complex lookaheads may not.
- **Strategy:** Start with broad queries to discover patterns, then narrow with `repo` and `path` for specific implementations.

### Perplexica

- **Self-hosted** — runs on port 7722 via Vane backend with Ollama embeddings. No API key required.
- **Rate limit:** No external rate limit (self-hosted). Be respectful of the local instance.
- **Best for:** Current events, blog posts, tutorials, changelog entries, and anything too recent for Context7 or grep-mcp.

### Local grep

- **Rate limit:** None — instant, local search.
- **Scope:** Limited to `/home/ronin704/Projects/allura memory/` codebase only.
- **Best for:** Understanding our own implementation before making changes, debugging local issues, consistency checks.
- **Tip:** Always search locally before searching externally — know what we have before looking at what others have.

## Automated vs Manual

**Use multi-search (this skill) when:**

- Complex research questions spanning official docs, community knowledge, real code, and our own codebase
- You're unsure which source has the best answer
- You need a comprehensive answer synthesizing multiple perspectives
- You're following a strategy from the Search Strategies section above

**Use manual tool selection when:**

- You know exactly which source you need (e.g., just Context7 for an API signature)
- Rate limit conservation matters (manual selection uses fewer API calls)
- You need precise control over query parameters
- You're following the intelligence-sources dispatch map for a specific agent

**Quick reference for single-source lookups:**

| Need                  | Tool         | One-liner                                                                                                         |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Library API           | Context7     | `MCP_DOCKER_get-library-docs(context7CompatibleLibraryID="/vercel/next.js", topic="server actions", tokens=5000)` |
| AI prompt pattern     | prompts.chat | `prompts_chat_search_prompts(query="code review", limit=10)`                                                      |
| Real code example     | grep-mcp     | `grep-mcp_grep_query(query="useServer.*export", language="TypeScript")`                                           |
| Current best practice | Perplexica  | `MCP_DOCKER_perplexica_search(query="Next.js server actions best practices 2025")`                               |
| Our implementation    | Local grep   | `grep(pattern="server action", include="*.ts", path="src/")`                                                      |

## See Also

For detailed per-tool documentation, workflow patterns, and dispatch maps, see the **intelligence-sources** skill.
