import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const typescriptBin = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
let consumerRoot = "";

beforeAll(() => {
  execFileSync("bun", ["run", "build"], { cwd: packageRoot, encoding: "utf8" });
  consumerRoot = mkdtempSync(join(tmpdir(), "allura-sdk-packed-consumer-"));
  const packOutput = execFileSync(
    "npm",
    ["pack", packageRoot, "--json", "--pack-destination", consumerRoot],
    { cwd: consumerRoot, encoding: "utf8" },
  );
  const packed = JSON.parse(packOutput) as Array<{ filename: string; files: Array<{ path: string }> }>;
  expect(packed).toHaveLength(1);
  expect(packed[0]!.files.some((file) => file.path === "dist/index.js")).toBe(true);
  expect(packed[0]!.files.some((file) => file.path === "dist/index.cjs")).toBe(true);
  expect(packed[0]!.files.some((file) => file.path === "dist/index.d.ts")).toBe(true);
  expect(packed[0]!.files.some((file) => file.path === "dist/index.d.cts")).toBe(true);

  writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({ name: "allura-sdk-consumer", private: true, type: "module" }));
  execFileSync(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", join(consumerRoot, packed[0]!.filename)],
    { cwd: consumerRoot, encoding: "utf8" },
  );
});

afterAll(() => {
  if (consumerRoot) rmSync(consumerRoot, { recursive: true, force: true });
});

describe("packed SDK clean-consumer contract", () => {
  it("resolves ESM and client.lanes through the @allura/sdk package export", () => {
    writeFileSync(join(consumerRoot, "consumer.mjs"), `
      import { AlluraClient, LaneOperations } from "@allura/sdk";
      const client = new AlluraClient({ baseUrl: "http://127.0.0.1:3201", authToken: "consumer-token" });
      if (!(client.lanes instanceof LaneOperations)) process.exit(1);
      console.log("esm-package-ok");
    `);
    expect(execFileSync("node", ["consumer.mjs"], { cwd: consumerRoot, encoding: "utf8" }).trim())
      .toBe("esm-package-ok");
  });

  it("resolves CommonJS and client.lanes through the @allura/sdk package export", () => {
    writeFileSync(join(consumerRoot, "consumer.cjs"), `
      const { AlluraClient, LaneOperations } = require("@allura/sdk");
      const client = new AlluraClient({ baseUrl: "http://127.0.0.1:3201", authToken: "consumer-token" });
      if (!(client.lanes instanceof LaneOperations)) process.exit(1);
      console.log("cjs-package-ok");
    `);
    expect(execFileSync("node", ["consumer.cjs"], { cwd: consumerRoot, encoding: "utf8" }).trim())
      .toBe("cjs-package-ok");
  });

  it("resolves declarations and the typed client.lanes surface by package name", () => {
    writeFileSync(join(consumerRoot, "consumer.ts"), `
      import { AlluraClient, LaneOperations, type LaneOpenResponse } from "@allura/sdk";
      const client = new AlluraClient({ baseUrl: "http://127.0.0.1:3201", authToken: "consumer-token" });
      const lanes: LaneOperations = client.lanes;
      const open: Promise<LaneOpenResponse> = lanes.open({ group_id: "allura-consumer", lane_id: "agent-lane-woz", base_revision: "base-1" });
      void open;
    `);
    execFileSync(process.execPath, [
      typescriptBin,
      "--noEmit",
      "--strict",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "consumer.ts",
    ], { cwd: consumerRoot, encoding: "utf8" });
  });

  it("resolves the NodeNext require declaration branch through index.d.cts", () => {
    writeFileSync(join(consumerRoot, "consumer.cts"), `
      import sdk = require("@allura/sdk");
      const client = new sdk.AlluraClient({ baseUrl: "http://127.0.0.1:3201", authToken: "consumer-token" });
      const lanes: sdk.LaneOperations = client.lanes;
      void lanes;
    `);
    execFileSync(process.execPath, [typescriptBin, "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.cts"], { cwd: consumerRoot, encoding: "utf8" });
  });
});
