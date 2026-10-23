import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");

describe("portal deployment contract", () => {
  it("packages the selected prebuilt portal with public assets and an internal MCP origin", () => {
    const composePath = resolve(root, "docker-compose.portal.yml");
    expect(existsSync(composePath)).toBe(true);

    const compose = readFileSync(composePath, "utf8");
    const selectedDockerfile = compose.match(/dockerfile:\s*(\S+)/)?.[1];
    expect(selectedDockerfile).toBe("Dockerfile.portal-prebuilt");

    const dockerfilePath = resolve(root, selectedDockerfile!);
    expect(existsSync(dockerfilePath)).toBe(true);
    expect(compose).toContain("portal:");
    expect(compose).toContain("127.0.0.1:3200:3200");
    expect(compose).toContain("NODE_ENV: production");
    expect(compose).toContain('ALLURA_DEV_AUTH_ENABLED: "false"');
    expect(compose).toContain('ALLURA_MCP_BASE_URL: "http://allura-memory-mcp:3201"');
    expect(compose).toContain("knowledge-network");
    expect(compose).toContain("/api/health/live");

    const dockerignore = readFileSync(resolve(root, ".dockerignore"), "utf8").split(/\r?\n/);
    expect(dockerignore).toContain(".opencode");
    expect(dockerignore).toContain(".claude");

    const dockerfile = readFileSync(dockerfilePath, "utf8");
    expect(dockerfile).toContain("COPY .next/standalone ./");
    expect(dockerfile).toContain("COPY public ./public");
    expect(dockerfile).toContain("COPY .next/static ./.next/static");
    expect(dockerfile).toContain("server.js");
    expect(dockerfile).toContain("EXPOSE 3200");
  });
});
