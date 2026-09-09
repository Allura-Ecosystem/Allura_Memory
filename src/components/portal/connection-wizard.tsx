"use client";

import { useMemo, useState } from "react";

type Client = "claude-desktop" | "hermes";

function credentialValue(header: string): string {
  return header.replace(/^Authorization:\s*/i, "");
}

export function ConnectionWizard({ endpoint, authorizationHeader }: { endpoint: string; authorizationHeader: string }) {
  const [client, setClient] = useState<Client>("claude-desktop");
  const config = useMemo(() => {
    const authorization = credentialValue(authorizationHeader);
    if (client === "hermes") {
      return JSON.stringify({
        mcp_servers: {
          "allura-memory": { url: endpoint, headers: { Authorization: authorization } },
        },
      }, null, 2);
    }
    return JSON.stringify({
      mcpServers: {
        "allura-memory": { type: "http", url: endpoint, headers: { Authorization: authorization } },
      },
    }, null, 2);
  }, [authorizationHeader, client, endpoint]);

  return (
    <section aria-labelledby="connection-wizard-heading">
      <h2 id="connection-wizard-heading">Choose your MCP client</h2>
      <label htmlFor="portal-mcp-client">MCP client</label>
      <select id="portal-mcp-client" value={client} onChange={(event) => setClient(event.target.value as Client)}>
        <option value="claude-desktop">Claude Desktop</option>
        <option value="hermes">Hermes Agent</option>
      </select>
      <pre data-testid="client-config"><code>{config}</code></pre>
      <h3>Test the connection</h3>
      <ol>
        <li>Save the configuration in the selected client&apos;s secure configuration store.</li>
        <li>Restart or reload that client.</li>
        <li>Use its MCP tool list or connection test. A visible Allura tool list confirms the connection.</li>
      </ol>
    </section>
  );
}
