import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockApproveEnrollment, mockGetAppPool } = vi.hoisted(() => ({
  mockApproveEnrollment: vi.fn(),
  mockGetAppPool: vi.fn(),
}));

vi.mock("@/lib/postgres/connection", () => ({
  getAppPool: mockGetAppPool,
}));

vi.mock("@/lib/device-pairing/approval-service", () => ({
  approveEnrollment: mockApproveEnrollment,
  ApprovalError: class ApprovalError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  APPROVAL_ERROR_STATUS: {},
}));

import {
  POST,
  TEST_ONLY_APPROVAL_USER,
} from "@/app/api/device-pairing/test-approve/route";

describe("Story 29.20 — test-only approval route", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mockGetAppPool.mockReturnValue({ pool: "test" });
    mockApproveEnrollment.mockResolvedValue({
      enrollment_transaction_id: "enroll_b1",
      status: "APPROVED",
      authorization_code: "code_b1",
      code_expires_at: "2026-09-12T00:00:00.000Z",
      completion_nonce: "nonce_b1",
      completion_nonce_expires_at: "2026-09-12T00:00:00.000Z",
      callback: {
        type: "deep_link",
        url: "allura-pairing://complete?code=code_b1",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    const env = process.env as Record<string, string | undefined>;
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  });

  it("accepts native form fields and redirects the fixed-human approval callback without a response body", async () => {
    const response = await POST(new NextRequest("http://localhost/api/device-pairing/test-approve", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ txn: "enroll_b1", state: "state_b1" }),
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("allura-pairing://complete?code=code_b1");
    expect(await response.text()).toBe("");
    expect(mockApproveEnrollment).toHaveBeenCalledWith(
      { pool: "test" },
      {
        enrollment_transaction_id: "enroll_b1",
        pkce_state: "state_b1",
        authUser: TEST_ONLY_APPROVAL_USER,
      },
    );
  });

  it("is unreachable outside the test runtime and does not touch approval services", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/test-approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrollment_transaction_id: "enroll_b1",
        pkce_state: "state_b1",
      }),
    }));

    expect(response.status).toBe(404);
    expect(mockApproveEnrollment).not.toHaveBeenCalled();
    expect(mockGetAppPool).not.toHaveBeenCalled();
  });
});
