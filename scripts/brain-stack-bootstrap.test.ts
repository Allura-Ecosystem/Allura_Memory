import { describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
const scripts = ["brain-stack.sh", "first-run.sh", "first-run-setup.sh", "validate-env.sh"];
const baseEnv = "POSTGRES_PASSWORD=synthetic-only\nOLLAMA_API_KEY=synthetic-only\nRUVIX_CONTROL_PLANE_SECRET=" + "x".repeat(32) + "\n";

function run(script: string, args: string[] = [], options: { exists?: boolean; backend?: string; health?: string; base?: string; local?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "allura-bootstrap-test-"));
  try {
    mkdirSync(join(dir, "scripts")); mkdirSync(join(dir, "bin"));
    for (const file of scripts) copyFileSync(join(root, "scripts", file), join(dir, "scripts", file));
    writeFileSync(join(dir, ".env"), (options.base ?? baseEnv) + (options.backend ? `GRAPH_BACKEND=${options.backend}\n` : ""));
    writeFileSync(join(dir, ".env.local"), options.local ?? "# no secrets\n");
    const log = join(dir, "commands.jsonl");
    writeFileSync(log, "");
    // A real Docker binary is never called: every call is intercepted here.
    const fakeDocker = `#!${process.execPath}
import { appendFileSync } from "node:fs";
const a=process.argv.slice(2); appendFileSync(process.env.TEST_LOG, JSON.stringify(a)+"\\n");
if(a[0]==="info") process.exit(0);
if(["network","volume"].includes(a[0])) {
 if(a[1]==="inspect") process.exit(process.env.TEST_EXISTS==="yes"?0:1);
 if(a[1]==="create") process.exit(0);
}
if(a[0]==="compose") {
 if(a.includes("ps") && a.includes("-q")) console.log("fixture-container");
 if(a.some(x=>["version","up","restart","ps"].includes(x))) process.exit(0);
}
if(a[0]==="inspect") { if(a.includes("--format")) console.log(process.env.TEST_HEALTH); process.exit(0); }
console.error("Unexpected fake Docker command"); process.exit(99);
`;
    writeFileSync(join(dir, "bin/docker"), fakeDocker); chmodSync(join(dir, "bin/docker"), 0o700);
    writeFileSync(join(dir, "bin/wget"), "#!/bin/sh\nexit 0\n"); chmodSync(join(dir, "bin/wget"), 0o700);
    const result = Bun.spawnSync({
      cmd: ["bash", join(dir, "scripts", script), ...args], cwd: dir,
      env: { PATH: join(dir, "bin") + ":/usr/bin:/bin", TEST_LOG: log,
        TEST_EXISTS: options.exists ? "yes" : "no", TEST_HEALTH: options.health ?? "running healthy" },
      stdout: "pipe", stderr: "pipe", timeout: 10000,
    });
    return { exit: result.exitCode, output: result.stdout.toString() + result.stderr.toString(),
      calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]) };
  } finally { rmSync(dir, { recursive: true }); }
}

describe("PostgreSQL-only Brain bootstrap (fake Docker, no live side effects)", () => {
  test("expected resources and services match the actual Compose source", () => {
    const compose = parse(readFileSync(join(root, "docker-compose.yml"), "utf8"));
    expect(Object.keys(compose.services).sort()).toEqual(["mcp", "postgres"]);
    expect(Object.values(compose.networks).map((v: unknown) => (v as { external: boolean; name: string }).name).sort())
      .toEqual(["knowledge-network", "open-webui-stack_default"]);
    expect(Object.values(compose.volumes)).toEqual([{ external: true, name: "memory_postgres_data" }]);
  });
  for (const script of ["brain-stack.sh", "first-run.sh", "first-run-setup.sh"]) {
    test(`${script}: fresh bootstrap creates only current Compose externals`, () => {
      const result = run(script, script === "brain-stack.sh" ? ["up"] : []);
      expect(result.exit).toBe(0);
      const creates = result.calls.filter(a => a[1] === "create").map(a => a.slice(0,3));
      expect(creates).toEqual([["network", "create", "knowledge-network"], ["network", "create", "open-webui-stack_default"], ["volume", "create", "memory_postgres_data"]]);
      expect(result.calls.flat()).not.toContain("--remove-orphans");
      expect(result.calls.flat().some(a => /neo4j|prune|^rm$/.test(a))).toBe(false);
    });
    test(`${script}: existing external resources are preserved`, () => {
      const result = run(script, script === "brain-stack.sh" ? ["up"] : [], { exists: true });
      expect(result.exit).toBe(0);
      expect(result.calls.some(a => a[1] === "create")).toBe(false);
    });
  }
  test("restart addresses only services actually present", () => {
    const result = run("brain-stack.sh", ["restart"]);
    expect(result.exit).toBe(0);
    const call = result.calls.find(a => a.includes("restart"))!;
    expect(call.slice(call.indexOf("restart") + 1)).toEqual(["postgres", "mcp"]);
  });
  test("status does not ask Compose for a retired service", () => {
    const result = run("brain-stack.sh", ["status"]);
    expect(result.exit).toBe(0);
    expect(result.calls.flat()).not.toContain("neo4j");
  });
  for (const health of ["running unhealthy", "exited healthy"]) {
    test(`readiness refuses ${health} even if the HTTP probe responds`, () => {
      const result = run("brain-stack.sh", ["wait-ready", "1"], { health });
      expect(result.exit).toBe(1);
      expect(result.output).not.toContain("✅ Allura Brain is ready");
    });
  }
  test("retired backend and nonfunctional dual-read cannot pass validation", () => {
    for (const backend of ["neo4j", "NEO4J", '"neo4j"', "'neo4j'"]) {
      expect(run("validate-env.sh", [], { backend, local: "NEO4J_PASSWORD=synthetic-only\n" }).exit).toBe(1);
    }
    for (const flag of ["true", '"true"', "'true'"]) {
      expect(run("validate-env.sh", [], { local: `GRAPH_DUAL_READ=${flag}\nNEO4J_PASSWORD=synthetic-only\n` }).exit).toBe(1);
    }
    expect(run("validate-env.sh", [], { backend: '"ruvector"', local: 'GRAPH_DUAL_READ="false"\n' }).exit).toBe(0);
  });
  test("quoted empty secrets cannot satisfy required configuration", () => {
    expect(run("validate-env.sh", [], { local: 'POSTGRES_PASSWORD=""\n' }).exit).toBe(1);
    expect(run("validate-env.sh", [], { local: "POSTGRES_PASSWORD=''\n" }).exit).toBe(1);
  });
  test("local configuration overrides base with no secret-value output", () => {
    const result = run("validate-env.sh", [], { base: "POSTGRES_PASSWORD=base-only\n", local: baseEnv });
    expect(result.exit).toBe(0);
    expect(result.output).not.toContain("synthetic-only");
    expect(run("validate-env.sh", [], { base: baseEnv, local: "POSTGRES_PASSWORD=\n" }).exit).toBe(1);
  });
});
