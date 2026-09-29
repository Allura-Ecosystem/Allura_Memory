import type { AuthUser } from "./types"

function normalizedEmails(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean))
}

function normalizedAllowedEmails(): Set<string> {
  return normalizedEmails(process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS)
}

function normalizedAdminEmails(): Set<string> {
  return normalizedEmails(process.env.ALLURA_CF_ACCESS_ADMIN_EMAILS)
}

export function isCloudflareAccessEnabled(): boolean {
  return process.env.ALLURA_CF_ACCESS_ENABLED === "true"
}

export function cloudflareAccessUser(headers: Pick<Headers, "get">): AuthUser | null {
  if (!isCloudflareAccessEnabled()) return null
  const email = headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase()
  const assertion = headers.get("cf-access-jwt-assertion")?.trim()
  if (!email || !assertion || !normalizedAllowedEmails().has(email)) return null

  const userId = `founder-${email.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
  return {
    id: userId,
    email,
    name: email.split("@", 1)[0],
    role: normalizedAdminEmails().has(email) ? "admin" : "viewer",
    groupId: process.env.ALLURA_CF_ACCESS_GROUP_ID ?? "allura-epic30-local",
    workspaceId: process.env.ALLURA_CF_ACCESS_WORKSPACE_ID ?? "epic30-local-workspace",
    sessionId: `cf-access:${userId}`,
  }
}
