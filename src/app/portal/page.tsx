import { ConnectionWizard } from "@/components/portal/connection-wizard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { TokenInventoryPanel } from "@/components/portal/token-inventory-panel";
import { TokenIssuerPanel } from "@/components/portal/token-issuer-panel";
import { requireDashboardScope } from "@/lib/dashboard/page-guard";
import { buildConnectionGuide } from "@/lib/portal/connection-guide";

export const dynamic = "force-dynamic";

const MCP_ENDPOINT = "https://mcp.faithmeats.org/mcp";

/**
 * Human-facing entry point. The machine MCP transport remains at /mcp; this
 * page only explains its two authentication layers using server-derived scope.
 */
export default async function PortalPage() {
  const { user } = await requireDashboardScope("/portal");
  const guide = buildConnectionGuide(MCP_ENDPOINT);

  return (
    <DashboardShell user={user} title="Connect Allura">
      <p>Human connection portal</p>
      <p>
        This page helps people connect an approved MCP client. The <code>/mcp</code> endpoint is a machine
        transport, not a browser dashboard.
      </p>

      <h2>Connect your client</h2>
      <ol>
        {guide.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>

      <dl>
        <dt>Endpoint</dt>
        <dd><code>{guide.endpoint}</code></dd>
        <dt>Transport</dt>
        <dd>{guide.transport}</dd>
        <dt>Credential format</dt>
        <dd><code>{guide.authorizationHeader}</code></dd>
      </dl>

      <ConnectionWizard endpoint={guide.endpoint} authorizationHeader={guide.authorizationHeader} />

      <TokenIssuerPanel isAdmin={user.role === "admin"} />
      <TokenInventoryPanel isAdmin={user.role === "admin"} workspaceId={user.workspaceId ?? ""} />

      <p>
        Credentials are issued once and must be stored only in your MCP client&apos;s secure store. This portal
        never recovers or re-displays a credential after its one-time issue screen is dismissed.
      </p>
    </DashboardShell>
  );
}
