export enum DevicePairingErrorCode {
  AUTH_INVALID = "AUTH_INVALID",
  KEY_EXPIRED = "KEY_EXPIRED",
  MEMBERSHIP_INACTIVE = "MEMBERSHIP_INACTIVE",
  WORKSPACE_LOCKED = "WORKSPACE_LOCKED",
  WORKSPACE_NOT_FOUND = "WORKSPACE_NOT_FOUND",
  DEVICE_NOT_APPROVED = "DEVICE_NOT_APPROVED",
  AUTH_EXPIRED = "AUTH_EXPIRED",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_CHALLENGE_REQUEST = "INVALID_CHALLENGE_REQUEST",
  PURPOSE_NOT_AVAILABLE = "PURPOSE_NOT_AVAILABLE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export type DevicePairingRecoveryAction = "retry" | "re_pair" | "clerk_required";

export interface DevicePairingRecovery {
  recovery_action: DevicePairingRecoveryAction;
  retry_after_ms: number;
}

const retryAfterMs = 1_000;

const recoveryByCode: Record<DevicePairingErrorCode, DevicePairingRecovery> = {
  [DevicePairingErrorCode.AUTH_INVALID]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.KEY_EXPIRED]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.MEMBERSHIP_INACTIVE]: { recovery_action: "clerk_required", retry_after_ms: 0 },
  [DevicePairingErrorCode.WORKSPACE_LOCKED]: { recovery_action: "clerk_required", retry_after_ms: 0 },
  [DevicePairingErrorCode.WORKSPACE_NOT_FOUND]: { recovery_action: "clerk_required", retry_after_ms: 0 },
  [DevicePairingErrorCode.DEVICE_NOT_APPROVED]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.AUTH_EXPIRED]: { recovery_action: "retry", retry_after_ms: 0 },
  [DevicePairingErrorCode.INVALID_REQUEST]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.INVALID_CHALLENGE_REQUEST]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.PURPOSE_NOT_AVAILABLE]: { recovery_action: "re_pair", retry_after_ms: 0 },
  [DevicePairingErrorCode.INTERNAL_ERROR]: { recovery_action: "retry", retry_after_ms: retryAfterMs },
};

export function getDevicePairingRecovery(code: DevicePairingErrorCode): DevicePairingRecovery {
  return recoveryByCode[code];
}

export function devicePairingErrorResponse(
  code: DevicePairingErrorCode,
  message?: string,
  responseError: string = code,
) {
  return {
    error: responseError,
    ...(message === undefined ? {} : { message }),
    ...getDevicePairingRecovery(code),
  };
}
