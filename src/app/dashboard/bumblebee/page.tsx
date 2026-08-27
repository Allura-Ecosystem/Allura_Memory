/**
 * Bumblebee operator module route (Story 26.7).
 *
 * Async Server Component with an inline auth gate, matching the convention
 * established by src/app/dashboard/curator/page.tsx. Scope is server-derived
 * from the authenticated principal and never read from a query parameter --
 * a tenant-selecting URL parameter would be the whole tenant-isolation
 * boundary handed to the client.
 */

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextRequest } from "next/server";

import {
  ExposuresSurface,
  IncidentsSurface,
  PolicyDraftsSurface,
  ReceiptsSurface,
  SourcesSurface,
} from "@/components/bumblebee/surfaces";
import { getAuthUser } from "@/lib/auth/api-auth";
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target";
import { isBumblebeeEnabled } from "@/lib/bumblebee/module";
import {
  getBumblebeeSummary,
  listExposures,
  listIncidents,
  listReceipts,
  listSources,
} from "@/lib/bumblebee/queries";
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope";

export default async function BumblebeePage() {
  // Rollback (AC-6): disabled is a 404, not a broken page. The shell and every
  // other route are unaffected because nothing outside this module imports it.
  if (!isBumblebeeEnabled()) {
    notFound();
  }

  const request = new NextRequest("http://allura.local/dashboard/bumblebee", {
    headers: await headers(),
  });
  const user = getAuthUser(request);
  if (!user?.workspaceId || !user.sessionId) {
    redirect(`${AUTH_LOGIN_PATH}?redirect_url=%2Fdashboard%2Fbumblebee`);
  }

  const scope: ResolvedWorkspaceScope = {
    tenantId: user.groupId,
    workspaceId: user.workspaceId,
    principalId: user.id,
  };

  const [summary, sources, exposures, incidents, receipts] = await Promise.all([
    getBumblebeeSummary(scope),
    listSources(scope),
    listExposures(scope),
    listIncidents(scope),
    listReceipts(scope),
  ]);

  return (
    <main>
      <h1>Bumblebee — Supply-Chain Threat Intelligence</h1>
      <p data-testid="authenticated-scope">
        Workspace {user.workspaceId} | Tenant {user.groupId} | Role {user.role}
      </p>
      <p data-testid="bumblebee-summary">
        {summary.sources} sources ({summary.unpinnedActions} mutable action tags) ·{" "}
        {summary.openExposures} open exposures · {summary.incidents} incidents ·{" "}
        {summary.receipts} receipts
      </p>

      <SourcesSurface rows={sources} />
      <ExposuresSurface rows={exposures} />
      {/*
        Policy Drafts are generated in-memory per exposure rather than stored:
        Story 26.5 deliberately does not persist unapproved drafts, so there is
        no draft table to read. Rendering the empty surface is the truthful
        state until an approval produces a receipt.
      */}
      <PolicyDraftsSurface drafts={[]} />
      <IncidentsSurface rows={incidents} />
      <ReceiptsSurface rows={receipts} />
    </main>
  );
}
