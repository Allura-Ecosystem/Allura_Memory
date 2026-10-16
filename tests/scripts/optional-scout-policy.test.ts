import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
const map = JSON.parse(read("tooling/agent-sync/models.map.json")) as {
  agents: Record<string, { source: string }>;
};

describe("optional Scout routing contract", () => {
  test("all ten Team RAM personas remain registered, including optional Scout", () => {
    expect(Object.keys(map.agents).sort()).toEqual([
      "bellard", "brooks", "carmack", "fowler", "hightower", "jobs", "knuth", "pike", "scout", "woz",
    ]);
    const config = JSON.parse(read("opencode.json"));
    expect(config.agent.scout).toBeDefined();
    expect(config.agent.scout.disable).not.toBe(true);
  });

  test("each runtime adapter preserves the full canonical persona, not only its menu", () => {
    for (const [name, spec] of Object.entries(map.agents)) {
      const source = read(spec.source);
      const body = source.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)?.[1]?.trim();
      expect(body).toBeTruthy();
      expect(read(`.opencode/agents/${name}.md`)).toContain(body!);
      expect(read(`.claude/agents/${name}.md`)).toContain(body!);
      const raw = read(`.codex/agents/${name}.toml`).match(/^developer_instructions = (.+)$/m)?.[1];
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toContain(body!);
    }
  });

  test("Brooks uses governed outcomes without guessed identity or direct database logging", () => {
    const text = read(".opencode/agent/core/brooks.md");
    expect(text).not.toContain('user_id: "brooks-architect"');
    expect(text).not.toContain("mcp__MCP_DOCKER__insert_data");
    expect(text).not.toContain("mcp__MCP_DOCKER__execute_sql");
    expect(text).toContain("Promotion requires human approval");
    expect(text).toContain("Conceptual Integrity Above All");
  });

  test("loaded policy retains evidence gates without forcing Scout execution", () => {
    for (const path of [
      ".opencode/AGENTS.md", ".opencode/STARTUP.md", ".agents/TEAM-RAM-RUNTIME.md",
      ".opencode/skills/team-ram-cowork/SKILL.md", ".opencode/agent/core/brooks.md",
      ".opencode/agent/subagents/core/scout.md", ".opencode/command/ultra.md", ".opencode/command/orchestrate.md",
    ]) {
      const text = read(path);
      expect(text).toMatch(/[Ss]cout (?:is )?optional|[Oo]ptional (?:real )?Scout|Scout assistance is optional/);
      expect(text).not.toContain("Scout-first is mandatory");
      expect(text).not.toContain("Scout is the **mandatory first gate**");
      expect(text).not.toContain("Scout before build");
    }
    expect(read(".agents/TEAM-RAM-RUNTIME.md")).toContain("group_id: allura-system");
    expect(read(".agents/TEAM-RAM-RUNTIME.md")).toContain("Tavily is only for needed current external research");
  });
});
