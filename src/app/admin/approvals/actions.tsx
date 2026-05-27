"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ActionButtonsProps {
  proposalId: string;
  groupId: string;
}

export function ActionButtons({ proposalId, groupId }: ActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAction(decision: "approve" | "reject") {
    setLoading(decision);
    setError(null);
    try {
      const res = await fetch("/api/curator/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          group_id: groupId,
          decision,
          rationale: decision === "approve" ? "Admin UI approved proposal" : "Admin UI rejected proposal",
          curator_id: "admin-ui",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed: ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <button
        onClick={() => handleAction("approve")}
        disabled={loading !== null}
      >
        {loading === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={loading !== null}
      >
        {loading === "reject" ? "Rejecting..." : "Reject"}
      </button>
      {error && <div>{error}</div>}
    </div>
  );
}
