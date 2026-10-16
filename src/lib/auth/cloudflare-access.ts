import {
  createRemoteJWKSet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose"

import type { AuthUser } from "./types"

interface CloudflareAccessJwtConfig {
  audience: string
  teamDomain: string
}

const remoteJwksByUrl = new Map<string, JWTVerifyGetKey>()

function normalizedEmails(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean))
}

function normalizedAllowedEmails(): Set<string> {
  return normalizedEmails(process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS)
}

function normalizedAdminEmails(): Set<string> {
  return normalizedEmails(process.env.ALLURA_CF_ACCESS_ADMIN_EMAILS)
}

function cloudflareAccessJwtConfig(): CloudflareAccessJwtConfig | null {
  const audience = process.env.ALLURA_CF_ACCESS_AUDIENCE?.trim()
  const rawTeamDomain = process.env.ALLURA_CF_ACCESS_TEAM_DOMAIN?.trim()
  if (!audience || !rawTeamDomain) return null

  try {
    const teamDomain = new URL(rawTeamDomain)
    if (
      teamDomain.protocol !== "https:" ||
      !teamDomain.hostname.endsWith(".cloudflareaccess.com") ||
      teamDomain.pathname !== "/" ||
      teamDomain.search ||
      teamDomain.hash
    ) {
      return null
    }
    return { audience, teamDomain: teamDomain.origin }
  } catch {
    return null
  }
}

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  const url = `${teamDomain}/cdn-cgi/access/certs`
  const cached = remoteJwksByUrl.get(url)
  if (cached) return cached
  const created = createRemoteJWKSet(new URL(url))
  remoteJwksByUrl.set(url, created)
  return created
}

export function isCloudflareAccessEnabled(): boolean {
  return process.env.ALLURA_CF_ACCESS_ENABLED === "true"
}

export async function verifyCloudflareAccessAssertion(
  assertion: string,
  config: CloudflareAccessJwtConfig,
  jwks: JWTVerifyGetKey = remoteJwks(config.teamDomain),
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(assertion, jwks, {
      algorithms: ["RS256"],
      audience: config.audience,
      issuer: config.teamDomain,
    })
    if (
      payload.type !== "app" ||
      typeof payload.email !== "string" ||
      !payload.email.trim() ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.nbf !== "number"
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function cloudflareAccessUser(
  headers: Pick<Headers, "get">,
  jwks?: JWTVerifyGetKey,
): Promise<AuthUser | null> {
  if (!isCloudflareAccessEnabled()) return null

  const groupId = process.env.ALLURA_CF_ACCESS_GROUP_ID?.trim()
  const workspaceId = process.env.ALLURA_CF_ACCESS_WORKSPACE_ID?.trim()
  if (!groupId || !workspaceId) return null

  const assertion = headers.get("cf-access-jwt-assertion")?.trim()
  const config = cloudflareAccessJwtConfig()
  if (!assertion || !config) return null

  const payload = await verifyCloudflareAccessAssertion(assertion, config, jwks)
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : ""
  const forwardedEmail = headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase()
  if (
    !email ||
    (forwardedEmail && forwardedEmail !== email) ||
    !normalizedAllowedEmails().has(email)
  ) {
    return null
  }

  const userId = `founder-${email.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
  return {
    id: userId,
    email,
    name: email.split("@", 1)[0],
    role: normalizedAdminEmails().has(email) ? "admin" : "viewer",
    groupId,
    workspaceId,
    sessionId: `cf-access:${userId}`,
  }
}
