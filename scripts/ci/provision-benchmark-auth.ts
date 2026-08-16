import { chmod, writeFile } from "node:fs/promises";
import { createToken } from "@/lib/mcp-token/repository";
import { createWorkspace, getWorkspace, type Workspace } from "@/lib/workspace/repository";
import { DEFAULT_BENCHMARK_GROUP_ID, DEFAULT_BENCHMARK_WORKSPACE_ID } from "./benchmark-contract";

export { DEFAULT_BENCHMARK_GROUP_ID, DEFAULT_BENCHMARK_WORKSPACE_ID } from "./benchmark-contract";

const BENCHMARK_SCOPES = [
  "memory:read",
  "memory:write",
  "memory:promote",
  "review:approve",
  "review:reject",
  "audit:read",
] as const;

export function parseEnvFileArg(argv: readonly string[]): string {
  const value = argv.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length).trim();
  if (!value) throw new Error("--env-file is required");
  return value;
}

export function renderBenchmarkEnv(rawToken: string): string {
  if (!rawToken || /[\r\n]/.test(rawToken)) throw new Error("invalid benchmark credential");
  return `BENCHMARK_AUTH_TOKEN=${rawToken}\n`;
}

interface BenchmarkWorkspaceInput {
  group_id: string;
  workspace_id: string;
}

interface BenchmarkWorkspaceDeps {
  getWorkspace: (workspace_id: string) => Promise<Workspace | null>;
  createWorkspace: (input: {
    group_id: string;
    workspace_id: string;
    name: string;
    created_by: string;
  }) => Promise<Workspace>;
}

const defaultWorkspaceDeps: BenchmarkWorkspaceDeps = { getWorkspace, createWorkspace };

interface ProvisionBenchmarkAuthDeps {
  ensureWorkspace: (input: BenchmarkWorkspaceInput) => Promise<Workspace>;
  createToken: typeof createToken;
  writeFile: (path: string, data: string, options: { encoding: "utf8"; mode: number }) => Promise<void>;
  chmod: (path: string, mode: number) => Promise<void>;
}

const defaultProvisionDeps: ProvisionBenchmarkAuthDeps = {
  ensureWorkspace: ensureBenchmarkWorkspace,
  createToken,
  writeFile,
  chmod,
};

/** Resolve-or-create the FK prerequisite without accepting cross-tenant reuse. */
export async function ensureBenchmarkWorkspace(
  input: BenchmarkWorkspaceInput = {
    group_id: process.env.BENCHMARK_GROUP_ID ?? DEFAULT_BENCHMARK_GROUP_ID,
    workspace_id: process.env.BENCHMARK_WORKSPACE_ID ?? DEFAULT_BENCHMARK_WORKSPACE_ID,
  },
  deps: BenchmarkWorkspaceDeps = defaultWorkspaceDeps,
): Promise<Workspace> {
  const existing = await deps.getWorkspace(input.workspace_id);
  if (existing) {
    if (existing.group_id !== input.group_id) {
      throw new Error(
        `benchmark workspace '${input.workspace_id}' belongs to tenant '${existing.group_id}', not '${input.group_id}'`,
      );
    }
    return existing;
  }

  try {
    return await deps.createWorkspace({
      group_id: input.group_id,
      workspace_id: input.workspace_id,
      name: "Epic 24 CI benchmark",
      created_by: "epic-24-ci",
    });
  } catch (error) {
    // A concurrent provisioner may have won the insert race. Resolve it and
    // still verify that the FK row belongs to the credential tenant.
    const raced = await deps.getWorkspace(input.workspace_id);
    if (raced?.group_id === input.group_id) return raced;
    throw error;
  }
}

export async function provisionBenchmarkAuth(
  envFile: string,
  deps: ProvisionBenchmarkAuthDeps = defaultProvisionDeps,
): Promise<void> {
  const group_id = process.env.BENCHMARK_GROUP_ID ?? DEFAULT_BENCHMARK_GROUP_ID;
  const workspace_id = process.env.BENCHMARK_WORKSPACE_ID ?? DEFAULT_BENCHMARK_WORKSPACE_ID;
  await deps.ensureWorkspace({ group_id, workspace_id });
  const result = await deps.createToken({
    group_id,
    workspace_id,
    agent_name: "epic-24-ci-benchmark",
    scopes: [...BENCHMARK_SCOPES],
    created_by: "epic-24-ci",
  });
  await deps.writeFile(envFile, renderBenchmarkEnv(result.raw), { encoding: "utf8", mode: 0o600 });
  await deps.chmod(envFile, 0o600);
}

if (import.meta.main) {
  provisionBenchmarkAuth(parseEnvFileArg(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`benchmark credential provisioning failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
