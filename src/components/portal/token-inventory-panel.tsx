"use client";

import { useEffect, useState } from "react";

type SafeToken = Readonly<{
  id: string;
  token_prefix: string;
  agent_name: string;
  scopes: readonly string[];
}>;

function projectSafeToken(value: unknown): SafeToken | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.token_prefix !== "string" || typeof row.agent_name !== "string") return null;
  return {
    id: row.id,
    token_prefix: row.token_prefix,
    agent_name: row.agent_name,
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((scope): scope is string => typeof scope === "string") : [],
  };
}

/** Lists only the server's safe token projection; raw values and hashes are ignored. */
export function TokenInventoryPanel({ isAdmin, workspaceId }: { isAdmin: boolean; workspaceId: string }) {
  const [tokens, setTokens] = useState<readonly SafeToken[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void fetch(`/api/tokens?workspace_id=${encodeURIComponent(workspaceId)}`)
      .then(async (response) => {
        const body = await response.json() as { tokens?: unknown[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load credentials.");
        if (active) setTokens((body.tokens ?? []).map(projectSafeToken).filter((token): token is SafeToken => token !== null));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load credentials.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isAdmin, workspaceId]);

  if (!isAdmin) return null;

  async function revoke(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/tokens/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "Credential revocation failed.");
      }
      setTokens((current) => current.filter((token) => token.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential revocation failed.");
    }
  }

  return (
    <section aria-labelledby="credential-inventory-heading">
      <h2 id="credential-inventory-heading">Credential inventory</h2>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Loading credentials...</p> : null}
      {!loading && tokens.length === 0 ? <p>No active credentials in this workspace.</p> : null}
      <ul>
        {tokens.map((token) => (
          <li key={token.id}>
            <code>{token.token_prefix}</code> — {token.agent_name} ({token.scopes.join(", ")})
            <button type="button" aria-label={`Revoke ${token.token_prefix}`} onClick={() => void revoke(token.id)}>Revoke</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
