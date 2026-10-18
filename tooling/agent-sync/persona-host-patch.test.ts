import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("host patch applies to quoted/triple TOML and Markdown without runtime changes", () => {
  const root = mkdtempSync(join(tmpdir(), "allura-persona-fixture-")); roots.push(root);
  const release = join(root, "release");
  const write = (path: string, content: string): void => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  const ram = ["brooks", "jobs", "woz", "scout", "pike", "fowler", "bellard", "carmack", "knuth", "hightower"];
  const durham = ["brand-orchestrator", "brand-strategist", "copywriter", "visual-director", "brand-kit-builder", "qa-reviewer", "data-analyst"];
  for (const role of ram) write(join(release, "team-ram-coding/agents", `${role}.md`), "role\n");
  for (const role of durham) write(join(release, "team-durham/agents", `${role}.md`), "role\n");
  const toml = join(root, ".codex/agents/brooks.toml");
  const jobs = join(root, ".codex/agents/jobs.toml");
  write(toml, 'name = "brooks"\nmodel = "fixture-only"\nsandbox_mode = "read-only"\ndeveloper_instructions = """\nstale persona\n"""\ncustom_after = true\n');
  write(jobs, 'name = "jobs"\ndeveloper_instructions = "old\\nbody"\n');
  const markdown = join(root, ".config/opencode/agents/brooks.md");
  const header = '---\nmode: primary\nmodel: fixture-only\npermission:\n  edit: deny\n---\n';
  write(markdown, `${header}\nstale persona\n`);
  const before = Bun.TOML.parse(readFileSync(toml, "utf8"));
  const invoke = (): ReturnType<typeof Bun.spawnSync> => Bun.spawnSync(["bun", join(import.meta.dir, "persona-host-patch.ts"), "--host", root, "--release", release]);
  const generated = invoke(); expect(generated.exitCode).toBe(0);
  const applied = Bun.spawnSync(["apply_patch"], { stdin: generated.stdout });
  expect(applied.exitCode).toBe(0);
  const after = Bun.TOML.parse(readFileSync(toml, "utf8"));
  expect(after.developer_instructions).toContain(join(release, "team-ram-coding/agents/brooks.md"));
  delete before.developer_instructions; delete after.developer_instructions;
  expect(after).toEqual(before);
  expect(Bun.TOML.parse(readFileSync(jobs, "utf8")).developer_instructions).toContain("Allura's jobs AI role");
  expect(readFileSync(markdown, "utf8").startsWith(header)).toBe(true);
  expect(readFileSync(markdown, "utf8")).not.toContain("stale persona");
  expect(invoke().stdout.toString()).toBe("*** Begin Patch\n\n*** End Patch\n");
});
