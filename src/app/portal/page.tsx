import { ConnectionWizard } from "@/components/portal/connection-wizard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireDashboardScope } from "@/lib/dashboard/page-guard";
import { buildConnectionGuide } from "@/lib/portal/connection-guide";

export const dynamic = "force-dynamic";
const MCP_ENDPOINT = "https://mcp.faithmeats.org/mcp";

/** Human client setup. Authority still comes only from the guarded server session. */
export default async function PortalPage() {
  const { user } = await requireDashboardScope("/portal");
  const guide = buildConnectionGuide(MCP_ENDPOINT);

  return (
    <DashboardShell user={user} title="MCP connections" activePath="/portal">
      <ConnectionWizard endpoint={guide.endpoint} authorizationHeader={guide.authorizationHeader}
        isAdmin={user.role === "admin"} workspaceId={user.workspaceId ?? ""} />
    </DashboardShell>
  );
}
