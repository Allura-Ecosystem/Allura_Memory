"use client";

import { useEffect, useState } from "react";

type Workspace = Readonly<{ workspace_id: string; name: string }>;

type TokenIssueResponse = Readonly<{ token?: string; error?: string }>;

/**
 * Issues an MCP credential through the existing admin API. The raw credential
 * remains in React state only: it is never written to browser persistence.
 */
export function TokenIssuerPanel({ isAdmin, workspaceId: scopedWorkspaceId, initialAgentName = "", onIssuingChange, scopes }: {
  isAdmin: boolean;
  /** Server-derived workspace; when present, the setup cannot choose another. */
  workspaceId?: string;
  initialAgentName?: string;
  onIssuingChange?: (issuing: boolean) => void;
  scopes?: readonly string[];
}) {
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(scopedWorkspaceId ?? "");
  const [agentName, setAgentName] = useState(initialAgentName);
  const [issuedCredential, setIssuedCredential] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isAdmin && !scopedWorkspaceId);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!isAdmin || scopedWorkspaceId) return;

    let active = true;
    void fetch("/api/workspaces")
      .then(async (response) => {
        const body = await response.json() as { workspaces?: Workspace[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load workspaces.");
        if (!active) return;
        const next = body.workspaces ?? [];
        setWorkspaces(next);
        setWorkspaceId(next[0]?.workspace_id ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load workspaces.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [isAdmin, scopedWorkspaceId]);

  if (!isAdmin) {
    return <p role="status">An administrator must issue an allura MCP credential for this workspace.</p>;
  }

  async function issueCredential() {
    setError(null);
    setIssuedCredential(null);
    setIssuing(true);
    onIssuingChange?.(true);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, agent_name: agentName.trim(), ...(scopes ? { scopes } : {}) }),
      });
      const body = await response.json() as TokenIssueResponse;
      if (!response.ok || !body.token) throw new Error(body.error ?? "Credential issuance failed.");
      setIssuedCredential(body.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential issuance failed.");
    } finally {
      setIssuing(false);
      onIssuingChange?.(false);
    }
  }

  return (
    <section aria-labelledby="issue-credential-heading">
      <h2 id="issue-credential-heading">Issue an MCP credential</h2>
      <p>The credential is shown once. Save it in your MCP client&apos;s secure store before dismissing it.</p>
      {scopes ? <p>Requested permissions: <code>{scopes.join(", ")}</code></p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {scopedWorkspaceId ? <p>Workspace: <code>{scopedWorkspaceId}</code></p> : <>
      <label htmlFor="portal-workspace">Workspace</label>
      <select id="portal-workspace" value={workspaceId} disabled={loading} onChange={(event) => setWorkspaceId(event.target.value)}>
        {loading ? <option>Loading workspaces...</option> : null}
        {workspaces.map((workspace) => <option key={workspace.workspace_id} value={workspace.workspace_id}>{workspace.name}</option>)}
      </select>
      </>}
      <label htmlFor="portal-agent-name">Agent name</label>
      <input id="portal-agent-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} />
      <button type="button" disabled={loading || issuing || !workspaceId || !agentName.trim()} onClick={() => void issueCredential()}>
        Issue credential
      </button>
      {issuedCredential ? (
        <div role="status">
          <code>{issuedCredential}</code>
          <button type="button" onClick={() => setIssuedCredential(null)}>Dismiss credential</button>
        </div>
      ) : null}
    </section>
  );
}
