import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

describe("portal deployment contract", () => {
  it("defines an isolated loopback portal service with production auth safeguards", () => {
    const composePath = resolve(root, "docker-compose.portal.yml");
    const dockerfilePath = resolve(root, "Dockerfile.portal");

    expect(existsSync(composePath)).toBe(true);
    expect(existsSync(dockerfilePath)).toBe(true);

    const compose = readFileSync(composePath, "utf8");
    expect(compose).toContain("portal:");
    expect(compose).toContain("127.0.0.1:3200:3200");
    expect(compose).toContain("NODE_ENV: production");
    expect(compose).toContain('ALLURA_DEV_AUTH_ENABLED: "false"');
    expect(compose).toContain("knowledge-network");
    expect(compose).toContain("/api/health/live");

    const dockerignore = readFileSync(resolve(root, ".dockerignore"), "utf8").split(/\r?\n/);
    expect(dockerignore).toContain(".opencode");
    expect(dockerignore).toContain(".claude");

    const dockerfile = readFileSync(dockerfilePath, "utf8");
    expect(dockerfile).toContain("bun run build");
    expect(dockerfile).toContain("server.js");
    expect(dockerfile).toContain("EXPOSE 3200");
  });
});
