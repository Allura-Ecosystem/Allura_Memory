"use client";

import { useCallback, useEffect, useState } from "react";

interface Workspace {
  workspace_id: string;
  group_id: string;
  name: string;
  lock_mode: string;
}
interface TokenRow {
  id: string;
  agent_name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
}
interface AuditRow {
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const SCOPE_CHOICES = ["memory:read", "memory:write", "memory:promote", "receipt:create", "review:read", "review:approve"];

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8e3d8", borderRadius: 12, padding: 20, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#1a1a1a", margin: "0 0 12px" };
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" });
const input: React.CSSProperties = { border: "1px solid #d6cfc0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginRight: 8 };

export default function GuardClient({ groupId, activeWorkspaceId }: { groupId: string; activeWorkspaceId: string | null }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<string | null>(activeWorkspaceId);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [newWsName, setNewWsName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["memory:read", "memory:write"]);
  const [mintedRaw, setMintedRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    const r = await fetch("/api/workspaces");
    const d = await r.json();
    const ws: Workspace[] = d.workspaces ?? [];
    setWorkspaces(ws);
    if (!selected && ws.length > 0) setSelected(ws[0].workspace_id);
  }, [selected]);

  const loadTokens = useCallback(async (wsId: string) => {
    const r = await fetch(`/api/tokens?workspace_id=${encodeURIComponent(wsId)}`);
    const d = await r.json();
    setTokens(d.tokens ?? []);
  }, []);

  const loadAudit = useCallback(async () => {
    const r = await fetch("/api/audit/events?limit=50");
    if (!r.ok) return;
    const d = await r.json();
    const rows: AuditRow[] = (d.events ?? d.rows ?? []).filter((e: AuditRow) => e.event_type?.startsWith("mcp_gateway_"));
    setAudit(rows.slice(0, 15));
  }, []);

  useEffect(() => { void loadWorkspaces(); void loadAudit(); }, [loadWorkspaces, loadAudit]);
  useEffect(() => { if (selected) void loadTokens(selected); }, [selected, loadTokens]);

  async function createWorkspace() {
    setError(null);
    const r = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newWsName }) });
    if (!r.ok) { setError((await r.json()).error ?? "create failed"); return; }
    setNewWsName("");
    await loadWorkspaces();
  }

  async function mintToken() {
    setError(null);
    setMintedRaw(null);
    if (!selected) { setError("select a workspace first"); return; }
    const r = await fetch("/api/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: selected, agent_name: agentName, scopes }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "mint failed"); return; }
    setMintedRaw(d.token);
    setAgentName("");
    await loadTokens(selected);
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens/${id}/revoke`, { method: "POST" });
    if (selected) await loadTokens(selected);
  }

  return (
    <div style={{ padding: 24, maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Allura Guard</h1>
        <span style={{ fontSize: 12, color: "#6b7280" }}>MCP auth &amp; policy gateway</span>
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
        Active org: <code style={{ background: "#f0ece0", padding: "2px 6px", borderRadius: 4 }}>{groupId}</code>
      </p>

      {error && <div style={{ ...card, borderColor: "#fca5a5", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}

      {/* Workspaces */}
      <div style={card}>
        <h2 style={h2}>Workspaces</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {workspaces.map((w) => (
            <button key={w.workspace_id} onClick={() => setSelected(w.workspace_id)}
              style={{ border: selected === w.workspace_id ? "2px solid #ea580c" : "1px solid #e8e3d8", background: selected === w.workspace_id ? "#fff7ed" : "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
              {w.name} <span style={{ color: "#9ca3af", fontSize: 11 }}>· {w.lock_mode}</span>
            </button>
          ))}
          {workspaces.length === 0 && <span style={{ color: "#9ca3af", fontSize: 13 }}>No workspaces yet.</span>}
        </div>
        <input style={input} placeholder="New workspace name" value={newWsName} onChange={(e) => setNewWsName(e.target.value)} />
        <button style={btn("#1a1a1a")} onClick={createWorkspace} disabled={!newWsName}>Create workspace</button>
      </div>

      {/* Mint token */}
      <div style={card}>
        <h2 style={h2}>Mint MCP token</h2>
        <div style={{ marginBottom: 10 }}>
          <input style={input} placeholder="Agent name (e.g. claude)" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          <button style={btn("#ea580c")} onClick={mintToken} disabled={!agentName || !selected}>Mint</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {SCOPE_CHOICES.map((s) => (
            <label key={s} style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))} />
              {s}
            </label>
          ))}
        </div>
        {mintedRaw && (
          <div style={{ marginTop: 12, padding: 12, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#047857", marginBottom: 4 }}>Token created — copy it now, it is shown only once:</div>
            <code style={{ fontSize: 12, wordBreak: "break-all", color: "#065f46" }}>{mintedRaw}</code>
          </div>
        )}
      </div>

      {/* Tokens */}
      <div style={card}>
        <h2 style={h2}>Tokens {selected && <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 12 }}>in selected workspace</span>}</h2>
        {tokens.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13 }}>No tokens.</div>}
        {tokens.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0ece0", fontSize: 13 }}>
            <code style={{ background: "#f0ece0", padding: "2px 6px", borderRadius: 4 }}>{t.token_prefix}</code>
            <span style={{ flex: 1, color: "#6b7280", fontSize: 12 }}>{t.agent_name} · {t.scopes.join(", ")}</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}</span>
            {t.revoked_at ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>revoked</span>
              : <button style={btn("#dc2626")} onClick={() => revoke(t.id)}>Revoke</button>}
          </div>
        ))}
      </div>

      {/* Recent gateway audit */}
      <div style={card}>
        <h2 style={h2}>Recent gateway activity</h2>
        {audit.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13 }}>No gateway events yet.</div>}
        {audit.map((e, i) => {
          const permit = e.event_type === "mcp_gateway_permit";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0ece0", fontSize: 13 }}>
              <span style={{ width: 64, fontWeight: 600, color: permit ? "#16a34a" : "#dc2626" }}>{permit ? "PERMIT" : "DENY"}</span>
              <span style={{ flex: 1 }}>{String(e.metadata?.action ?? "")}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{String(e.metadata?.reason ?? "")}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(e.created_at).toLocaleTimeString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
