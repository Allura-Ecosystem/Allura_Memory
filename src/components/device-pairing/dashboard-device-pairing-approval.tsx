interface DashboardDevicePairingApprovalProps {
  enrollment_transaction_id: string
  pkce_state: string
}

export function DashboardDevicePairingApproval({
  enrollment_transaction_id,
  pkce_state,
}: DashboardDevicePairingApprovalProps): React.ReactElement {
  return (
    <form method="post" action="/dashboard/device-pairing/approve">
      <input type="hidden" name="txn" value={enrollment_transaction_id} />
      <input type="hidden" name="state" value={pkce_state} />
      <button type="submit">Approve</button>
    </form>
  )
}
