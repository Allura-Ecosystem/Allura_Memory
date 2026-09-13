import { notFound } from "next/navigation";

import { TestOnlyPairingClient } from "./test-only-pairing-client";

function isLocalTestPairingRuntime(): boolean {
  return process.env.NODE_ENV === "test"
    || (process.env.NODE_ENV === "development" && process.env.ALLURA_LOCAL_TEST_PAIRING_RUNTIME === "true");
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ txn?: string; state?: string }>;
}) {
  // This local E2E browser surface deliberately has no production behavior.
  if (!isLocalTestPairingRuntime()) notFound();

  const params = await searchParams;
  return <TestOnlyPairingClient enrollmentTransactionId={params.txn ?? ""} pkceState={params.state ?? ""} />;
}
