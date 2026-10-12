import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");

describe("portal deployment contract", () => {
  it("loads Access and database settings from env_file without explicit overrides", () => {
    const compose = parse(readFileSync(resolve(root, "docker-compose.portal.yml"), "utf8"));
    const portal = compose.services.portal;

    expect(portal.env_file).toEqual([".env", ".env.local"]);
    expect(Object.keys(portal.environment).filter(
      (key) => key.startsWith("ALLURA_CF_ACCESS_") || key === "DATABASE_URL",
    )).toEqual([]);
  });

  it("defines an isolated loopback portal service with production auth safeguards", () => {
    const composePath = resolve(root, "docker-compose.portal.yml");
    const manifest = readFileSync(composePath, "utf8");
    const selected = manifest.match(/dockerfile:\s*(\S+)/)?.[1];
    expect(selected).toBe("Dockerfile.portal");
    const dockerfilePath = resolve(root, selected!);

    expect(existsSync(composePath)).toBe(true);
    expect(existsSync(dockerfilePath)).toBe(true);

    const compose = readFileSync(composePath, "utf8");
    expect(compose).toContain("portal:");
    expect(compose).toContain("127.0.0.1:3200:3200");
    expect(compose).toContain("NODE_ENV: production");
    expect(compose).toContain('ALLURA_DEV_AUTH_ENABLED: "false"');
    expect(compose).toContain("knowledge-network");
    expect(compose).toContain("/api/health/ready");

    const dockerignore = readFileSync(resolve(root, ".dockerignore"), "utf8").split(/\r?\n/);
    expect(dockerignore).toContain(".opencode");
    expect(dockerignore).toContain(".claude");

    const dockerfile = readFileSync(dockerfilePath, "utf8");
    expect(compose).toContain('ALLURA_MCP_BASE_URL: "http://allura-memory-mcp:3201"');
    expect(dockerfile).toContain("RUN bun install --frozen-lockfile");
    expect(dockerfile).toContain("RUN bun run build");
    expect(dockerfile).toContain("COPY --from=builder /app/public ./public");
    expect(dockerfile).toContain("COPY --from=builder /app/.next/static ./.next/static");
    expect(dockerfile).toContain("COPY --from=builder /app/.next/standalone ./");
    expect(dockerfile).toContain("server.js");
    expect(dockerfile).toContain("EXPOSE 3200");
  });
});
