/**
 * Brief Template Tests — Story 20.2
 *
 * Verifies:
 * - BRIEF.md template exists at templates/BRIEF.md
 * - Template contains mandatory "Memory Hydration" section (Step 1)
 * - Template contains mandatory "Memory Writeback" section (Step 3)
 * - Template includes group_id placeholder for tenant context
 * - Template references memory_search and memory_add MCP tools
 * - AGENTS.md §4 references the template
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("Story 20.2 — Delegate Task Brief Template", () => {
  const templatePath = join(process.cwd(), "templates", "BRIEF.md");
  const agentsPath = join(process.cwd(), "AGENTS.md");

  it("AC-1: templates/BRIEF.md exists", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  it("AC-1: BRIEF.md contains mandatory 'Memory Hydration' section as Step 1", () => {
    const content = readFileSync(templatePath, "utf-8");
    expect(content).toContain("Memory Hydration");
    expect(content).toContain("Step 1");
    expect(content).toContain("memory_search");
  });

  it("AC-2: BRIEF.md contains mandatory 'Memory Writeback' section as final step", () => {
    const content = readFileSync(templatePath, "utf-8");
    expect(content).toContain("Memory Writeback");
    expect(content).toContain("Step 3");
    expect(content).toContain("memory_add");
  });

  it("AC-3: BRIEF.md includes group_id placeholder for tenant context", () => {
    const content = readFileSync(templatePath, "utf-8");
    expect(content).toContain("group_id");
    expect(content).toContain("{{group_id}}");
  });

  it("AC-1: BRIEF.md hydration section instructs querying with group_id and limit", () => {
    const content = readFileSync(templatePath, "utf-8");
    // The hydration step should reference memory_search with group_id and a limit
    expect(content).toMatch(/memory_search.*group_id.*limit/i);
  });

  it("AC-2: BRIEF.md writeback section includes structured content format", () => {
    const content = readFileSync(templatePath, "utf-8");
    // The writeback should include task summary, outcome, files, decisions
    expect(content).toContain("task_summary");
    expect(content).toMatch(/outcome.*pass\|fail\|partial/i);
    expect(content).toContain("files_changed");
    expect(content).toContain("key_decisions");
  });

  it("AC-2: BRIEF.md writeback includes metadata with type 'task_outcome'", () => {
    const content = readFileSync(templatePath, "utf-8");
    expect(content).toContain("task_outcome");
    expect(content).toContain("metadata");
  });

  it("AC-5: AGENTS.md §4 references the BRIEF.md template", () => {
    const content = readFileSync(agentsPath, "utf-8");
    expect(content).toContain("§4");
    expect(content).toContain("BRIEF.md");
    expect(content).toContain("templates/BRIEF.md");
  });

  it("AC-5: AGENTS.md §4 documents Memory Hydration and Memory Writeback requirements", () => {
    const content = readFileSync(agentsPath, "utf-8");
    expect(content).toContain("Memory Hydration");
    expect(content).toContain("Memory Writeback");
    expect(content).toContain("memory_search");
    expect(content).toContain("memory_add");
  });

  it("AC-3: AGENTS.md §4 mentions group_id in delegate_task context", () => {
    const content = readFileSync(agentsPath, "utf-8");
    expect(content).toContain("group_id");
    expect(content).toContain("delegate_task");
  });
});