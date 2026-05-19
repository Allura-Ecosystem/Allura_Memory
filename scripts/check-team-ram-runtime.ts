#!/usr/bin/env bun

import { existsSync, lstatSync, readFileSync } from "node:fs";

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function hasText(path: string, text: string): boolean {
  return existsSync(path) && readFileSync(path, "utf8").includes(text);
}

function exists(path: string): boolean {
  return existsSync(path);
}

function isDirOrSymlink(path: string): boolean {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  return stat.isDirectory() || stat.isSymbolicLink();
}

async function mcpCall(body: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch("http://localhost:5888/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!text.trim()) {
    return { res, json: null };
  }
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  const json = JSON.parse(dataLine ? dataLine.slice(6) : text);
  return { res, json };
}

async function checkMcp() {
  try {
    const health = await fetch("http://localhost:5888/health");
    check("Allura MCP health", health.ok, `status=${health.status}`);

    const init = await mcpCall({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "team-ram-runtime-check", version: "1.0.0" },
      },
    });
    const sessionId = init.res.headers.get("mcp-session-id") ?? undefined;
    check("MCP initialize", init.res.ok && Boolean(sessionId), sessionId ? "session ok" : "missing session");

    if (!sessionId) return;

    await mcpCall({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);

    const tools = await mcpCall({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
    const toolNames = (tools.json?.result?.tools ?? []).map((tool: { name: string }) => tool.name);
    check("MCP memory_search tool", toolNames.includes("memory_search"), toolNames.join(", "));

    const search = await mcpCall(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "memory_search",
          arguments: {
            query: "active tasks blockers architecture decisions",
            group_id: "allura-system",
            limit: 3,
          },
        },
      },
      sessionId,
    );
    check("Allura memory_search allura-system", search.res.ok && !search.json?.error, search.json?.error?.message);
  } catch (error) {
    check("Allura MCP reachable", false, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  check("Root AGENTS Team RAM bridge", hasText("AGENTS.md", "Team RAM Runtime Bridge"));
  check("Shared runtime document", exists(".agents/TEAM-RAM-RUNTIME.md"));
  check("Finish all epics workflow doc", exists("_bmad/FINISH-ALL-EPICS-WORKFLOW.md"));
  check(
    "Finish all epics workflow title",
    hasText("_bmad/FINISH-ALL-EPICS-WORKFLOW.md", "Finish All Epics: Scout-First Kanban Workflow"),
  );
  check("Codex workflow name", hasText(".codex/config.toml", "kanban_workflow_name"));
  check("Scout fallback phrase", hasText(".codex/config.toml", "Scout-style hydration only"));
  check("OpenCode agents path", isDirOrSymlink(".opencode/agents"));
  check("OpenCode skill path", isDirOrSymlink(".opencode/skill"));
  check("Claude agents path", isDirOrSymlink(".claude/agents"));

  for (const agent of ["brooks", "jobs", "scout", "woz", "pike", "fowler", "knuth", "hightower", "bellard", "carmack"]) {
    check(`Claude agent ${agent}`, exists(`.claude/agents/${agent}.md`));
  }

  for (const skill of ["team-ram-cowork", "allura-memory-skill", "mcp-docker"]) {
    check(`OpenCode skill ${skill}`, exists(`.opencode/skill/${skill}/SKILL.md`));
    check(`Claude skill ${skill}`, exists(`.claude/skills/${skill}/SKILL.md`));
  }

  const opencode = JSON.parse(readFileSync(".opencode/config.json", "utf8"));
  check("OpenCode agent map brooks", Boolean(opencode.agent?.brooks));
  check("OpenCode agent map scout", Boolean(opencode.agent?.scout));
  check("OpenCode task permission", opencode.permission?.task === "allow");

  await checkMcp();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "OK" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  }

  if (failed.length > 0) {
    console.error(`\nTeam RAM runtime check failed: ${failed.length} issue(s).`);
    process.exit(1);
  }

  console.log("\nTeam RAM runtime check passed.");
}

main();
