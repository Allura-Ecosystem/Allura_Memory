/**
 * Regression coverage for docs-backend-residue-guard.sh (DW-2).
 *
 * Runs a copied guard in a temporary Git repository so its root discovery and
 * active-doc scan behave exactly as they do in CI.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

function makeGuardRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "allura-docs-guard-"));
  roots.push(root);
  mkdirSync(join(root, "docs", "allura"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(
    join(process.cwd(), ".github", "scripts", "docs-backend-residue-guard.sh"),
    join(root, "scripts", "docs-backend-residue-guard.sh"),
  );
  chmodSync(join(root, "scripts", "docs-backend-residue-guard.sh"), 0o755);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function runGuard(root: string): { status: number; output: string } {
  try {
    const output = execFileSync("bash", ["scripts/docs-backend-residue-guard.sh"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("docs-backend-residue-guard Markdown link coverage (DW-2)", () => {
  it("accepts inline, titled, and reference links, ignores code, and rejects a broken reference", () => {
    const root = makeGuardRepo();
    writeFileSync(join(root, "docs", "allura", "TARGET.md"), "# Target\n");
    writeFileSync(
      join(root, "docs", "allura", "VALID.md"),
      [
        "[inline](TARGET.md)",
        "[titled](TARGET.md \"target\")",
        "[reference]: TARGET.md",
        "`[inline-code](MISSING-inline-code.md)`",
        "",
        "```md",
        "[fenced-code](MISSING-fenced-code.md)",
        "```",
        "",
      ].join("\n"),
    );
    expect(runGuard(root)).toMatchObject({ status: 0 });

    writeFileSync(join(root, "docs", "allura", "BROKEN.md"), "[missing]: MISSING.md\n");
    const broken = runGuard(root);
    expect(broken.status).not.toBe(0);
    expect(broken.output).toContain("broken reference link: MISSING.md");
  });
});
