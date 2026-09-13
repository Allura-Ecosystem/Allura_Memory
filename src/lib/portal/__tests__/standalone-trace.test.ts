import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

describe("standalone trace boundary", () => {
  it("excludes local authoring skills from the production api/skills bundle", () => {
    const config = readFileSync(resolve(root, "next.config.ts"), "utf8");

    expect(config).toContain('outputFileTracingExcludes');
    expect(config).toContain('"/api/skills"');
    expect(config).toContain('"./.opencode/skills/**/*"');
    expect(config).toContain('"./.claude/skills/**/*"');
  });
});
