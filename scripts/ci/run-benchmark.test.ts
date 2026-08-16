import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "@/lib/workspace/repository";
import {
  DEFAULT_BENCHMARK_GROUP_ID,
  DEFAULT_BENCHMARK_WORKSPACE_ID,
  ensureBenchmarkWorkspace,
  provisionBenchmarkAuth,
  renderBenchmarkEnv,
} from "./provision-benchmark-auth";

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

  it("creates the benchmark workspace before minting and resolves it idempotently", async () => {
    const calls: string[] = [];
    const workspace: Workspace = {
      workspace_id: DEFAULT_BENCHMARK_WORKSPACE_ID,
      group_id: DEFAULT_BENCHMARK_GROUP_ID,
      name: "Epic 24 CI benchmark",
      lock_mode: "normal",
      created_by: "epic-24-ci",
      created_at: "now",
      updated_at: "now",
    };

    const first = await ensureBenchmarkWorkspace(
      { group_id: DEFAULT_BENCHMARK_GROUP_ID, workspace_id: DEFAULT_BENCHMARK_WORKSPACE_ID },
      {
        getWorkspace: async () => {
          calls.push("get");
          return null;
        },
        createWorkspace: async (input) => {
          calls.push(`create:${input.workspace_id}`);
          return workspace;
        },
      },
    );
    expect(first).toEqual(workspace);

    const resolved = await ensureBenchmarkWorkspace(
      { group_id: DEFAULT_BENCHMARK_GROUP_ID, workspace_id: DEFAULT_BENCHMARK_WORKSPACE_ID },
      {
        getWorkspace: async () => workspace,
        createWorkspace: async () => {
          throw new Error("must not create an existing workspace");
        },
      },
    );
    expect(resolved).toEqual(workspace);
    expect(calls).toEqual(["get", `create:${DEFAULT_BENCHMARK_WORKSPACE_ID}`]);
  });

  it("rejects a pre-existing benchmark workspace owned by another tenant", async () => {
    await expect(
      ensureBenchmarkWorkspace(
        { group_id: DEFAULT_BENCHMARK_GROUP_ID, workspace_id: DEFAULT_BENCHMARK_WORKSPACE_ID },
        {
          getWorkspace: async () => ({
            workspace_id: DEFAULT_BENCHMARK_WORKSPACE_ID,
            group_id: "allura-other-tenant",
          } as never),
          createWorkspace: async () => {
            throw new Error("must not create a conflicting workspace");
          },
        },
      ),
    ).rejects.toThrow(/belongs to tenant/);
  });

  it("provisions the FK workspace before minting a matching-tenant credential", async () => {
    const calls: string[] = [];
    await provisionBenchmarkAuth("/tmp/benchmark-auth.env", {
      ensureWorkspace: async ({ group_id, workspace_id }) => {
        calls.push(`workspace:${group_id}:${workspace_id}`);
        return {} as Workspace;
      },
      createToken: async ({ group_id, workspace_id }) => {
        calls.push(`token:${group_id}:${workspace_id}`);
        return { raw: "test-credential" } as never;
      },
      writeFile: async (_path, data) => {
        calls.push(`env:${data}`);
      },
      chmod: async (_path, mode) => {
        calls.push(`mode:${mode.toString(8)}`);
      },
    });

    expect(calls).toEqual([
      `workspace:${DEFAULT_BENCHMARK_GROUP_ID}:${DEFAULT_BENCHMARK_WORKSPACE_ID}`,
      `token:${DEFAULT_BENCHMARK_GROUP_ID}:${DEFAULT_BENCHMARK_WORKSPACE_ID}`,
      "env:BENCHMARK_AUTH_TOKEN=test-credential\n",
      "mode:600",
    ]);
  });

  it("uses the fixed CI tenant when environment input requests a wildcard", async () => {
    const originalGroup = process.env.BENCHMARK_GROUP_ID;
    const originalWorkspace = process.env.BENCHMARK_WORKSPACE_ID;
    const calls: string[] = [];
    process.env.BENCHMARK_GROUP_ID = "*";
    process.env.BENCHMARK_WORKSPACE_ID = "other-workspace";

    try {
      await provisionBenchmarkAuth("/tmp/benchmark-auth.env", {
        ensureWorkspace: async ({ group_id, workspace_id }) => {
          calls.push(`workspace:${group_id}:${workspace_id}`);
          return {} as Workspace;
        },
        createToken: async ({ group_id, workspace_id }) => {
          calls.push(`token:${group_id}:${workspace_id}`);
          return { raw: "test-credential" } as never;
        },
        writeFile: async () => undefined,
        chmod: async () => undefined,
      });
    } finally {
      if (originalGroup === undefined) delete process.env.BENCHMARK_GROUP_ID;
      else process.env.BENCHMARK_GROUP_ID = originalGroup;
      if (originalWorkspace === undefined) delete process.env.BENCHMARK_WORKSPACE_ID;
      else process.env.BENCHMARK_WORKSPACE_ID = originalWorkspace;
    }

    expect(calls).toEqual([
      `workspace:${DEFAULT_BENCHMARK_GROUP_ID}:${DEFAULT_BENCHMARK_WORKSPACE_ID}`,
      `token:${DEFAULT_BENCHMARK_GROUP_ID}:${DEFAULT_BENCHMARK_WORKSPACE_ID}`,
    ]);
  });
});
