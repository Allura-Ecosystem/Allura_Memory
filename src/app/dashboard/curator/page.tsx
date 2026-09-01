import { redirect } from "next/navigation";

import { CuratorDashboard } from "@/components/curator/curator-dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal";
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target";
import type { AuthUser } from "@/lib/auth/types";
import type { CuratorModuleIssue } from "@/lib/curator/module-contract";
import { issueCuratorModules } from "@/lib/curator/module-registry";

export function CuratorHandoffContent({ user, issue }: { user: AuthUser; issue?: CuratorModuleIssue }) {
  if (issue) {
    return (
      <DashboardShell user={user} title="Curator">
        <CuratorDashboard user={user} issue={issue} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={user} title="Curator">
      <p data-testid="authenticated-identity">Signed in as {user.id}</p>
      <p data-testid="authenticated-scope">
        Workspace {user.workspaceId} | Tenant {user.groupId} | Role {user.role}
      </p>
    </DashboardShell>
  );
}

export default async function CuratorHandoffPage() {
  // Server-owned principal only: Clerk session or DevAuthProvider. Raw browser
  // x-allura-* headers are never read here, so they cannot elevate or scope a
  // principal at the dashboard boundary.
  const user = await getDashboardPrincipal();

  if (!user?.workspaceId || !user.sessionId || !user?.id || !user?.groupId || !user?.role)
    redirect(`${AUTH_LOGIN_PATH}?redirect_url=%2Fdashboard%2Fcurator`);

  const issue = await issueCuratorModules(user);
  return <CuratorHandoffContent user={user} issue={issue} />;
}
