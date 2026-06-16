import type { Metadata } from "next";
import { headers } from "next/headers";
import BumblebeeClient from "./bumblebee-client";

export const metadata: Metadata = { title: "Bumblebee" };
export const dynamic = "force-dynamic";

// Bumblebee console (DESIGN-MEMORY-COMMAND-CENTER). The active org scope comes from
// the middleware-injected header (never client-supplied). All mutations go through
// the governed /api routes.
export default async function BumblebeePage() {
  const h = await headers();
  const groupId = h.get("x-allura-group-id") ?? "allura-system";
  const workspaceId = h.get("x-allura-workspace-id") ?? null;
  return <BumblebeeClient groupId={groupId} activeWorkspaceId={workspaceId} />;
}
