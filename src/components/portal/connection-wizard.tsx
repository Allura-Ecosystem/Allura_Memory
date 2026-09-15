"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./clients.module.css";
import { TokenIssuerPanel } from "./token-issuer-panel";
import { TokenInventoryPanel } from "./token-inventory-panel";

const CLIENTS = [
  { id: "chatgpt", name: "ChatGPT", mark: "G", description: "Your conversational workspace", mode: "Authorization setup needed", ready: false,
    note: "The allura OAuth connector and this ChatGPT account's client support still need verification. A Clerk dashboard login is not MCP OAuth authorization." },
  { id: "claude-desktop", name: "Claude Desktop", mark: "C", description: "allura alongside your conversations", mode: "Adapter setup needed", ready: false,
    note: "A supported remote connector or approved local bridge must be configured first. This portal cannot install a desktop extension or silently change Claude's local files." },
  { id: "hermes", name: "Hermes", mark: "H", description: "Memory for your personal agent", mode: "Guided setup", ready: true,
    note: "Configure a remote HTTP MCP server in your selected Hermes profile. Keep the credential in that profile's secret store, not in a chat or source control." },
  { id: "opencode", name: "OpenCode", mark: ">_", description: "Shared context for your coding sessions", mode: "Guided setup", ready: true,
    note: "Add allura as a remote MCP server in your OpenCode configuration. Use a local environment variable for the credential and preserve your existing server entries." },
  { id: "openclaw", name: "OpenClaw", mark: "O", description: "Bring memory to your agent workspace", mode: "Adapter setup needed", ready: false,
    note: "The installed OpenClaw version and its MCP adapter need verification before a configuration can be provided. No desktop connection has been made." },
  { id: "custom", name: "Custom client", mark: "+", description: "For clients with remote HTTP and Bearer authentication", mode: "Manual setup", ready: true,
    note: "Your client must support Streamable HTTP and an Authorization header. Use your client's documented configuration format." },
] as const;
type Client = typeof CLIENTS[number];

type Props = {
  endpoint: string;
  authorizationHeader: string;
  isAdmin?: boolean;
  workspaceId?: string;
  profileScopes?: readonly string[];
  deviceContext?: { id: string; label: string };
  onBusyChange?: (busy: boolean) => void;
};

/** These are templates only. Raw credentials never enter configuration previews. */
function setupTemplate(client: Client, endpoint: string): string {
  if (client.id === "opencode") return JSON.stringify({
    mcp: { "allura-memory": { type: "remote", url: endpoint, enabled: true, oauth: false,
      headers: { Authorization: "Bearer {env:ALLURA_MCP_TOKEN}" } } },
  }, null, 2);
  if (client.id === "hermes") return JSON.stringify({
    mcp_servers: { "allura-memory": { url: endpoint,
      headers: { Authorization: "Bearer ${ALLURA_MCP_TOKEN}" } } },
  }, null, 2);
  return `Transport: Streamable HTTP\nEndpoint: ${endpoint}\nAuthorization: Bearer <your Allura MCP credential>`;
}

/** Client selection never claims a connection or modifies a local app. */
export function ConnectionWizard({ endpoint, isAdmin = false, workspaceId, profileScopes, onBusyChange, deviceContext }: Props) {
  const [selected, setSelected] = useState<Client | null>(null);
  const [view, setView] = useState<"clients" | "credentials">("clients");
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [issuing, setIssuing] = useState(false);
  const copyOperation = useRef(0);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const lastClient = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const canIssue = isAdmin && Boolean(workspaceId);
  const visible = CLIENTS.filter((client) => client.id !== "custom" && client.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (selected) selectedHeading.current?.focus();
    else if (lastClient.current) buttons.current.get(lastClient.current)?.focus();
  }, [selected]);

  function leaveSetup(nextView: "clients" | "credentials") {
    copyOperation.current += 1;
    setCopyStatus("");
    setSelected(null);
    setView(nextView);
  }

  useEffect(() => () => { copyOperation.current += 1; }, []);

  async function copySetup() {
    if (!selected) return;
    const operation = ++copyOperation.current;
    try {
      await navigator.clipboard.writeText(setupTemplate(selected, endpoint));
      if (operation === copyOperation.current) setCopyStatus("Setup copied. Add your credential only in your local secret store.");
    } catch {
      if (operation === copyOperation.current) setCopyStatus("Clipboard unavailable. Select and copy the setup text below.");
    }
  }

  const connectButton = (client: Client) => (
    <button type="button" className={styles.connectButton} aria-label={`Connect ${client.name}`}
      ref={(node) => { if (node) buttons.current.set(client.id, node); else buttons.current.delete(client.id); }}
      onClick={() => { copyOperation.current += 1; lastClient.current = client.id; setCopyStatus(""); setSelected(client); }}>
      Connect <span aria-hidden="true">↗</span>
    </button>
  );

  return <div className={styles.clients}>
    <nav className={styles.tabs} aria-label="Connection sections">
      <button type="button" disabled={issuing} aria-pressed={view === "clients"} onClick={() => leaveSetup("clients")}>Clients</button>
      <button type="button" disabled={issuing} aria-pressed={view === "credentials"} onClick={() => leaveSetup("credentials")}>Credentials</button>
    </nav>
    {view === "credentials" ? <section className={styles.credentialPanel} aria-label="Manage access">
      <h2>Manage client access</h2>
      <p>Revoke a credential to remove its MCP access. An issued credential is not evidence of a live client connection.</p>
      {canIssue ? <TokenInventoryPanel isAdmin={isAdmin} workspaceId={workspaceId!} pairedDeviceId={deviceContext?.id ?? null} onBusyChange={value => { setIssuing(value); onBusyChange?.(value); }} /> :
        <p>An administrator with a workspace must manage client credentials.</p>}
    </section> : selected ? (
      <section className={styles.setup} aria-labelledby="client-setup-heading">
        <button type="button" className={styles.backButton} disabled={issuing} onClick={() => leaveSetup("clients")}>Back to clients</button>
        <header className={styles.setupHeader}>
          <span className={styles.clientMark} aria-hidden="true">{selected.mark}</span>
          <div><h2 id="client-setup-heading" tabIndex={-1} ref={selectedHeading}>Connect {selected.name}</h2>
            <span className={styles.badge}>{selected.mode}</span></div>
        </header>
        <p>{selected.note}</p>
        <p className={styles.notice}>Connection not verified. Choosing a client does not connect the app.</p>
        <dl className={styles.endpoint}><dt>MCP endpoint</dt><dd><code>{endpoint}</code></dd></dl>
        {deviceContext ? <p className={styles.notice}>Device-bound setup requires a compatible local adapter on {deviceContext.label}. It must prove possession of this device's key through enrollment and exchange. The generic API-key issuer cannot create device-bound access; no credential will be issued here. Client-specific adapters remain an integration gate.</p> : null}
        {selected.ready && !deviceContext ? <>
          <div className={styles.credentialPanel}>
            <span className={styles.stepLabel}>01 / Authorize access</span>
            <TokenIssuerPanel key={`${selected.id}:${workspaceId}:${profileScopes?.join(",")}`} isAdmin={canIssue} workspaceId={workspaceId} initialAgentName={selected.name} scopes={profileScopes} onIssuingChange={value => { setIssuing(value); onBusyChange?.(value); }} />
          </div>
          <section className={styles.configPanel} aria-labelledby="client-config-heading">
            <span className={styles.stepLabel}>02 / Configure your client</span>
            <h3 id="client-config-heading">Add allura to {selected.name}</h3>
            <p>Store your one-time credential locally as <code>ALLURA_MCP_TOKEN</code>. The template below contains no secret.</p>
            {selected.id === "hermes" ? <p>Merge this entry into your selected Hermes profile using <code>hermes config set</code>; store the credential in that profile&apos;s <code>.env</code>.</p> : null}
            {selected.id === "opencode" ? <p>Merge this entry into <code>opencode.json</code>, then start OpenCode with the environment variable available.</p> : null}
            <button type="button" className={styles.connectButton} onClick={() => void copySetup()}>Copy setup</button>
            {copyStatus ? <p role="status">{copyStatus}</p> : null}
            <pre data-testid="client-config"><code>{setupTemplate(selected, endpoint)}</code></pre>
          </section>
          <section className={styles.configPanel} aria-labelledby="client-test-heading">
            <span className={styles.stepLabel}>03 / Verify in the client</span>
            <h3 id="client-test-heading">Test the connection</h3>
            {selected.id === "hermes" ? <code>hermes mcp test allura-memory</code> : selected.id === "opencode" ? <code>opencode mcp list</code> : null}
            <p>Reload the client, confirm allura&apos;s tools are listed, then make a read-only request against your own workspace. This portal has no client handshake receipt yet, so it cannot show “Connected.”</p>
            <p>If the endpoint redirects to Cloudflare Access or returns an authorization error, stop and resolve the approved access policy. Do not disable authentication.</p>
          </section>
        </> : <p className={styles.footnote}>Setup is unavailable until the adapter is verified. No credential is issued from this screen.</p>}
      </section>
    ) : (
      <section aria-labelledby="clients-heading">
        <header className={styles.intro}>
          <div><h2 id="clients-heading">Connect your AI tools</h2>
            <p>{deviceContext ? `Choose a client for ${deviceContext.label}. Device-bound adapters require separate verification.` : "Choose a client to set up access to your allura memory workspace."}</p></div>
        </header>
        <div className={styles.customRow}>
          <span className={styles.customMark} aria-hidden="true">+</span>
          <div><h3>Bring your own client</h3><p>Use any compatible Streamable HTTP client.</p></div>
          {connectButton(CLIENTS[5])}
        </div>
        <div className={styles.toolbar}>
          <span className={styles.sectionLabel}>Choose a client</span>
          <input type="search" aria-label="Search clients" placeholder="Search clients…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className={styles.grid}>
          {visible.map((client) => (
            <article className={styles.card} key={client.id} aria-label={client.name}>
              <span className={styles.clientMark} aria-hidden="true">{client.mark}</span>
              <div className={styles.cardContent}><h3>{client.name}</h3><p>{client.description}</p>
                <span className={styles.badge} data-ready={client.ready}>{client.mode}</span></div>
              {connectButton(client)}
            </article>
          ))}
        </div>
        {visible.length === 0 ? <p className={styles.notice}>No clients match your search.</p> : null}
        <p className={styles.footnote}>Client setup is separate from signing in to this dashboard. A credential alone does not prove an app is connected.</p>
      </section>
    )}
  </div>;
}
