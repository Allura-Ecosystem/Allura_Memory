import { describe, expect, it } from "vitest";
import { resolveRequestCorrelationId } from "../mcp-authenticator";

describe("HTTP request correlation", () => {
  it("prefers the protocol session id when present", () => {
    expect(resolveRequestCorrelationId({ "mcp-session-id": "mcp-session-1", "x-request-id": "req-1" })).toBe(
      "mcp-session-1",
    );
  });

  it("uses a request id before generating a fallback", () => {
    expect(resolveRequestCorrelationId({ "x-request-id": "req-1" })).toBe("req-1");
  });

  it("does not accept an empty correlation header", () => {
    expect(resolveRequestCorrelationId({ "mcp-session-id": "", "x-request-id": "" })).toBeNull();
  });

  it("falls back to the JSON-RPC request id when the gateway has no correlation header", () => {
    expect(resolveRequestCorrelationId({}, "json-rpc-42")).toBe("json-rpc-42");
  });
});
