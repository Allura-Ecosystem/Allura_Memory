import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/agents/bmad-loop-team-ram.ts");
const customization = path.join(root, "_bmad/custom/bmad-build-auto.toml");

describe("BMad Loop Team RAM bridge", () => {
  it("keeps a committed scoped Loop guard", () => {
    expect(existsSync(script)).toBe(true);
    const source = readFileSync(script, "utf8");
    expect(source).toContain("exactly one of --epic N or --story");
    expect(source).toContain("scm.isolation=worktree");
    expect(source).toContain("record-merge");
  });

  it("parses its CLI before it can touch Loop or GitHub state", () => {
    const result = Bun.spawnSync({ cmd: [process.execPath, script], cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain("command must be preflight, run, or record-merge");
  });

  it("injects Allura and Team RAM gates through the durable BMad customization seam", () => {
    expect(existsSync(customization)).toBe(true);
    const source = readFileSync(customization, "utf8");
    expect(source).toContain("allura-brain audit_health_report");
    expect(source).toContain("memory_search");
    expect(source).toContain("memory_add");
    expect(source).toContain("sabir-superadmin");
    expect(source).toContain("Pike and Fowler");
  });
});
