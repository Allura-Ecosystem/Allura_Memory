import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { computeContentDigest, verifyContentDigest } from "../rfc9421";

describe("Story 29.2 Content-Digest (RFC 9530)", () => {
  it("computeContentDigest produces sha-256=:<standard base64>: format", () => {
    const body = Buffer.from('{"device_id":"dev_abc"}');
    const digest = computeContentDigest(body);

    // RFC 9530 syntax: sha-256=:<base64>:
    expect(digest).toMatch(/^sha-256=:([A-Za-z0-9+/]+={0,2}):$/);

    // The base64 portion must be standard base64, not base64url
    const b64Part = digest.slice("sha-256=:".length, -1);
    expect(b64Part).not.toContain("-");
    expect(b64Part).not.toContain("_");

    // Verify the digest matches SHA-256 of the body
    const expected = createHash("sha256").update(body).digest("base64");
    expect(b64Part).toBe(expected);
  });

  it("verifyContentDigest accepts a correct digest", () => {
    const body = Buffer.from('{"device_id":"dev_abc"}');
    const digest = computeContentDigest(body);
    expect(verifyContentDigest(body, digest)).toBe(true);
  });

  it("verifyContentDigest rejects a body-swap (MITM)", () => {
    const originalBody = Buffer.from('{"device_id":"dev_abc"}');
    const swappedBody = Buffer.from('{"device_id":"dev_evil"}');
    const digest = computeContentDigest(originalBody);
    expect(verifyContentDigest(swappedBody, digest)).toBe(false);
  });

  it("verifyContentDigest rejects a malformed digest header", () => {
    const body = Buffer.from("{}");
    expect(verifyContentDigest(body, "not-a-digest")).toBe(false);
    expect(verifyContentDigest(body, "sha-256=:garbage==:")).toBe(false);
    expect(verifyContentDigest(body, "")).toBe(false);
  });

  it("verifyContentDigest rejects an unsupported hash algorithm token", () => {
    const body = Buffer.from("{}");
    const sha1 = createHash("sha1").update(body).digest("base64");
    expect(verifyContentDigest(body, `sha-1=:${sha1}:`)).toBe(false);
  });

  it("computeContentDigest is deterministic for the same body", () => {
    const body = Buffer.from("hello world");
    expect(computeContentDigest(body)).toBe(computeContentDigest(body));
  });
});