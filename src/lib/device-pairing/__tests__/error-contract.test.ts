import { describe, expect, it } from "vitest";
import {
  DevicePairingErrorCode,
  getDevicePairingRecovery,
} from "@/lib/device-pairing/error-codes";

describe("Story 29.11 — device pairing error contract", () => {
  it.each([
    [DevicePairingErrorCode.AUTH_INVALID, "re_pair"],
    [DevicePairingErrorCode.KEY_EXPIRED, "re_pair"],
    [DevicePairingErrorCode.MEMBERSHIP_INACTIVE, "clerk_required"],
    [DevicePairingErrorCode.WORKSPACE_LOCKED, "clerk_required"],
    [DevicePairingErrorCode.WORKSPACE_NOT_FOUND, "clerk_required"],
    [DevicePairingErrorCode.DEVICE_NOT_APPROVED, "re_pair"],
    [DevicePairingErrorCode.AUTH_EXPIRED, "retry"],
    [DevicePairingErrorCode.INVALID_REQUEST, "re_pair"],
    [DevicePairingErrorCode.INVALID_CHALLENGE_REQUEST, "re_pair"],
    [DevicePairingErrorCode.PURPOSE_NOT_AVAILABLE, "re_pair"],
    [DevicePairingErrorCode.INTERNAL_ERROR, "retry"],
  ] as const)("maps §4.x %s to %s with bounded retry guidance", (code, recoveryAction) => {
    const recovery = getDevicePairingRecovery(code);

    expect(recovery.recovery_action).toBe(recoveryAction);
    expect(recovery.retry_after_ms).toBeGreaterThanOrEqual(0);
    expect(recovery.retry_after_ms).toBeLessThanOrEqual(30_000);
  });

  it("uses retry only for recoverable, non-Clerk failure states", () => {
    const retryCodes = Object.values(DevicePairingErrorCode).filter(
      (code) => getDevicePairingRecovery(code).recovery_action === "retry",
    );

    expect(retryCodes).toEqual([
      DevicePairingErrorCode.AUTH_EXPIRED,
      DevicePairingErrorCode.INTERNAL_ERROR,
    ]);
  });
});
