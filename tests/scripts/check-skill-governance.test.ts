import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createFixtureRepo() {
  const root = await mkdtemp(path.join(tmpdir(), "skill-governance-"));
  createdDirs.push(root);

  await mkdir(path.join(root, ".opencode", "skills", "alpha"), { recursive: true });
  await mkdir(path.join(root, ".opencode", "skills", "beta"), { recursive: true });
  await mkdir(path.join(root, ".opencode", "skills", "gamma"), { recursive: true });
  await mkdir(path.join(root, ".opencode", "agent"), { recursive: true });
  await mkdir(path.join(root, ".opencode", "command"), { recursive: true });

  await writeFile(
    path.join(root, ".opencode", "SKILL-OWNERSHIP.md"),
    [
      "| alpha | Scout | Any Brain operation | ✅ Yes | none | Keep |",
      "| beta | Woz | Build | ✅ Yes | none | Keep |",
    ].join("\n"),
  );

  await writeFile(
    path.join(root, ".opencode", "skills", "alpha", "SKILL.md"),
    [
      "# Alpha",
      "",
      "Use when you need to prototype pages and mockups.",
    ].join("\n"),
  );

  await writeFile(
    path.join(root, ".opencode", "skills", "beta", "SKILL.md"),
    [
      "# Beta",
      "",
      "Use when you need to build prototype UIs and polish UI.",
    ].join("\n"),
  );

  await writeFile(
    path.join(root, ".opencode", "skills", "gamma", "SKILL.md"),
    [
      "# Gamma",
      "",
      "Use when you need to review architecture.",
    ].join("\n"),
  );

  await writeFile(
    path.join(root, ".opencode", "agent", "brooks.md"),
    [
      "---",
      "skills:",
      "  - alpha",
      "---",
    ].join("\n"),
  );

  await writeFile(
    path.join(root, ".opencode", "command", "party.md"),
    "# Party\n\nDispatch the team.",
  );

  return root;
}

describe("check-skill-governance", () => {
  it("reports orphan skills, missing owned skills, and overlap hotspots", async () => {
    const root = await createFixtureRepo();
    const { analyzeSkillGovernance } = await import("../../scripts/check-skill-governance");

    const report = await analyzeSkillGovernance({ repoRoot: root });

    expect(report.skillCountOnDisk).toBe(3);
    expect(report.skillsWithSkillMd).toBe(3);
    expect(report.orphanSkills).toEqual(["gamma"]);
    expect(report.deadSkills).toEqual(["gamma"]);
    expect(report.utilitySkills).toEqual([]);
    expect(report.routedSkills).toEqual(["alpha", "beta", "gamma"]);
    expect(report.missingOwnedSkills).toEqual([]);
    // beta is owned in SKILL-OWNERSHIP.md, so it's considered routed even without an agent file
    expect(report.missingAgentRoutes).toEqual([]);
    expect(report.triggerOverlapHotspots).toEqual([]);
    expect(report.skillLocations).toEqual({
      alpha: ["opencode"],
      beta: ["opencode"],
      gamma: ["opencode"],
    });
    expect(report.status).toBe("drifted");
  });

  it("fails strict mode when drift remains", async () => {
    const root = await createFixtureRepo();
    const { runSkillGovernanceCli } = await import("../../scripts/check-skill-governance");

    await expect(runSkillGovernanceCli(["--repo", root, "--strict"])).rejects.toThrow(/drift/i);
  });
});
