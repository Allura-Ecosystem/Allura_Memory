import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  analyzeGovernanceSurface,
  ORDINARY_WORKFLOW_SURFACES,
  parseAllowedTools,
} from "../../scripts/validate-codex-governance-gate";

const root = process.cwd();
const roles = [
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

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Team RAM Codex experience", () => {
  test("keeps the canonical ten-role roster in map and runtime", () => {
    const modelMap = JSON.parse(read("tooling/agent-sync/models.map.json")) as {
      agents: Record<string, unknown>;
    };
    expect(Object.keys(modelMap.agents).sort()).toEqual(roles);

    const runtime = read(".agents/TEAM-RAM-RUNTIME.md");
    expect(runtime).toMatch(/canonical ten-role team/i);
    for (const role of roles) expect(runtime.toLowerCase()).toContain(role);
    expect(runtime).toMatch(/Scout is a utility recon role/i);
    expect(runtime).toMatch(/Ralph is a bounded validation loop, not an agent/i);
  });

  test("keeps Quick non-mutating and implementation Scout-first", () => {
    const cowork = read(".opencode/skills/team-ram-cowork/SKILL.md");
    const quick = cowork.match(/\*\*Quick\*\*[\s\S]*?(?=\n\d+\. \*\*Allura task\*\*)/)?.[0] ?? "";

    expect(quick).toMatch(/non-mutating/i);
    expect(quick).toMatch(/no[\s\S]*(?:implementation|external-state change)/i);
    expect(cowork).toMatch(/implementation[\s\S]{0,100}Scout-first/i);
    expect(cowork).toContain("Scout-style hydration only");
  });

  test("uses real native collaboration and bounded research", () => {
    const cowork = read(".opencode/skills/team-ram-cowork/SKILL.md");
    const roundtable = read(".opencode/skills/roundtable/SKILL.md");
    const party = read(".opencode/skills/party-mode/SKILL.md");
    const search = read(".opencode/skills/multi-search/SKILL.md");

    expect(roundtable).toMatch(/host-native Codex subagent/i);
    expect(roundtable).toMatch(/Brooks synthesizes the final decision/i);
    expect(party).toMatch(/one writer owner per file or module/i);
    expect(cowork).toMatch(/Team Durham handoff/i);
    expect(search).toMatch(/local files and `rg`/i);
    expect(search).toMatch(/Tavily[^\n]*only general-current-web/i);
    expect(search).not.toContain("Perplexica");
    expect(`${cowork}\n${search}`).not.toMatch(/(?:bun add|npm install|npx)\s+ruflo/i);
  });

  test("ordinary surfaces satisfy the pure semantic analyzer", () => {
    for (const surface of ORDINARY_WORKFLOW_SURFACES) {
      expect(analyzeGovernanceSurface(read(surface)), surface).toEqual([]);
    }

    const memory = read(".opencode/skills/allura-memory-skill/SKILL.md");
    expect(memory).toMatch(/authenticated transport owns the persisted user identity/i);
    expect(memory).toMatch(/metadata\.agent_id/i);
  });

  test("treats old tenants as retired wherever the tenant contract names them", () => {
    const files = [
      ".agents/TEAM-RAM-RUNTIME.md",
      ".opencode/agent/core/brooks.md",
      ".claude/agents/brooks.md",
      ".codex/agents/brooks.toml",
      ".opencode/skills/allura-memory-skill/SKILL.md",
    ];
    const safe = /retired|legacy|deprecated|never[^\n]*use|must not[^\n]*use|do not use/i;

    for (const file of files) {
      const lines = read(file).split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (/allura-(?:team-ram|roninmemory)/i.test(line)) {
          const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" ");
          expect(context, file).toMatch(safe);
        }
      }
    }

    expect(read(".agents/TEAM-RAM-RUNTIME.md")).toMatch(/allura-system[^\n]*active repository tenant/i);
  });

  test("ordinary workflows cannot use raw SQL, direct graph writes, or self-promote", () => {
    expect(read(".opencode/skills/systematic-debugging-memory/SKILL.md")).toMatch(
      /human-governed promotion workflow/i,
    );
  });

  test("semantic analyzer rejects calls and literals without false positives", () => {
    expect(analyzeGovernanceSurface("allura-brain_memory_promote({ id: 'x' })")).toContain(
      "unsafe ordinary tool call",
    );
    expect(
      analyzeGovernanceSurface("Never call allura-brain_memory_promote({ id: 'x' }) here."),
    ).toEqual([]);
    expect(analyzeGovernanceSurface('memory_add({ user_id: "brooks-chief" })')).toContain(
      "quoted literal user_id",
    );
    expect(analyzeGovernanceSurface('user_id = "arbitrary-persona"')).toContain(
      "quoted literal user_id",
    );
    expect(
      analyzeGovernanceSurface(
        'memory_add({ metadata: { source: "conversation", confidence: 0.9 } })',
      ),
    ).toContain("unsupported memory_add metadata");
    expect(
      analyzeGovernanceSurface(
        'memory_add({ metadata: { source: "conversation" } })\nvalidation: passed',
      ),
    ).toEqual([]);
  });

  test("ordinary memory skill exposes only read and outcome tools", () => {
    const tools = parseAllowedTools(read(".opencode/skills/allura-memory-skill/SKILL.md"));

    expect(tools).toEqual(
      [
        "allura-brain_memory_add",
        "allura-brain_memory_search",
        "allura-brain_memory_get",
        "allura-brain_memory_list",
      ].sort(),
    );
    expect(tools.join(" ")).not.toMatch(/update|delete|promote|export|restore|list_deleted/);
  });

  test("canonical hydration defaults to local evidence plus one focused query", () => {
    for (const surface of [
      ".opencode/agent/core/brooks.md",
      ".opencode/agent/subagents/core/scout.md",
      ".agents/TEAM-RAM-RUNTIME.md",
      ".claude/agents/brooks.md",
      ".claude/agents/scout.md",
      ".codex/agents/brooks.toml",
      ".codex/agents/scout.toml",
    ]) {
      const content = read(surface);
      expect(content, surface).toMatch(/local (?:repository|evidence|context)/i);
      expect(content, surface).toMatch(/one focused[\s\S]{0,160}(?:Brain )?`?memory_search`?/i);
      expect(content, surface).toMatch(/limit:\s*5/i);
      expect(content, surface).not.toMatch(
        /DUAL-PASS|No Flat-File Fallback|no flat-file reads|Search the brain first|Brain context comes first|audit_health_report|audit_query_events|limit:\s*10|Do not derive project state from flat files/i,
      );
    }

    const runtime = read(".agents/TEAM-RAM-RUNTIME.md");
    const defaultWrite = runtime.match(/memory_add\(\{[\s\S]*?\n\}\)/)?.[0] ?? "";
    expect(defaultWrite).toMatch(/metadata:\s*\{\s*source:\s*"conversation"\s*\}/i);
    expect(defaultWrite).not.toMatch(/agent_id/i);
  });

  test("validator enforces semantic surfaces instead of retired files", () => {
    const validator = read("scripts/validate-codex-governance-gate.ts");

    expect(validator).toContain("analyzeGovernanceSurface");
    expect(validator).toContain("ORDINARY_WORKFLOW_SURFACES");
    expect(validator).toContain("parseAllowedTools");
    expect(validator).toContain("import.meta.main");
    expect(validator).not.toContain("AGENTS.override.md");
    expect(validator).not.toContain(".codex/config.toml");
  });
});
