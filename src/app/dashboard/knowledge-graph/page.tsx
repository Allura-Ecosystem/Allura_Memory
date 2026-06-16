import type { Metadata } from "next"
import { headers } from "next/headers"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"
import KnowledgeGraphCards from "./knowledge-graph-cards"

export const metadata: Metadata = {
  title: "Knowledge Graph — Allura Memory",
}

export const dynamic = "force-dynamic"

export default async function KnowledgeGraphPage() {
  const headersList = await headers()
  const rawGroupId = headersList.get("x-allura-group-id") ?? "allura-system"

  let groupId = "allura-system"
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
    // fall back to allura-system
  }

  return (
    <div
      style={{
        padding: "32px",
        fontFamily: '"IBM Plex Sans", sans-serif',
        background: "#faf7f0",
        minHeight: "100%",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#7c3aed",
            margin: "0 0 4px",
          }}
        >
          Memory
        </p>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          Knowledge Graph
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px", lineHeight: 1.6 }}>
          How your memories connect — a visual map of the people, projects, and ideas your agents have learned about.
        </p>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          Organization: <strong style={{ color: "#374151" }}>{groupId}</strong> · each card is a real graph node
        </p>
      </div>

      <KnowledgeGraphCards groupId={groupId} />
    </div>
  )
}
