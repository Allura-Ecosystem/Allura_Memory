import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CANONICAL_ROLES = [
  "brooks",
  "jobs",
  "woz",
  "bellard",
  "carmack",
  "scout",
  "pike",
  "fowler",
  "knuth",
  "hightower",
].sort();

export const ORDINARY_WORKFLOW_SURFACES = [
  ".agents/TEAM-RAM-RUNTIME.md",
  ".opencode/agent/core/brooks.md",
  ".opencode/agent/subagents/core/scout.md",
  ".claude/agents/brooks.md",
  ".claude/agents/scout.md",
  ".codex/agents/brooks.toml",
  ".codex/agents/scout.toml",
  ".opencode/skills/allura-memory-skill/SKILL.md",
  ".opencode/skills/allura-team-ram/SKILL.md",
  ".opencode/skills/allura-code-review/SKILL.md",
  ".opencode/skills/allura-dev-story/SKILL.md",
  ".opencode/skills/allura-architecture/SKILL.md",
  ".opencode/skills/allura-product-intake/SKILL.md",
  ".opencode/skills/allura-retrospective/SKILL.md",
  ".opencode/skills/allura-design/SKILL.md",
  ".opencode/skills/brainstorming/SKILL.md",
  ".opencode/skills/systematic-debugging-memory/SKILL.md",
  ".opencode/skills/notion-dreaming-governance/SKILL.md",
  ".opencode/skills/team-ram-cowork/SKILL.md",
  ".opencode/skills/roundtable/SKILL.md",
  ".opencode/skills/party-mode/SKILL.md",
  ".opencode/skills/allura-menu/SKILL.md",
  ".opencode/skills/multi-search/SKILL.md",
];

const TENANT_CONTRACT_SURFACES = [
  ".agents/TEAM-RAM-RUNTIME.md",
  ".opencode/agent/core/brooks.md",
  ".claude/agents/brooks.md",
  ".codex/agents/brooks.toml",
  ".opencode/skills/allura-memory-skill/SKILL.md",
];

const HYDRATION_SURFACES = [
  ".opencode/agent/core/brooks.md",
  ".opencode/agent/subagents/core/scout.md",
  ".agents/TEAM-RAM-RUNTIME.md",
  ".claude/agents/brooks.md",
  ".claude/agents/scout.md",
  ".codex/agents/brooks.toml",
  ".codex/agents/scout.toml",
];

const ORDINARY_MEMORY_TOOLS = [
  "allura-brain_memory_add",
  "allura-brain_memory_get",
  "allura-brain_memory_list",
  "allura-brain_memory_search",
].sort();

const UNSUPPORTED_METADATA_KEYS =
  /\b(?:confidence|workflow|type|project|step|event_type|story_id|validation)\s*:/i;

function isNegated(content: string, index: number): boolean {
  const prefix = content.slice(Math.max(0, index - 120), index);
  const clause = prefix.split(/[.!?\n]/).at(-1) ?? "";
  return /\b(?:never|do not|must not|cannot|can't|no)\b[^.!?\n]*$/i.test(clause);
}

export function parseAllowedTools(content: string): string[] {
  const line = content.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
  return line
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
    .sort();
}

export function analyzeGovernanceSurface(content: string): string[] {
  const issues: string[] = [];

  if (/\buser_id\s*[:=]\s*(["'`])[^"'\n`]+\1/i.test(content)) {
    issues.push("quoted literal user_id");
  }

  for (const match of content.matchAll(/\bmetadata\s*:\s*\{([^}]*)\}/gi)) {
    if (UNSUPPORTED_METADATA_KEYS.test(match[1])) {
      issues.push("unsupported memory_add metadata");
      break;
    }
  }

  const unsafeCall =
    /\b(?:MCP_DOCKER_(?:execute_sql|insert_data)|(?:allura-brain|allura_brain)(?:__|_)?memory_promote)\s*\(/gi;
  for (const match of content.matchAll(unsafeCall)) {
    if (!isNegated(content, match.index ?? 0)) {
      issues.push("unsafe ordinary tool call");
      break;
    }
  }

  const directStorage =
    /\b(?:create|write|insert|update)\s+(?:an?\s+)?(?:SUPERSEDES\b|directly\s+(?:to|in)\s+(?:Neo4j|PostgreSQL|event tables?|graph storage))/gi;
  for (const match of content.matchAll(directStorage)) {
    if (!isNegated(content, match.index ?? 0)) {
      issues.push("direct storage imperative");
      break;
    }
  }

  return issues;
}

export function analyzeCodexGovernance(repoRoot = process.cwd()): string[] {
  const failures: string[] = [];

  function readRequired(file: string): string {
    const path = join(repoRoot, file);
    if (!existsSync(path)) {
      failures.push(`${file}: missing authoritative surface`);
      return "";
    }
    return readFileSync(path, "utf8");
  }

  function requirePattern(file: string, label: string, pattern: RegExp): void {
    const content = readRequired(file);
    if (content && !pattern.test(content)) failures.push(`${file}: missing ${label}`);
  }

  requirePattern("AGENTS.md", "Codex invocation gate", /Codex Invocation Gate \(MANDATORY\)/);
  requirePattern(".opencode/AGENTS.md", "Codex invocation gate mirror", /Codex Invocation Gate \(MANDATORY\)/);
  requirePattern(".opencode/skills/team-ram-cowork/SKILL.md", "non-mutating Quick boundary", /\*\*Quick\*\*[\s\S]{0,240}non-mutating/i);
  requirePattern(".opencode/skills/team-ram-cowork/SKILL.md", "honest Scout fallback", /Scout-style hydration only/);
  requirePattern(".opencode/skills/team-ram-cowork/SKILL.md", "Durham handoff", /Team Durham handoff/i);
  requirePattern(".opencode/skills/multi-search/SKILL.md", "Tavily current-research boundary", /Tavily[^\n]*(?:only general-current-web|only)/i);
  requirePattern(".opencode/skills/roundtable/SKILL.md", "native Codex dispatch", /host-native Codex subagent/i);
  requirePattern(".opencode/skills/party-mode/SKILL.md", "one writer ownership", /one writer owner per file or module/i);
  requirePattern(".agents/TEAM-RAM-RUNTIME.md", "ten-role runtime contract", /canonical ten-role team/i);
  requirePattern(".agents/TEAM-RAM-RUNTIME.md", "active allura-system tenant", /allura-system[^\n]*active repository tenant/i);
  requirePattern(".opencode/skills/allura-memory-skill/SKILL.md", "transport-owned identity", /authenticated transport owns the persisted user identity/i);

  for (const file of ORDINARY_WORKFLOW_SURFACES) {
    for (const issue of analyzeGovernanceSurface(readRequired(file))) {
      failures.push(`${file}: ${issue}`);
    }
  }

  const safeRetirement = /retired|legacy|deprecated|never[^\n]*use|must not[^\n]*use|do not use/i;
  for (const file of TENANT_CONTRACT_SURFACES) {
    const lines = readRequired(file).split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" ");
      if (/allura-(?:team-ram|roninmemory)/i.test(line) && !safeRetirement.test(context)) {
        failures.push(`${file}:${index + 1}: retired tenant appears as active-use wording`);
      }
    }
  }

  const hydrationDrift =
    /DUAL-PASS|No Flat-File Fallback|no flat-file reads|Search the brain first|Brain context comes first|audit_health_report|audit_query_events|limit:\s*10|Do not derive project state from flat files/i;
  for (const file of HYDRATION_SURFACES) {
    const content = readRequired(file);
    if (!/local (?:repository|evidence|context)/i.test(content)) {
      failures.push(`${file}: hydration omits local evidence`);
    }
    if (!/one focused[\s\S]{0,160}(?:Brain )?`?memory_search`?/i.test(content)) {
      failures.push(`${file}: hydration does not declare one focused Brain query`);
    }
    if (!/limit:\s*5/i.test(content)) {
      failures.push(`${file}: focused Brain query does not default to limit 5`);
    }
    if (hydrationDrift.test(content)) {
      failures.push(`${file}: contains always-on multi-pass hydration drift`);
    }
  }

  const memorySkill = readRequired(".opencode/skills/allura-memory-skill/SKILL.md");
  const allowedTools = parseAllowedTools(memorySkill);
  if (JSON.stringify(allowedTools) !== JSON.stringify(ORDINARY_MEMORY_TOOLS)) {
    failures.push(
      `.opencode/skills/allura-memory-skill/SKILL.md: ordinary allowed-tools must be ${ORDINARY_MEMORY_TOOLS.join(", ")}`,
    );
  }

  const runtime = readRequired(".agents/TEAM-RAM-RUNTIME.md").toLowerCase();
  for (const role of CANONICAL_ROLES) {
    if (!runtime.includes(role)) {
      failures.push(`.agents/TEAM-RAM-RUNTIME.md: missing canonical role ${role}`);
    }
  }

  const modelMapPath = join(repoRoot, "tooling/agent-sync/models.map.json");
  if (!existsSync(modelMapPath)) {
    failures.push("tooling/agent-sync/models.map.json: missing canonical roster map");
  } else {
    const parsed = JSON.parse(readFileSync(modelMapPath, "utf8")) as {
      agents?: Record<string, unknown>;
    };
    const actual = Object.keys(parsed.agents ?? {}).sort();
    if (JSON.stringify(actual) !== JSON.stringify(CANONICAL_ROLES)) {
      failures.push(
        `tooling/agent-sync/models.map.json: expected ${CANONICAL_ROLES.join(", ")}; received ${actual.join(", ")}`,
      );
    }
  }

  for (const [adapter, source] of [
    [".codex/agents/brooks.toml", ".opencode/agent/core/brooks.md"],
    [".codex/agents/scout.toml", ".opencode/agent/subagents/core/scout.md"],
  ] as const) {
    if (!readRequired(adapter).includes(source)) {
      failures.push(`${adapter}: missing canonical source attribution`);
    }
  }

  return [...new Set(failures)];
}

if (import.meta.main) {
  const failures = analyzeCodexGovernance();
  if (failures.length > 0) {
    console.error("Codex governance gate validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Codex governance gate validation passed.");
}
