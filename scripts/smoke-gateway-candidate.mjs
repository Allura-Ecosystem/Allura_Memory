// Node driver; executes only negative startup cases, never a configured service.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const [candidate, bun] = process.argv.slice(2);
assert(candidate && bun && isAbsolute(candidate) && isAbsolute(bun),
  "Usage: node scripts/smoke-gateway-candidate.mjs /absolute/candidate /absolute/bun");
for (const file of [".env", ".env.local", ".env.production", ".env.development", "src", "node_modules/@allura"]) {
  assert(!existsSync(resolve(candidate, file)), `Isolated candidate must not contain ${file}`);
}
const receipt = JSON.parse(readFileSync(resolve(candidate, "build-receipt.json"), "utf8"));
for (const name of ["gateway.mjs", "package.json", "bun.lock", "bunfig.toml"]) {
  const bytes = readFileSync(resolve(candidate, name));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.artifacts[name].sha256, `${name} changed after build`);
}
const cases = [
  ["NODE_ENV production refuses missing auth", { NODE_ENV: "production" }, "CONFIG_MISSING"],
  ["NODE_ENV production refuses dev auth", { NODE_ENV: "production", ALLURA_MCP_DEV_AUTH: "true" }, "DEV_MODE_FORBIDDEN"],
  ["ALLURA_ENV production refuses dev auth", { NODE_ENV: "development", ALLURA_ENV: "production", ALLURA_MCP_DEV_AUTH: "true" }, "DEV_MODE_FORBIDDEN"],
];
for (const [name, env, reason] of cases) {
  const result = spawnSync(bun, ["--no-install", "--no-env-file", "gateway.mjs"], {
    cwd: candidate,
    // Deliberately no inherited environment: no auth, DB, preload or cache config.
    env: { ...env, NO_COLOR: "1", ALLURA_MCP_HTTP_PORT: "0" },
    encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${name}: must exit itself, not time out`);
  assert.notEqual(result.status, 0, `${name}: unexpectedly succeeded`);
  assert.match(result.stderr, new RegExp(`reasonCode: ["']${reason}["']`), `${name}: wrong refusal`);
  assert.doesNotMatch(result.stdout, /listening on port/, `${name}: must fail before listening`);
  console.log(`PASS: ${name} (${reason}, exit ${result.status})`);
}
console.log("PASS: relocated frozen-dependency artifact, three negative startup checks; no configured-service/DB/tool parity claim.");
