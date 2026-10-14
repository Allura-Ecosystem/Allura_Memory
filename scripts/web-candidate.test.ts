import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));

function readConfig(flag?: string) {
  const cwd = mkdtempSync(join(tmpdir(), "allura-web-config-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "--no-install", "-e", `import config from ${JSON.stringify(join(root, "next.config.ts"))}; console.log(JSON.stringify({output:config.output ?? null,headers:await config.headers(),devIndicators:config.devIndicators,allowedDevOrigins:config.allowedDevOrigins}));`],
      cwd,
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", ...(flag === undefined ? {} : { ALLURA_WEB_STANDALONE: flag }) },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout.toString());
  } finally {
    // Only the unique empty test-owned directory; never the repository.
    rmSync(cwd, { recursive: true });
  }
}

describe("opt-in web packaging", () => {
  test("ambiguous Docker creation never claims verified cleanup from momentary absence", () => {
    const source = readFileSync(join(root, "scripts/smoke-web-container.mjs"), "utf8")
      .replace(/^import .*;\n/gm, "");
    const errors: string[] = [];
    const output: string[] = [];
    const image = "sha256:" + "a".repeat(64);
    const timeout = Object.assign(new Error("creation timed out"), { code: "ETIMEDOUT" });
    expect(() => runInNewContext(source, {
      assert, randomUUID: () => "fixture-id",
      spawnSync: (_command: string, args: string[]) => args[0] === "run"
        ? { error: timeout, status: null, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "No such object: fixture" },
      process: { argv: ["node", "smoke", image], stdout: { write: (s: string) => output.push(s) }, stderr: { write: (s: string) => errors.push(s) } },
      console: { log: (s: string) => output.push(s) },
    })).toThrow();
    expect(output.join("\n")).not.toContain("PASS: exact label-verified disposable container cleanup");
    const diagnostic = errors.join("\n");
    expect(diagnostic).toContain("creation outcome unknown");
    expect(diagnostic).toContain("allura-web-smoke-fixture-id");
    expect(diagnostic).toContain("allura.web-smoke=fixture-id");
    expect(diagnostic).toContain(image);
  });
  test("build normalizes an empty public key to absent and preserves a configured key", () => {
    const recipe = readFileSync(join(root, "Dockerfile.web"), "utf8");
    const match = recipe.match(/RUN --network=none ([\s\S]*?)bun --bun/);
    expect(match).not.toBeNull();
    const preparation = match![1].replace(/\\\n/g, "");
    for (const value of [undefined, "", "pk_test_public_fixture"]) {
      const result = Bun.spawnSync({
        cmd: ["sh", "-c", preparation + 'printf "%s" "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY-unset}"'],
        env: { PATH: process.env.PATH ?? "", ...(value === undefined ? {} : { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value }) },
        stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe(value || "unset");
    }
  });
  test("default build behavior is unchanged", () => {
    expect(readConfig().output).toBeNull();
    expect(readConfig("true").output).toBeNull();
    expect(readConfig("0").output).toBeNull();
  });
  test("standalone changes output only, preserving headers and development settings", () => {
    const ordinary = readConfig();
    const candidate = readConfig("1");
    expect(candidate.output).toBe("standalone");
    expect({ ...candidate, output: null }).toEqual(ordinary);
  });
  test("runtime uses standalone assets and an unprivileged user", () => {
    const recipe = readFileSync(join(root, "Dockerfile.web"), "utf8");
    const runtime = recipe.split("FROM base AS runtime")[1];
    expect(runtime).toContain("/build/.next/standalone");
    expect(runtime).toContain("/build/.next/static");
    expect(runtime).toContain("/build/public");
    expect(runtime).toContain("USER bun");
    expect(runtime).not.toContain("bun install");
    expect(recipe).toContain("bun install --frozen-lockfile --ignore-scripts");
    expect(recipe).toContain("RUN --network=none");
    expect(recipe).not.toMatch(/^ARG (?:CLERK_SECRET|POSTGRES_PASSWORD|DATABASE_URL)/m);
  });
  test("context excludes environment files and authoring harnesses", () => {
    const lines = readFileSync(join(root, "Dockerfile.web.dockerignore"), "utf8").split("\n").filter(line => line && !line.startsWith("#"));
    expect(lines[0]).toBe("**");
    expect(lines).toContain("**/.env");
    expect(lines).toContain("**/.env.*");
    expect(lines).toContain("**/node_modules");
    expect(lines.some(line => /^!\.(?:opencode|claude|codex|agents)/.test(line))).toBe(false);
  });
});
