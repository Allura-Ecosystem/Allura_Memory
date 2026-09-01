import "server-only"

import { redirect } from "next/navigation"

import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target"
import type { AuthUser } from "@/lib/auth/types"
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope"

import { resolveDashboardScope } from "./read-service"

/**
 * Server-owned dashboard entry guard. Derives the principal from Clerk or the
 * DevAuthProvider (never browser headers), then resolves a workspace scope.
 * Missing or incomplete authority redirects to login.
 */
export async function requireDashboardScope(
  path: string,
): Promise<{ user: AuthUser; scope: ResolvedWorkspaceScope }> {
  const user = await getDashboardPrincipal()

  if (!user?.workspaceId || !user.sessionId || !user.id || !user.groupId || !user.role) {
    redirect(`${AUTH_LOGIN_PATH}?redirect_url=${encodeURIComponent(path)}`)
  }

  return { user, scope: resolveDashboardScope(user) }
}
