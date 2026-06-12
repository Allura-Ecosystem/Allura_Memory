/**
 * RouteContractSurface: canonical Mission Control route surface.
 *
 * Story 11.5 / 13.1: One typed adapter registry drives navigation, tests, and
 * deep links. Each canonical route renders this surface, which reads its
 * declaration from the adapter registry (the single source of truth) rather
 * than a hardcoded per-page route list.
 *
 * Conceptual integrity: this surface is HONEST. It declares the route's
 * system-of-record, read/write policy, degradation behavior, and freshness.
 * Freshness is reported as `unknown` because the live operational data is
 * served by the dashboard implementation linked below; this page is the
 * contract anchor, not a fabricated operational dashboard.
 */

import Link from "next/link"

import { createDefaultRegistry, getAdapterByRoute } from "@/lib/adapter-registry/registry"
import type { AdapterDeclaration } from "@/lib/adapter-registry/types"

/**
 * Maps a canonical registry route to its live dashboard implementation.
 * Kept here (not per-page) so the mapping is declared once.
 */
const LIVE_SURFACE_BY_ROUTE: Record<string, string> = {
  "/command": "/dashboard/mission-control",
  "/work-board": "/dashboard/kanban",
  "/allura": "/dashboard/search",
  "/resources": "/dashboard",
  "/agents": "/dashboard/teams",
  "/telemetry": "/dashboard/graph",
}

function FreshnessBadge({ behavior }: { behavior: AdapterDeclaration["degradation_behavior"] }): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "#92400e",
        background: "#fef3c7",
        borderRadius: 6,
        padding: "2px 8px",
      }}
      // Freshness is unknown at the contract anchor; degradation policy declares
      // how the live surface must behave when its source is unavailable.
      title={`Degradation behavior: ${behavior}`}
    >
      freshness: unknown
    </span>
  )
}

export function RouteContractSurface({ route }: { route: string }): React.ReactElement {
  const registry = createDefaultRegistry()
  const adapter = getAdapterByRoute(registry, route)

  if (!adapter) {
    // Degraded state: the route exists but has no adapter declaration.
    return (
      <main style={{ padding: 32, maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#991b1b" }}>Route contract missing</h1>
        <p style={{ color: "#374151" }}>
          No adapter declaration exists for <code>{route}</code>. This route cannot resolve a
          system-of-record and is reported as degraded.
        </p>
      </main>
    )
  }

  const liveSurface = LIVE_SURFACE_BY_ROUTE[route]

  return (
    <main style={{ padding: 32, maxWidth: 720 }} data-route={route} data-source={adapter.system_of_record}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>{adapter.display_name}</h1>
        <FreshnessBadge behavior={adapter.degradation_behavior} />
      </div>

      <p style={{ color: "#6b7280", fontSize: 14, marginTop: 0 }}>
        Canonical route <code>{adapter.route}</code> | system of record{" "}
        <strong>{adapter.system_of_record}</strong>
      </p>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "8px 16px",
          fontSize: 14,
          color: "#374151",
          margin: "20px 0",
        }}
      >
        <dt style={{ fontWeight: 600 }}>Read policy</dt>
        <dd style={{ margin: 0 }}>
          {adapter.read_policy.type} | min role {adapter.read_policy.min_role}
        </dd>
        <dt style={{ fontWeight: 600 }}>Write policy</dt>
        <dd style={{ margin: 0 }}>
          {adapter.write_policy.type} | min role {adapter.write_policy.min_role}
          {adapter.write_policy.audit ? " | audited" : ""}
        </dd>
        <dt style={{ fontWeight: 600 }}>Degradation</dt>
        <dd style={{ margin: 0 }}>{adapter.degradation_behavior}</dd>
        <dt style={{ fontWeight: 600 }}>Memory scope</dt>
        <dd style={{ margin: 0 }}>{adapter.memory_scope}</dd>
      </dl>

      {liveSurface ? (
        <Link
          href={liveSurface}
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Open live surface
        </Link>
      ) : null}
    </main>
  )
}
