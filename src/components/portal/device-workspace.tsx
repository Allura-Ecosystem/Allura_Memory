"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./devices.module.css";
import { TokenInventoryPanel } from "./token-inventory-panel";
import { ConnectionWizard } from "./connection-wizard";
import { CONNECTION_PROFILES, type ConnectionProfile } from "@/lib/portal/connection-profiles";

type Device = Readonly<{ id: string; display_label: string; workspace_id: string; created_at: string; last_exchange_at: string | null }>;
type Props = { endpoint: string; isAdmin: boolean; workspaceId: string };
function projectDevice(value: unknown): Device | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (![row.id, row.display_label, row.workspace_id, row.created_at].every(v => typeof v === "string" && v.length > 0)) return null;
  return { id: row.id as string, display_label: row.display_label as string, workspace_id: row.workspace_id as string,
    created_at: row.created_at as string, last_exchange_at: typeof row.last_exchange_at === "string" ? row.last_exchange_at : null };
}
function exchangeLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "No credential exchange recorded";
  return `Last exchange: ${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
export function DeviceWorkspace({ workspaceId, endpoint, isAdmin }: Props) {
  const [view, setView] = useState<"devices" | "connections" | "profiles">("devices");
  const [profile, setProfile] = useState<ConnectionProfile>(CONNECTION_PROFILES[0]);
  const [clientBusy, setClientBusy] = useState(false);
  const [clientSetup, setClientSetup] = useState(false);
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ deviceId: string; operation: "revoke" | "mark-lost" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const enrollmentHeading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef<string | null>(null);
  const focusButtons = useRef(new Map<string, HTMLButtonElement>());
  const selected = devices.find(d => d.id === selectedId);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (view === "devices" && selected && confirming) confirmationHeading.current?.focus();
    else if (view === "devices" && !selected && adding) enrollmentHeading.current?.focus();
    else (focusButtons.current.get(restoreFocus.current ?? "") ?? heading.current)?.focus();
    restoreFocus.current = null;
  }, [selectedId, confirming, adding, view, clientSetup, pending]);
  function bindFocus(name: string, node: HTMLButtonElement | null) {
    if (node) focusButtons.current.set(name, node); else focusButtons.current.delete(name);
  }
  function navigate(next: "devices" | "connections" | "profiles") {
    setConfirming(null); setClientSetup(false); setAdding(false); setError(""); setNotice("");
    if (next !== "profiles") setSelectedId(null);
    setView(next);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setDevices([]); setSelectedId(null); setConfirming(null); setNotice("");
    void fetch("/api/device-pairing/devices", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unable to load your devices. Check your session and try again.");
      const body = await response.json();
      if (!Array.isArray(body.devices)) throw new Error("Device inventory returned an invalid response.");
      if (!controller.signal.aborted) setDevices(body.devices.map(projectDevice).filter((d: Device | null): d is Device => d !== null));
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your devices.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, revision]);
  async function disconnect() {
    if (!selected || !confirming || confirming.deviceId !== selected.id || pending) return;
    const id = selected.id;
    const operation = confirming.operation;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/device-pairing/${operation}`,  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: id }) });
      if (!response.ok) throw new Error("Device access could not be revoked. Check your session and retry.");
      const body = await response.json();
      if (![operation === "mark-lost" ? "LOST" : "REVOKED", "ALREADY_REVOKED"].includes(body.status) || body.device_id !== id) throw new Error("Revocation could not be verified. Refresh before retrying.");
      if (!active.current) return;
      restoreFocus.current = id;
      setDevices(current => current.filter(d => d.id !== id)); setSelectedId(null); setConfirming(null);
      setNotice(operation === "mark-lost" ? "Device marked lost. Its device-bound credentials have been revoked." : "Device disconnected. Its device-bound credentials have been revoked.");
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "Unable to disconnect device.");
    } finally { if (active.current) setPending(false); }
  }
  return <section className={styles.workspace} aria-label="Device workspace">
    <nav className={styles.tabs} aria-label="Workspace sections">
      <button type="button" disabled={pending || clientBusy} aria-pressed={view === "devices"} onClick={() => navigate("devices")}>Devices</button>
      <button type="button" disabled={pending || clientBusy} aria-pressed={view === "connections"} onClick={() => navigate("connections")}>Account connections</button>
      <button type="button" disabled={pending || clientBusy} aria-pressed={view === "profiles"} onClick={() => navigate("profiles")}>Profiles</button>
    </nav>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {view === "profiles" ? <section aria-label="Connection profiles">
      <header className={styles.intro}><div><span className={styles.eyebrow}>REUSE THE SETUP, NOT THE SECRET</span><h2 tabIndex={-1} ref={heading}>Connection profiles</h2><p>Built-in permission presets. Applying one starts new client setup; it never changes existing access.</p></div></header>
      <div className={styles.grid}>{CONNECTION_PROFILES.map(item => <article className={styles.card} key={item.id}>
        <span className={styles.badge}>{item.id === "read-only" ? "Start here" : "Contribute"}</span><h3>{item.name}</h3><p>{item.description}</p><p><code>{item.scopes.join(" · ")}</code></p>
        <button type="button" className={styles.primary} aria-label={`Use ${item.name}`} onClick={() => { setProfile(item); setClientSetup(Boolean(selected)); setView(selected ? "devices" : "connections"); }}>Use profile ↗</button>
      </article>)}</div><p className={styles.notice}>Profiles request permissions; they cannot grant access beyond your account. These presets contain no credentials and create no additional memory spaces.</p>
    </section> : view === "connections" ? <section aria-label="Account client connections"><h2 tabIndex={-1} ref={heading}>Account connections</h2>
      <p className={styles.notice}>Profile: <strong>{profile.name}</strong> · These credentials are not bound to a physical device. Cloud or manual client connections belong here.</p>
      <ConnectionWizard key={`${workspaceId}:${profile.id}`} endpoint={endpoint} authorizationHeader="Bearer <credential>" workspaceId={workspaceId} isAdmin={isAdmin} profileScopes={profile.scopes} onBusyChange={setClientBusy} />
    </section> : selected ? <>
      <button type="button" className={styles.secondary} disabled={pending} onClick={() => { restoreFocus.current = selected.id; setSelectedId(null); setClientSetup(false); setConfirming(null); setError(""); }}>Back to devices</button>
      <header className={styles.intro}><div><span className={styles.eyebrow}>PAIRED DEVICE</span><h2 tabIndex={-1} ref={heading}>{selected.display_label}</h2><p>{exchangeLabel(selected.last_exchange_at)}</p></div></header>
      {clientSetup ? <>
        <button type="button" className={styles.secondary} onClick={() => setClientSetup(false)}>Back to device access</button>
        <p className={styles.notice}>Device: {selected.display_label} · Requested profile: {profile.name}. Existing credentials are unchanged.</p>
        <ConnectionWizard key={`${selected.id}:${profile.id}`} endpoint={endpoint} authorizationHeader="Bearer <credential>" workspaceId={selected.workspace_id} isAdmin={isAdmin} profileScopes={profile.scopes} deviceContext={{ id: selected.id, label: selected.display_label }} />
      </> : confirming ? <section className={styles.confirmation} aria-label="Confirm device access change">
        <h3 tabIndex={-1} ref={confirmationHeading}>{confirming.operation === "mark-lost" ? "Mark lost" : "Disconnect"}: {selected.display_label}?</h3><p>This revokes every device-bound credential for this machine. Other devices stay connected. Unpaired API keys are not covered.</p>
        <button className={styles.danger} type="button" disabled={pending} onClick={() => void disconnect()}>{confirming.operation === "mark-lost" ? "Confirm mark lost" : "Confirm disconnect"}</button>
        <button className={styles.secondary} type="button" disabled={pending} onClick={() => { restoreFocus.current = `action:${confirming.operation}`; setConfirming(null); }}>Cancel</button>
      </section> : <>
        <div className={styles.actions}><button className={styles.primary} type="button" onClick={() => setClientSetup(true)}>Set up a client</button><button className={styles.danger} type="button" ref={node => bindFocus("action:revoke", node)} onClick={() => setConfirming({ deviceId: selected.id, operation: "revoke" })}>Disconnect device</button><button className={styles.danger} type="button" ref={node => bindFocus("action:mark-lost", node)} onClick={() => setConfirming({ deviceId: selected.id, operation: "mark-lost" })}>Mark lost</button></div>
        <section className={styles.detail} aria-label="Device-bound access"><h3>Access on this device</h3><p>Only credentials explicitly bound to this device appear here. They do not identify every installed app.</p>
          {isAdmin ? <TokenInventoryPanel key={selected.id} isAdmin workspaceId={selected.workspace_id} pairedDeviceId={selected.id} /> : <p>An administrator can inspect individual credentials. You can still revoke your own device.</p>}
        </section>
      </>}
    </> : <>
      <header className={styles.intro}><div><span className={styles.eyebrow}>MEMORY THAT SHOWS ITS WORK</span><h2 tabIndex={-1} ref={heading}>Your devices</h2><p>Different machines. The same trusted memory.</p></div><div className={styles.actions}><button type="button" className={styles.secondary} disabled={loading} onClick={() => setRevision(r => r + 1)}>Refresh devices</button><button type="button" className={styles.primary} ref={node => bindFocus("add", node)} onClick={() => setAdding(true)}>Add device</button></div></header>
      {adding && <section className={styles.detail} aria-label="Device enrollment guidance"><h3 tabIndex={-1} ref={enrollmentHeading}>Pair a device with allura</h3>
        <ol><li>Start pairing from a compatible allura client on the target computer. Its device key stays in that computer's secure store.</li><li>Open the approval link generated by that client, sign in, and verify the device name and requested workspace.</li><li>Return to the client to complete proof-based pairing, then refresh this list.</li></ol>
        <p className={styles.notice}>A verified local adapter is required. This dashboard does not yet ship a universal installer. Do not paste private keys here or copy another device's credential.</p>
        <button type="button" className={styles.secondary} onClick={() => { restoreFocus.current = "add"; setAdding(false); }}>Close instructions</button>
      </section>}
      {!loading && !error && devices.length === 0 && <div className={styles.empty}><h3>No paired devices yet.</h3><p>Your desktop and laptop will appear here after approval. No machines are added automatically.</p></div>}
      {loading && <p role="status">Loading your devices…</p>}
      <div className={styles.grid}>{devices.map(device => <article className={styles.card} key={device.id}>
        <span className={styles.deviceIcon} aria-hidden="true">▣</span><span className={styles.badge}>Paired</span>
        <h3>{device.display_label}</h3><p>{exchangeLabel(device.last_exchange_at)}</p><small>Workspace: {device.workspace_id}</small>
        <div className={styles.actions}><button className={styles.primary} type="button" aria-label={`Manage ${device.display_label}`} ref={node => bindFocus(device.id, node)} onClick={() => { setConfirming(null); setClientSetup(false); setAdding(false); setSelectedId(device.id); setNotice(""); }}>Manage device <span aria-hidden="true">↗</span></button></div>
      </article>)}</div>
    </>}
  </section>;
}
