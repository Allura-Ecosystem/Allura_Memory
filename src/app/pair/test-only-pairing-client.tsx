export function TestOnlyPairingClient({
  enrollmentTransactionId,
  pkceState,
}: {
  enrollmentTransactionId: string;
  pkceState: string;
}) {
  return (
    <main>
      <h1>Allura test device pairing</h1>
      <form method="post" action="/api/device-pairing/test-approve">
        <input type="hidden" name="txn" value={enrollmentTransactionId} />
        <input type="hidden" name="state" value={pkceState} />
        <button type="submit" disabled={!enrollmentTransactionId || !pkceState}>
          Approve test device
        </button>
      </form>
    </main>
  );
}
