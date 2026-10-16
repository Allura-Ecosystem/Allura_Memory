import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

describe("portal deployment contract", () => {
  it("defines an isolated loopback portal service with production auth safeguards", () => {
    const composePath = resolve(root, "docker-compose.portal.yml");
    const manifest = readFileSync(composePath, "utf8");
    const selected = manifest.match(/dockerfile:\s*(\S+)/)?.[1];
    expect(selected).toBe("Dockerfile.portal-prebuilt");
    const dockerfilePath = resolve(root, selected!);

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
    expect(compose).toContain('ALLURA_MCP_BASE_URL: "http://allura-memory-mcp:3201"');
    expect(dockerfile).toContain("COPY public ./public");
    expect(dockerfile).toContain("COPY .next/static ./.next/static");
    expect(dockerfile).toContain("COPY .next/standalone ./");
    expect(dockerfile).toContain("server.js");
    expect(dockerfile).toContain("EXPOSE 3200");
  });
});
