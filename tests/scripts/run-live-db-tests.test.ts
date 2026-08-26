import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("run-live-db-tests.sh", () => {
  it("exports the explicit allura_app user to the canonical live-test invocation", () => {
    const root = mkdtempSync(join(tmpdir(), "allura-live-harness-"));
    tempDirs.push(root);
    const bin = join(root, "bin");
    const artifact = join(root, "artifact");
    mkdirSync(bin, { recursive: true });
    const capture = join(root, "bun-env.txt");
    for (const name of ["psql", "pg_isready"]) {
      const path = join(bin, name);
      writeFileSync(path, "#!/usr/bin/env bash\nprintf '16.0\\n'\nexit 0\n");
      chmodSync(path, 0o755);
    }
    const bunPath = join(bin, "bun");
    writeFileSync(bunPath, `#!/usr/bin/env bash\nprintf '%s' "$POSTGRES_APP_USER" > ${JSON.stringify(capture)}\nexit 0\n`);
    chmodSync(bunPath, 0o755);

    const result = spawnSync("bash", ["scripts/ci/run-live-db-tests.sh", `--artifact-dir=${artifact}`], {
      cwd: process.cwd(),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, POSTGRES_PASSWORD: "owner-test", POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: "app-test" },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(capture, "utf8")).toBe("allura_app");
  });

  it("fails closed when disposable app credentials are not supplied", () => {
    const result = spawnSync("bash", ["scripts/ci/run-live-db-tests.sh"], {
      cwd: process.cwd(),
      env: { ...process.env, POSTGRES_PASSWORD: "owner-test", POSTGRES_APP_USER: "", POSTGRES_APP_PASSWORD: "" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("POSTGRES_APP_USER is required");
  });
});
