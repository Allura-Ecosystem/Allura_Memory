import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderBenchmarkEnv } from "./provision-benchmark-auth";

describe("CI benchmark authentication wiring", () => {
  it("provisions a verifier-backed bearer and sources it without printing it", async () => {
    const source = await readFile(path.resolve("scripts/ci/run-benchmark.sh"), "utf8");
    expect(source).toContain("provision-benchmark-auth.ts");
    expect(source).toContain("source \"$benchmark_auth_env\"");
    expect(source).toContain("export BENCHMARK_AUTH_TOKEN");
    expect(source).not.toContain("echo $BENCHMARK_AUTH_TOKEN");
    expect(source).not.toContain("ALLURA_MCP_AUTH_TOKEN=");
  });

  it("keeps the generated credential out of CI diagnostics", async () => {
    const source = await readFile(path.resolve("scripts/ci/provision-benchmark-auth.ts"), "utf8");
    expect(source).toContain("writeFile");
    expect(source).toContain("BENCHMARK_AUTH_TOKEN");
    expect(source).not.toMatch(/console\.log\([^\n]*raw/);
    expect(source).not.toContain("process.stdout.write");
  });

  it("renders an ephemeral credential only as a shell assignment", () => {
    const token = "ephemeral-benchmark-token";
    const rendered = renderBenchmarkEnv(token);

    expect(rendered).toBe(`BENCHMARK_AUTH_TOKEN=${token}\n`);
    expect(rendered).not.toContain("echo");
    expect(rendered).not.toContain("console.log");
    expect(rendered).not.toContain("token_hash");
  });
});
