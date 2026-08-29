/**
 * @allura/cli — command contract tests (Story 24.7 AC-3)
 *
 * Exercises the CLI as a subprocess so exit codes, help output, and
 * structured errors are pinned exactly as automation would see them.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "src", "index.ts");

function runCli(args: string[], cwd?: string) {
  return spawnSync("bun", [CLI, ...args], {
    encoding: "utf-8",
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("allura CLI — command surface", () => {
  it("prints help and exits 0 with no arguments", () => {
    const res = runCli([]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage: allura <command>");
    expect(res.stdout).toContain("init");
    expect(res.stdout).toContain("doctor");
    expect(res.stdout).toContain("eval");
  });

  it("prints help for --help", () => {
    const res = runCli(["--help"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Commands:");
  });

  it("prints version for --version", () => {
    const res = runCli(["--version"]);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exits 1 with a structured error for an unknown command", () => {
    const res = runCli(["frobnicate"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Unknown command: frobnicate");
  });

  it("exits 1 with JSON error for an unknown command under --json", () => {
    const res = runCli(["frobnicate", "--json"]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stderr);
    expect(parsed.error).toContain("Unknown command");
    expect(parsed.code).toBe(1);
  });
});

describe("allura CLI — init", () => {
  it("creates a non-secret example config in a fresh directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "allura-cli-init-"));
    const res = runCli(["init"], dir);
    expect(res.status).toBe(0);
    const envPath = join(dir, ".env.portfolio.example");
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("POSTGRES_HOST=localhost");
    expect(content).toContain("GRAPH_BACKEND=ruvector");
    // Secrets must be placeholders, never real values
    expect(content).toContain("change-me");
  });

  it("is idempotent — does not overwrite an existing config", () => {
    const dir = mkdtempSync(join(tmpdir(), "allura-cli-init2-"));
    runCli(["init"], dir);
    const envPath = join(dir, ".env.portfolio.example");
    const before = readFileSync(envPath, "utf-8");
    const res = runCli(["init"], dir);
    expect(res.status).toBe(0);
    const after = readFileSync(envPath, "utf-8");
    expect(after).toBe(before);
  });
});

describe("allura CLI — doctor", () => {
  it("reports structured JSON with --json and exits non-zero when a check fails", () => {
    // No local PostgreSQL is guaranteed in CI, so the check list must still
    // be emitted and the exit code must reflect the failure honestly.
    const res = runCli(["doctor", "--json"]);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);
    expect(["ok", "fail"]).toContain(parsed.overall);
    // The exit code must be consistent with the reported overall status:
    // ok -> 0, fail -> 1. This is asserted unconditionally so a regression
    // in the exit-code contract is caught even in a healthy environment.
    if (parsed.overall === "fail") {
      expect(res.status).toBe(1);
    } else {
      expect(res.status).toBe(0);
    }
  });
});
