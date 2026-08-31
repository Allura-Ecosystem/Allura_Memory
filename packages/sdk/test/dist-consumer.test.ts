import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const esm = join(packageRoot, "dist", "index.js");
const cjs = join(packageRoot, "dist", "index.cjs");

describe("published dist lane consumer contract", () => {
  it("loads LaneOperations from the ESM distribution", () => {
    expect(existsSync(esm)).toBe(true);
    const output = execFileSync("node", ["--input-type=module", "--eval", `
      import { AlluraClient, LaneOperations } from ${JSON.stringify(`file://${esm}`)};
      if (typeof AlluraClient !== 'function' || typeof LaneOperations !== 'function') process.exit(1);
      console.log('esm-ok');
    `], { encoding: "utf8" });
    expect(output.trim()).toBe("esm-ok");
  });

  it("loads LaneOperations from the CommonJS distribution", () => {
    expect(existsSync(cjs)).toBe(true);
    const output = execFileSync("node", ["--eval", `
      const { AlluraClient, LaneOperations } = require(${JSON.stringify(cjs)});
      if (typeof AlluraClient !== 'function' || typeof LaneOperations !== 'function') process.exit(1);
      console.log('cjs-ok');
    `], { encoding: "utf8" });
    expect(output.trim()).toBe("cjs-ok");
  });
});
