import type { Metadata } from "next"
import React from "react"
import { headers } from "next/headers"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"
import KnowledgeGraphCards from "./knowledge-graph-cards"

export const metadata: Metadata = {
  title: "Knowledge Graph — Allura Memory",
}

export const dynamic = "force-dynamic"

export default async function KnowledgeGraphPage(): Promise<React.ReactElement> {
  const headersList = await headers()
  const rawGroupId = headersList.get("x-allura-group-id") ?? "allura-system"

  let groupId = "allura-system"
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
  }

  return (
    <div
      className="page-enter"
      style={{
        padding: "28px 30px 60px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--c-ink)",
            }}
          >
            Knowledge Graph
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" }}>
            The Knowledge Hive. Every card is a thing Allura knows about. Lines show how they are connected and governed.
          </p>
        </div>
      </div>

      {/* The interactive three-column Knowledge Hive */}
      <KnowledgeGraphCards groupId={groupId} />
    </div>
  )
}
