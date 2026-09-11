export const B1_NOT_PROCURED = "B1_NOT_PROCURED" as const;

const requiredInputs = [
  "ALLURA_CLERK_TEST_INSTANCE_URL",
  "ALLURA_CLERK_TEST_TOKEN",
  "ALLURA_E2E_BASE_URL",
  "ALLURA_E2E_PAIRING_BROWSER_URL",
  "ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID",
  "ALLURA_E2E_DEVICE_AUTH_ORIGIN",
  "ALLURA_E2E_DEVICE_AUTH_AUDIENCE",
] as const;

type RequiredInput = (typeof requiredInputs)[number];

export type ClerkPairingE2eInputs = Partial<Record<RequiredInput, string | undefined>>;

export type ClerkPairingE2eReadiness =
  | {
      readonly ready: false;
      readonly code: typeof B1_NOT_PROCURED;
      readonly reason: string;
    }
  | {
      readonly ready: true;
      readonly config: {
        readonly clerkTestInstanceUrl: string;
        readonly clerkTestToken: string;
        readonly e2eBaseUrl: string;
        readonly pairingBrowserUrl: string;
        readonly expectedHumanPrincipalId: string;
        readonly deviceAuthOrigin: string;
        readonly deviceAuthAudience: string;
      };
    };

export type PlaywrightCapability = {
  open(): Promise<{
    browser: import("@playwright/test").Browser;
    page: import("@playwright/test").Page;
    close(): Promise<void>;
  }>;
};

export function createPlaywrightCapability(
  readiness: ClerkPairingE2eReadiness,
): PlaywrightCapability | null {
  if (!readiness.ready) {
    return null;
  }

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
  if (!readiness.ready) {
    return readiness.reason;
  }

  return "B1_READY: Clerk test instance and pairing browser surface configured";
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
  },
): ClerkPairingE2eReadiness {
  const missing = requiredInputs.filter((name) => !inputs[name]?.trim());
  if (missing.length > 0) {
    return {
      ready: false,
      code: B1_NOT_PROCURED,
      reason: `${B1_NOT_PROCURED}: missing ${missing.join(", ")}`,
    };
  }

  return {
    ready: true,
    config: {
      clerkTestInstanceUrl: inputs.ALLURA_CLERK_TEST_INSTANCE_URL!.trim(),
      clerkTestToken: inputs.ALLURA_CLERK_TEST_TOKEN!.trim(),
      e2eBaseUrl: inputs.ALLURA_E2E_BASE_URL!.trim(),
      pairingBrowserUrl: inputs.ALLURA_E2E_PAIRING_BROWSER_URL!.trim(),
      expectedHumanPrincipalId: inputs.ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID!.trim(),
      deviceAuthOrigin: inputs.ALLURA_E2E_DEVICE_AUTH_ORIGIN!.trim(),
      deviceAuthAudience: inputs.ALLURA_E2E_DEVICE_AUTH_AUDIENCE!.trim(),
    },
  };
}
