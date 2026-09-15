export const B1_NOT_PROCURED = "B1_NOT_PROCURED" as const;

const clerkInputs = [
  "ALLURA_CLERK_TEST_INSTANCE_URL",
  "ALLURA_CLERK_TEST_TOKEN",
  "ALLURA_E2E_BASE_URL",
  "ALLURA_E2E_PAIRING_BROWSER_URL",
  "ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID",
  "ALLURA_E2E_DEVICE_AUTH_ORIGIN",
  "ALLURA_E2E_DEVICE_AUTH_AUDIENCE",
] as const;

const testOnlyInputs = [
  "ALLURA_E2E_BASE_URL",
  "ALLURA_E2E_DEVICE_AUTH_ORIGIN",
  "ALLURA_E2E_DEVICE_AUTH_AUDIENCE",
] as const;

const _inputNames = [
  ...clerkInputs,
  "ALLURA_E2E_APPROVAL_MODE",
] as const;

type InputName = (typeof _inputNames)[number];
type ApprovalMode = "clerk" | "test_only";

export type ClerkPairingE2eInputs = Partial<Record<InputName, string | undefined>>;

type E2eCommonConfig = {
  readonly e2eBaseUrl: string;
  readonly pairingBrowserUrl: string;
  readonly deviceAuthOrigin: string;
  readonly deviceAuthAudience: string;
};

export type ClerkPairingE2eReadiness =
  | {
      readonly ready: false;
      readonly code: typeof B1_NOT_PROCURED;
      readonly reason: string;
    }
  | {
      readonly ready: true;
      readonly config: E2eCommonConfig & {
        readonly approvalMode: "clerk";
        readonly clerkTestInstanceUrl: string;
        readonly clerkTestToken: string;
        readonly expectedHumanPrincipalId: string;
      };
    }
  | {
      readonly ready: true;
      readonly config: E2eCommonConfig & {
        readonly approvalMode: "test_only";
      };
    };

export type PlaywrightCapability = {
  open(): Promise<{
    browser: import("@playwright/test").Browser;
    page: import("@playwright/test").Page;
    close(): Promise<void>;
  }>;
};

function missingInputs(inputs: ClerkPairingE2eInputs, names: readonly InputName[]): InputName[] {
  return names.filter((name) => !inputs[name]?.trim());
}

function unavailable(missing: readonly InputName[]): ClerkPairingE2eReadiness {
  return {
    ready: false,
    code: B1_NOT_PROCURED,
    reason: `${B1_NOT_PROCURED}: missing ${missing.join(", ")}`,
  };
}

export function createPlaywrightCapability(
  readiness: ClerkPairingE2eReadiness,
): PlaywrightCapability | null {
  if (!readiness.ready) return null;

  return {
    async open() {
      const { chromium } = await import("@playwright/test");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      return {
        browser,
        page,
        close: async () => browser.close(),
      };
    },
  };
}

export function describeClerkPairingE2eReadiness(
  readiness: ClerkPairingE2eReadiness,
): string {
  if (!readiness.ready) return readiness.reason;
  return readiness.config.approvalMode === "test_only"
    ? "B1_READY: local test-only pairing browser surface configured"
    : "B1_READY: Clerk test instance and pairing browser surface configured";
}

export function inspectClerkPairingE2eReadiness(
  inputs: ClerkPairingE2eInputs = {
    ALLURA_CLERK_TEST_INSTANCE_URL: process.env.ALLURA_CLERK_TEST_INSTANCE_URL,
    ALLURA_CLERK_TEST_TOKEN: process.env.ALLURA_CLERK_TEST_TOKEN,
    ALLURA_E2E_BASE_URL: process.env.ALLURA_E2E_BASE_URL,
    ALLURA_E2E_PAIRING_BROWSER_URL: process.env.ALLURA_E2E_PAIRING_BROWSER_URL,
    ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID: process.env.ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID,
    ALLURA_E2E_DEVICE_AUTH_ORIGIN: process.env.ALLURA_E2E_DEVICE_AUTH_ORIGIN,
    ALLURA_E2E_DEVICE_AUTH_AUDIENCE: process.env.ALLURA_E2E_DEVICE_AUTH_AUDIENCE,
    ALLURA_E2E_APPROVAL_MODE: process.env.ALLURA_E2E_APPROVAL_MODE,
  },
): ClerkPairingE2eReadiness {
  const requestedMode = inputs.ALLURA_E2E_APPROVAL_MODE?.trim() || "clerk";
  if (requestedMode !== "clerk" && requestedMode !== "test_only") {
    return unavailable(["ALLURA_E2E_APPROVAL_MODE"]);
  }
  const approvalMode: ApprovalMode = requestedMode;
  const missing = missingInputs(
    inputs,
    approvalMode === "clerk" ? clerkInputs : testOnlyInputs,
  );
  if (missing.length > 0) return unavailable(missing);

  const common: E2eCommonConfig = {
    e2eBaseUrl: inputs.ALLURA_E2E_BASE_URL!.trim(),
    pairingBrowserUrl: approvalMode === "test_only"
      ? new URL("/pair", inputs.ALLURA_E2E_BASE_URL!.trim()).toString()
      : inputs.ALLURA_E2E_PAIRING_BROWSER_URL!.trim(),
    deviceAuthOrigin: inputs.ALLURA_E2E_DEVICE_AUTH_ORIGIN!.trim(),
    deviceAuthAudience: inputs.ALLURA_E2E_DEVICE_AUTH_AUDIENCE!.trim(),
  };

  if (approvalMode === "test_only") {
    return { ready: true, config: { ...common, approvalMode } };
  }
  return {
    ready: true,
    config: {
      ...common,
      approvalMode,
      clerkTestInstanceUrl: inputs.ALLURA_CLERK_TEST_INSTANCE_URL!.trim(),
      clerkTestToken: inputs.ALLURA_CLERK_TEST_TOKEN!.trim(),
      expectedHumanPrincipalId: inputs.ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID!.trim(),
    },
  };
}
