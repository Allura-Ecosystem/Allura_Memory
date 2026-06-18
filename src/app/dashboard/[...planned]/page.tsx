import type { Metadata } from "next"
import { headers } from "next/headers"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"

export const metadata: Metadata = {
  title: "Planned Surface — Allura Memory",
}

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ planned: string[] }>
}

export default async function PlannedPage({ params }: PageProps) {
  const { planned } = await params
  const requestedPath = "/dashboard/" + (planned ?? []).join("/")

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
      style={{
        padding: "32px",
        fontFamily: '"IBM Plex Sans", sans-serif',
        background: "#faf7f0",
        minHeight: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e8e3d8",
          borderRadius: 14,
          padding: "40px 40px",
          maxWidth: 560,
          width: "100%",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "rgba(234,88,12,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          Surface planned — not yet wired
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#6b7280",
            margin: "0 0 24px",
            lineHeight: 1.6,
          }}
        >
          This navigation item is part of the Memory Command Center taxonomy but has not been
          implemented yet. Live data will appear here when the surface ships.
        </p>

        {/* Meta */}
        <div
          style={{
            background: "#faf7f0",
            border: "1px solid #e8e3d8",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 12,
          }}
        >
          <MetaRow label="path" value={requestedPath} />
          <MetaRow label="group_id" value={groupId} />
          <MetaRow label="status" value="planned" valueColor="#ea580c" />
        </div>
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  valueColor = "#374151",
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ color: "#9ca3af", minWidth: 70 }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
