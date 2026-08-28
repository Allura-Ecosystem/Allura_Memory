import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { CuratorModuleShell } from "@/components/curator/module-shell";
import { getAuthUser } from "@/lib/auth/api-auth";
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target";
import type { AuthUser } from "@/lib/auth/types";
import type { CuratorModuleIssue } from "@/lib/curator/module-contract";
import { issueCuratorModules } from "@/lib/curator/module-registry";

export function CuratorHandoffContent({ user, issue }: { user: AuthUser; issue?: CuratorModuleIssue }) {
  if (issue) {
    return (
      <>
        <p data-testid="authenticated-identity">Signed in as {user.id}</p>
        <p data-testid="authenticated-scope">
          Workspace {user.workspaceId} | Tenant {user.groupId} | Role {user.role}
        </p>
        <CuratorModuleShell issue={issue} />
      </>
    );
  }

  return (
    <main>
      <h1>Curator console</h1>
      <p data-testid="authenticated-identity">Signed in as {user.id}</p>
      <p data-testid="authenticated-scope">
        Workspace {user.workspaceId} | Tenant {user.groupId} | Role {user.role}
      </p>
    </main>
  );
}

export default async function CuratorHandoffPage() {
  const request = new NextRequest("http://allura.local/dashboard/curator", { headers: await headers() });

  // Auditor finding (25.3b #9): a throwing auth resolver must render the
  // canonical error shell state, not an unhandled 500.
  let user;
  try {
    user = getAuthUser(request);
  } catch {
    user = null;
  }
  if (!user?.workspaceId || !user.sessionId || !user?.id || !user?.groupId || !user?.role)
    redirect(`${AUTH_LOGIN_PATH}?redirect_url=%2Fdashboard%2Fcurator`);

  const issue = await issueCuratorModules(request);
  return <CuratorHandoffContent user={user} issue={issue} />;
}
