import { beforeAll, describe, expect, it } from "vitest";
import { generateToken, hashToken, prefixOf, verifyToken } from "./hash";

beforeAll(() => {
  process.env.ALLURA_MCP_TOKEN_SECRET = "test-secret-at-least-16-chars-long";
});

describe("mcp-token/hash", () => {
  it("hashToken is deterministic for the same secret", () => {
    expect(hashToken("allura_mcp_abc")).toBe(hashToken("allura_mcp_abc"));
  });

  it("generateToken produces a verifiable token whose raw is never the stored hash", () => {
    const { raw, prefix, hash } = generateToken();
    expect(raw.startsWith("allura_mcp_")).toBe(true);
    expect(prefix.startsWith("allura_mcp_")).toBe(true);
    expect(hash).not.toContain(raw);
    expect(verifyToken(raw, hash)).toBe(true);
  });

  it("verifyToken rejects a tampered token", () => {
    const { raw, hash } = generateToken();
    expect(verifyToken(raw + "x", hash)).toBe(false);
    expect(verifyToken("allura_mcp_not-the-token", hash)).toBe(false);
  });

  it("prefixOf derives the same prefix used at mint time", () => {
    const { raw, prefix } = generateToken();
    expect(prefixOf(raw)).toBe(prefix);
  });

  it("throws when the server secret is missing or too short", () => {
    const saved = process.env.ALLURA_MCP_TOKEN_SECRET;
    process.env.ALLURA_MCP_TOKEN_SECRET = "short";
    expect(() => hashToken("x")).toThrow(/ALLURA_MCP_TOKEN_SECRET/);
    process.env.ALLURA_MCP_TOKEN_SECRET = saved;
  });
});
