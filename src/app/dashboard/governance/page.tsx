"use client"

import {
  AlertCircle,
  CheckCircle,
  FileText,
  Link2,
  Moon,
  Shield,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import type { ComponentType, CSSProperties } from "react"

type TabId = "overview" | "policy-gates" | "evidence-chains" | "access-reviews" | "reports"

interface StatCard {
  label: string
  value: string
  trend: string
  iconBg: string
  icon: ComponentType<{ size?: number; style?: CSSProperties }>
}

const statCards: StatCard[] = [
  { label: "Policies enforced", value: "128", trend: "+14%", iconBg: "#eff6ff", icon: FileText },
  { label: "Policy checks", value: "1,842", trend: "+12%", iconBg: "#eff6ff", icon: Shield },
  { label: "Violations detected", value: "18", trend: "+8%", iconBg: "#fff7ed", icon: AlertCircle },
  { label: "Approved changes", value: "96", trend: "+16%", iconBg: "#f0fdf4", icon: CheckCircle },
  { label: "Evidence chains", value: "2,731", trend: "+18%", iconBg: "#1a1a1a", icon: Link2 },
]

interface PendingReview {
  icon: "moon" | "shield"
  item: string
  type: string
  scope: string
  submitted: string
  risk: "High" | "Medium" | "Low"
}

const pendingReviews: PendingReview[] = [
  { icon: "moon", item: "Memory Consolidation Run", type: "Promotion", scope: "allura-system", submitted: "2h ago", risk: "Medium" },
  { icon: "shield", item: "Agent Boundary Update", type: "Contract", scope: "allura-agents", submitted: "4h ago", risk: "High" },
  { icon: "moon", item: "Dream Insight Export", type: "Export", scope: "allura-system", submitted: "6h ago", risk: "Low" },
  { icon: "shield", item: "Policy Gate Override", type: "Override", scope: "allura-ops", submitted: "1d ago", risk: "High" },
  { icon: "moon", item: "Memory Deduplication", type: "Promotion", scope: "allura-system", submitted: "1d ago", risk: "Medium" },
]

interface PolicyCheck {
  check: string
  policy: string
  scope: string
  result: "Passed" | "Failed"
  checked: string
}

const policyChecks: PolicyCheck[] = [
  { check: "group_id invariant", policy: "Tenant Isolation", scope: "allura-system", result: "Passed", checked: "5m ago" },
  { check: "SUPERSEDES chain", policy: "Neo4j Versioning", scope: "allura-system", result: "Passed", checked: "12m ago" },
  { check: "HITL gate required", policy: "Promotion Policy", scope: "allura-agents", result: "Passed", checked: "1h ago" },
  { check: "Append-only trace", policy: "Episodic Integrity", scope: "allura-system", result: "Failed", checked: "2h ago" },
  { check: "Budget circuit breaker", policy: "Runaway Prevention", scope: "allura-ops", result: "Passed", checked: "3h ago" },
]

interface EvidenceChain {
  name: string
  subtitle: string
  links: number
}

const evidenceChains: EvidenceChain[] = [
  { name: "Memory Promotion Chain", subtitle: "allura-system · curator", links: 12 },
  { name: "Agent Contract Lineage", subtitle: "allura-agents · brooks", links: 8 },
  { name: "Policy Enforcement Trail", subtitle: "allura-ops · governance", links: 21 },
  { name: "Dream Insight Provenance", subtitle: "allura-system · dreams", links: 6 },
  { name: "Audit Access Log Chain", subtitle: "allura-system · audit", links: 34 },
]

function RiskDot({ risk }: { risk: PendingReview["risk"] }) {
  const colors: Record<PendingReview["risk"], string> = {
    High: "#dc2626",
    Medium: "#ea580c",
    Low: "#16a34a",
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[risk], display: "inline-block" }} />
      {risk}
    </span>
  )
}

function ResultBadge({ result }: { result: PolicyCheck["result"] }) {
  const isPassed = result === "Passed"
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 13,
        color: isPassed ? "#16a34a" : "#dc2626",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: isPassed ? "#16a34a" : "#dc2626",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {result}
    </span>
  )
}

// Simple donut chart via SVG
function DonutChart() {
  // 92% compliant, 6% warning, 2% violation
  const r = 54
  const cx = 70
  const cy = 70
  const circumference = 2 * Math.PI * r

  const compliantPct = 0.92
  const warningPct = 0.06
  // violation = 0.02

  const compliantDash = compliantPct * circumference
  const warningDash = warningPct * circumference
  const violationDash = 0.02 * circumference

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
      <svg width="140" height="140" viewBox="0 0 140 140" aria-label="Policy compliance donut chart">
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />

        {/* Compliant arc (green) */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#16a34a"
          strokeWidth="14"
          strokeDasharray={`${compliantDash} ${circumference - compliantDash}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* Warning arc (orange) */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#ea580c"
          strokeWidth="14"
          strokeDasharray={`${warningDash} ${circumference - warningDash}`}
          strokeDashoffset={-compliantDash + circumference * 0.25}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* Violation arc (red) */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#dc2626"
          strokeWidth="14"
          strokeDasharray={`${violationDash} ${circumference - violationDash}`}
          strokeDashoffset={-(compliantDash + warningDash) + circumference * 0.25}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* Center label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1a1a1a">
          92%
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#6b7280">
          Compliant
        </text>
      </svg>
    </div>
  )
}

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "policy-gates", label: "Policy Gates" },
  { id: "evidence-chains", label: "Evidence Chains" },
  { id: "access-reviews", label: "Access Reviews" },
  { id: "reports", label: "Reports" },
]

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview")

  return (
    <div style={{ minHeight: "100vh", background: "#f5f1e6", padding: "32px 32px 48px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={18} style={{ color: "#fff" }} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.02em" }}>
              Governance
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            Verify. Review. Approve. Full accountability for every memory and action.
          </p>
        </div>
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 13,
            fontWeight: 500,
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Governance History
        </button>
      </div>

      {/* Stat cards row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {statCards.map((card, i) => {
          const Icon = card.icon
          const iconColor = i === 2 ? "#ea580c" : i === 3 ? "#16a34a" : i === 4 ? "#fff" : "#2563eb"
          return (
            <div
              key={card.label}
              style={{
                flex: "1 1 160px",
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e8e3d8",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: card.iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={16} style={{ color: iconColor }} />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{card.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{card.value}</span>
                <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{card.trend}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>vs last 7 days</div>
            </div>
          )
        })}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #e8e3d8" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #2563eb" : "2px solid transparent",
              background: "transparent",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#2563eb" : "#6b7280",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-column content */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left ~60% */}
        <div style={{ flex: "3 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Pending Reviews table */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e3d8", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Pending Reviews</span>
              <Link href="#" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    {["ITEM", "TYPE", "SCOPE", "SUBMITTED", "RISK", ""].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingReviews.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < pendingReviews.length - 1 ? "1px solid #f9fafb" : "none" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {row.icon === "moon"
                            ? <Moon size={13} style={{ color: "#ea580c", flexShrink: 0 }} />
                            : <Shield size={13} style={{ color: "#2563eb", flexShrink: 0 }} />
                          }
                          <span style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 500, whiteSpace: "nowrap" }}>{row.item}</span>
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f3f4f6", color: "#374151", fontSize: 12 }}>{row.type}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>{row.scope}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{row.submitted}</td>
                      <td style={{ padding: "10px 12px" }}><RiskDot risk={row.risk} /></td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          type="button"
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            background: "#fff",
                            fontSize: 12,
                            color: "#374151",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Policy Checks table */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e3d8", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Recent Policy Checks</span>
              <Link href="#" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    {["CHECK", "POLICY", "SCOPE", "RESULT", "CHECKED"].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {policyChecks.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < policyChecks.length - 1 ? "1px solid #f9fafb" : "none" }}>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "#1a1a1a", fontWeight: 500, whiteSpace: "nowrap" }}>{row.check}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f3f4f6", color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{row.policy}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>{row.scope}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}><ResultBadge result={row.result} /></td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{row.checked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right ~40% */}
        <div style={{ flex: "2 1 0", minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Policy Compliance card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e3d8", padding: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Policy Compliance</h3>
            <DonutChart />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {[
                { color: "#16a34a", label: "Compliant", pct: "92%" },
                { color: "#ea580c", label: "Warning", pct: "6%" },
                { color: "#dc2626", label: "Violation", pct: "2%" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{item.pct}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              Based on 1,842 checks in the last 7 days. Violations require immediate review.
            </p>
          </div>

          {/* Evidence Chains card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e3d8", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Evidence Chains</span>
              <Link href="#" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ padding: "4px 0" }}>
              {evidenceChains.map((chain, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    borderBottom: i < evidenceChains.length - 1 ? "1px solid #f9fafb" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Link2 size={13} style={{ color: "#6b7280" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a", lineHeight: 1.2 }}>{chain.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chain.subtitle}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" }}>{chain.links} links</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
