import { chmod, writeFile } from "node:fs/promises";
import { createToken } from "@/lib/mcp-token/repository";

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

export async function provisionBenchmarkAuth(envFile: string): Promise<void> {
  const result = await createToken({
    group_id: process.env.BENCHMARK_GROUP_ID ?? "allura-bench-ci",
    workspace_id: process.env.BENCHMARK_WORKSPACE_ID ?? "benchmark-ci",
    agent_name: "epic-24-ci-benchmark",
    scopes: [...BENCHMARK_SCOPES],
    created_by: "epic-24-ci",
  });
  await writeFile(envFile, renderBenchmarkEnv(result.raw), { encoding: "utf8", mode: 0o600 });
  await chmod(envFile, 0o600);
}

if (import.meta.main) {
  provisionBenchmarkAuth(parseEnvFileArg(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`benchmark credential provisioning failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
