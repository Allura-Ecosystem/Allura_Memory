"use client";
import { useEffect, useId, useRef, useState } from "react";

type SafeToken = Readonly<{ id: string; token_prefix: string; agent_name: string; scopes: readonly string[]; paired_device_id: string | null }>;
function projectSafeToken(value: unknown): SafeToken | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.token_prefix !== "string" || typeof row.agent_name !== "string") return null;
  if (row.paired_device_id != null && typeof row.paired_device_id !== "string") return null;
  if (row.revoked_at != null) return null;
  if (row.expires_at != null && (typeof row.expires_at !== "string" || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now())) return null;
  return { id: row.id, token_prefix: row.token_prefix, agent_name: row.agent_name,
    paired_device_id: typeof row.paired_device_id === "string" ? row.paired_device_id : null,
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((scope): scope is string => typeof scope === "string") : [] };
}

/** Device-bound credentials are inspection-only; lifecycle controls revoke the device. */
export function TokenInventoryPanel({ isAdmin, workspaceId, pairedDeviceId, onBusyChange }: {
  isAdmin: boolean; workspaceId: string; pairedDeviceId?: string | null; onBusyChange?: (busy: boolean) => void;
}) {
  const scope = JSON.stringify([workspaceId, pairedDeviceId === undefined ? "all" : pairedDeviceId === null ? "unpaired" : "device", pairedDeviceId ?? null]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const active = useRef(true);
  const [inventory, setInventory] = useState<{ scope: string; tokens: readonly SafeToken[] }>({ scope, tokens: [] });
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState<SafeToken | null>(null);
  const [pending, setPending] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);
  const tokens = inventory.scope === scope ? inventory.tokens : [];
  const emptyLabel = pairedDeviceId === undefined ? "No active credentials in this workspace." : pairedDeviceId === null ? "No active unpaired credentials." : "No active credentials for this device.";
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (confirmation) confirmHeading.current?.focus();
    else if (returnTo.current) { (buttons.current.get(returnTo.current) ?? heading.current)?.focus(); returnTo.current = null; }
  }, [confirmation]);
  useEffect(() => {
    const controller = new AbortController();
    setInventory({ scope, tokens: [] }); setConfirmation(null); setError(null); setLoading(isAdmin);
    if (!isAdmin) return () => controller.abort();
    void fetch(`/api/tokens?workspace_id=${encodeURIComponent(workspaceId)}`)
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load credentials. Check your session and refresh.");
        const body = await response.json() as { tokens?: unknown[] };
        if (!Array.isArray(body.tokens)) throw new Error("Invalid credential inventory response. Refresh to try again.");
        const rows = body.tokens.map(projectSafeToken).filter((token): token is SafeToken => token !== null)
          .filter(token => pairedDeviceId === undefined || token.paired_device_id === pairedDeviceId);
        if (!controller.signal.aborted) setInventory({ scope, tokens: rows });
      }).catch(() => { if (!controller.signal.aborted) setError("Unable to load credentials. Check your session and refresh."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isAdmin, workspaceId, pairedDeviceId, scope, revision]);

  async function revoke() {
    if (!confirmation || confirmation.paired_device_id !== null || pending || !tokens.some(t => t.id === confirmation.id)) return;
    const id = confirmation.id; const requestScope = scope;
    setPending(true); setError(null); onBusyChange?.(true);
    try {
      const response = await fetch(`/api/tokens/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      if (!response.ok) throw new Error("Revocation not confirmed");
      if (!active.current || currentScope.current !== requestScope) return;
      returnTo.current = id;
      setInventory(current => ({ ...current, tokens: current.tokens.filter(token => token.id !== id) }));
      setConfirmation(null);
    } catch {
      if (active.current && currentScope.current === requestScope) setError("Unable to verify revocation. Refresh the inventory before retrying.");
    } finally {
      if (active.current && currentScope.current === requestScope) { setPending(false); onBusyChange?.(false); }
    }
  }
  if (!isAdmin) return null;
  return <section aria-labelledby={headingId}>
    <h2 id={headingId} ref={heading} tabIndex={-1}>Credential inventory</h2>
    <button type="button" disabled={loading || pending} onClick={() => setRevision(r => r + 1)}>Refresh credentials</button>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading credentials...</p>}
    {!loading && !error && tokens.length === 0 && <p>{emptyLabel}</p>}
    {typeof pairedDeviceId === "string" && <p>Device credentials may serve several clients. Use the confirmed device controls to disconnect or mark the device lost.</p>}
    {confirmation && <section aria-label="Confirm credential revocation">
      <h3 ref={confirmHeading} tabIndex={-1}>Revoke {confirmation.token_prefix}?</h3>
      <p>Every client using this credential will lose access. This does not disconnect a paired device.</p>
      <button type="button" disabled={pending} onClick={() => void revoke()}>Confirm revoke credential</button>
      <button type="button" disabled={pending} onClick={() => { returnTo.current = confirmation.id; setConfirmation(null); }}>Cancel credential revocation</button>
    </section>}
    <ul>{tokens.map(token => <li key={token.id}>
      <code>{token.token_prefix}</code> — {token.agent_name} ({token.scopes.join(", ")})
      {token.paired_device_id === null && <button type="button" disabled={pending || Boolean(confirmation)} aria-label={`Revoke ${token.token_prefix}`}
        ref={node => { if (node) buttons.current.set(token.id, node); else buttons.current.delete(token.id); }}
        onClick={() => { setError(null); setConfirmation(token); }}>Revoke</button>}
    </li>)}</ul>
  </section>;
}
