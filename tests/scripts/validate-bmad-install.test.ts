import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const validator = join(projectRoot, "scripts/validate-bmad-install.ts");
const registry = join(projectRoot, "config/bmad-install-integrity.json");
const sourceRepository = resolve(process.env.BMAD_TEST_SOURCE_ROOT ?? projectRoot);
const tempRoots: string[] = [];

function freshFixture(): string {
  const parent = mkdtempSync(join(tmpdir(), "allura-bmad-integrity-"));
  const root = join(parent, "repo");

  cpSync(join(sourceRepository, ".agents/skills"), join(root, ".agents/skills"), { recursive: true });
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  for (const entry of readdirSync(join(sourceRepository, ".claude/skills"), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("bmad-")) {
      cpSync(
        join(sourceRepository, ".claude/skills", entry.name),
        join(root, ".claude/skills", entry.name),
        { recursive: true },
      );
    }
  }
  mkdirSync(join(root, ".opencode/commands"), { recursive: true });
  for (const entry of readdirSync(join(sourceRepository, ".opencode/commands"), { withFileTypes: true })) {
    if (entry.isFile() && /^bmad-.*\.md$/.test(entry.name)) {
      cpSync(
        join(sourceRepository, ".opencode/commands", entry.name),
        join(root, ".opencode/commands", entry.name),
      );
    }
  }
  cpSync(join(sourceRepository, "_bmad"), join(root, "_bmad"), { recursive: true });

  tempRoots.push(parent);
  return root;
}

function runValidator(root: string) {
  const result = Bun.spawnSync(
    ["bun", validator, "--root", root, "--registry", registry],
    { stdout: "pipe", stderr: "pipe" },
  );
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

function append(root: string, relativePath: string, value: string): void {
  const path = join(root, relativePath);
  writeFileSync(path, `${readFileSync(path, "utf8")}${value}`);
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("BMAD repository-local integrity gate", () => {
  test("accepts the pinned local install and approved routing fixture", () => {
    const result = runValidator(freshFixture());
    expect(result.output).toContain("BMAD_INTEGRITY_OK");
    expect(result.exitCode).toBe(0);
  });

  test("rejects a missing required install", () => {
    const root = freshFixture();
    renameSync(join(root, "_bmad"), join(root, "_bmad-missing"));
    const result = runValidator(root);
    expect(result.output).toContain("BMAD_ROOT_MISSING");
    expect(result.exitCode).toBe(1);
  });

  test("rejects version drift", () => {
    const root = freshFixture();
    const path = join(root, "_bmad/_config/manifest.yaml");
    writeFileSync(path, readFileSync(path, "utf8").replaceAll("6.12.4", "6.12.5"));
    const result = runValidator(root);
    expect(result.output).toContain("VERSION_MISMATCH");
    expect(result.exitCode).toBe(1);
  });

  test("rejects a missing installed skill", () => {
    const root = freshFixture();
    unlinkSync(join(root, ".agents/skills/bmad-help/SKILL.md"));
    const result = runValidator(root);
    expect(result.output).toContain("MISSING_FILE .agents/skills/bmad-help/SKILL.md");
    expect(result.exitCode).toBe(1);
  });

  test("rejects a missing runtime helper", () => {
    const root = freshFixture();
    unlinkSync(join(root, "_bmad/scripts/resolve_config.py"));
    const result = runValidator(root);
    expect(result.output).toContain("MISSING_FILE _bmad/scripts/resolve_config.py");
    expect(result.exitCode).toBe(1);
  });

  test("rejects tampered vendor content", () => {
    const root = freshFixture();
    append(root, ".agents/skills/bmad-help/SKILL.md", "\nTAMPERED\n");
    const result = runValidator(root);
    expect(result.output).toContain("HASH_MISMATCH .agents/skills/bmad-help/SKILL.md");
    expect(result.exitCode).toBe(1);
  });

  test("rejects a tampered generated install manifest", () => {
    const root = freshFixture();
    append(root, "_bmad/_config/files-manifest.csv", "\nTAMPERED\n");
    const result = runValidator(root);
    expect(result.output).toContain("HASH_MISMATCH _bmad/_config/files-manifest.csv");
    expect(result.exitCode).toBe(1);
  });

  test("rejects shared vendor adapter parity drift", () => {
    const root = freshFixture();
    append(root, ".claude/skills/bmad-help/SKILL.md", "\nCLAUDE-ONLY DRIFT\n");
    const result = runValidator(root);
    expect(result.output).toContain("ADAPTER_PARITY bmad-help/SKILL.md");
    expect(result.exitCode).toBe(1);
  });

  test("rejects an OpenCode command whose skill cannot resolve", () => {
    const root = freshFixture();
    const path = join(root, ".opencode/commands/bmad-help.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("@skills/bmad-help", "@skills/bmad-does-not-exist"));
    const result = runValidator(root);
    expect(result.output).toContain("ADAPTER_UNRESOLVED .opencode/commands/bmad-help.md");
    expect(result.exitCode).toBe(1);
  });

  test("rejects an unexpected team customization", () => {
    const root = freshFixture();
    const path = join(root, "_bmad/custom/unapproved.toml");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "[workflow]\npersistent_facts = []\n");
    const result = runValidator(root);
    expect(result.output).toContain("CUSTOM_UNEXPECTED _bmad/custom/unapproved.toml");
    expect(result.exitCode).toBe(1);
  });

  test("rejects a missing approved customization", () => {
    const root = freshFixture();
    unlinkSync(join(root, "_bmad/custom/bmad-build.toml"));
    const result = runValidator(root);
    expect(result.output).toContain("CUSTOM_MISSING _bmad/custom/bmad-build.toml");
    expect(result.exitCode).toBe(1);
  });

  test("rejects an invalid work-status routing state", () => {
    const root = freshFixture();
    const path = join(root, "_bmad/custom/bmad-sprint-planning.toml");
    writeFileSync(path, readFileSync(path, "utf8").replace(
      "Owner-approved operational routing: Allura owns work status; Notion holds planning documents; Allura Brain provides governed continuity. These are separate authorities.",
      "A local sprint ledger owns live work-item status.",
    ));
    const result = runValidator(root);
    expect(result.output).toContain("CUSTOM_ROUTING_INVALID _bmad/custom/bmad-sprint-planning.toml");
    expect(result.exitCode).toBe(1);
  });
});
