import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = resolve(repositoryRoot, "deploy/gateway");
const runtimePackages = ["@modelcontextprotocol/sdk", "dotenv", "pg", "zod"];

/** Offline build only. Never installs packages, starts services or reads secrets. */
export async function buildGateway(destination: string) {
  if (!isAbsolute(destination)) throw new Error("Output directory must be absolute and must not exist");
  if (Bun.version !== "1.3.14") throw new Error("Gateway candidate requires Bun 1.3.14");
  const manifestBytes = await readFile(resolve(packageRoot, "package.json"));
  const lockBytes = await readFile(resolve(packageRoot, "bun.lock"));
  const configBytes = await readFile(resolve(packageRoot, "bunfig.toml"));
  const manifest = JSON.parse(manifestBytes.toString());
  if (JSON.stringify(Object.keys(manifest.dependencies).sort()) !== JSON.stringify([...runtimePackages].sort())) {
    throw new Error("Candidate package set drifted; review the gateway runtime closure");
  }
  // Exclusive creation: refuse existing files/directories/symlinks.
  // Trusted local builds only, not concurrent hostile filesystem access.
  await mkdir(destination);
  const result = await Bun.build({
    entrypoints: [resolve(repositoryRoot, "src/mcp/canonical-http-gateway.ts")],
    target: "bun",
    format: "esm",
    external: runtimePackages,
    env: "disable",
    sourcemap: "none",
    minify: false,
    tsconfig: resolve(repositoryRoot, "tsconfig.json"),
  });
  if (!result.success) throw new AggregateError(result.logs, "Gateway candidate build failed; output is incomplete");
  if (result.outputs.length !== 1) throw new Error("Unexpected additional build assets; review packaging before adoption");
  const bundle = Buffer.from(await result.outputs[0].arrayBuffer());
  const files = { "gateway.mjs": bundle, "package.json": manifestBytes, "bun.lock": lockBytes, "bunfig.toml": configBytes };
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(resolve(destination, name), bytes, { flag: "wx" });
  }
  const receipt = {
    version: 1,
    kind: "http-gateway-packaging-candidate",
    bunVersion: Bun.version,
    externalDependencies: manifest.dependencies,
    artifacts: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, {
      bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    }])),
    limitations: ["Not a complete Allura install", "No runtime or database validation implied", "Native addons and deployment assets not included", "Does not replace stdio, workers, migrations or web"],
  };
  // Written last: a failed build never emits a success receipt.
  await writeFile(resolve(destination, "build-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return receipt;
}

if (import.meta.main) {
  if (process.argv.length !== 3) throw new Error("Usage: bun scripts/build-gateway.ts /absolute/new/output-directory");
  console.log(JSON.stringify(await buildGateway(process.argv[2]), null, 2));
}
