import type { Metadata } from "next";
import { headers } from "next/headers";
import GuardClient from "./guard-client";

export const metadata: Metadata = { title: "Allura Guard" };
export const dynamic = "force-dynamic";

// Allura Guard console (DESIGN-MEMORY-COMMAND-CENTER) — the MCP auth/policy gateway.
// The active org scope comes from the proxy-injected header (never client-supplied).
// All mutations go through the governed /api routes.
export default async function GuardPage() {
  const h = await headers();
  const groupId = h.get("x-allura-group-id") ?? "allura-system";
  const workspaceId = h.get("x-allura-workspace-id") ?? null;
  return <GuardClient groupId={groupId} activeWorkspaceId={workspaceId} />;
}
