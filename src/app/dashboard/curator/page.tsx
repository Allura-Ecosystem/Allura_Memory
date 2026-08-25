import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/api-auth";
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target";
import type { AuthUser } from "@/lib/auth/types";

export function CuratorHandoffContent({ user }: { user: AuthUser }) {
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
  const request = new NextRequest("http://allura.local/dashboard/curator", {
    headers: await headers(),
  });
  const user = getAuthUser(request);
  if (!user?.workspaceId || !user.sessionId) {
    redirect(`${AUTH_LOGIN_PATH}?redirect_url=%2Fdashboard%2Fcurator`);
  }

  return <CuratorHandoffContent user={user} />;
}
