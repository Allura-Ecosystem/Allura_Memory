import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  SignJWT,
} from "jose"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { cloudflareAccessUser } from "../cloudflare-access"

const AUDIENCE = "dashboard-audience"
const TEAM_DOMAIN = "https://faithmeats.cloudflareaccess.com"
const original = { ...process.env }

let privateKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeEach(async () => {
  process.env = { ...original }
  process.env.ALLURA_CF_ACCESS_ENABLED = "true"
  process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS = "sasheed@faithmeats.com,gabec@faithmeats.com"
  process.env.ALLURA_CF_ACCESS_ADMIN_EMAILS = "sasheed@faithmeats.com"
  process.env.ALLURA_CF_ACCESS_GROUP_ID = "allura-epic30-local"
  process.env.ALLURA_CF_ACCESS_WORKSPACE_ID = "epic30-local-workspace"
  process.env.ALLURA_CF_ACCESS_TEAM_DOMAIN = TEAM_DOMAIN
  process.env.ALLURA_CF_ACCESS_AUDIENCE = AUDIENCE

  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  const publicJwk = await exportJWK(pair.publicKey)
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, alg: "RS256", kid: "test-key", use: "sig" }] })
})

afterEach(() => { process.env = { ...original } })

function headers(assertion: string, email?: string): Headers {
  return new Headers({
    "cf-access-jwt-assertion": assertion,
    ...(email ? { "cf-access-authenticated-user-email": email } : {}),
  })
}

async function signedAssertion(options: {
  audience?: string
  email?: string
  expirationTime?: number
  issuer?: string
  notBefore?: number
  signingKey?: CryptoKey
  type?: string
  withIssuedAt?: boolean
  withNotBefore?: boolean
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  let token = new SignJWT({
    email: options.email ?? "sasheed@faithmeats.com",
    type: options.type ?? "app",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? TEAM_DOMAIN)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expirationTime ?? now + 300)

  if (options.withIssuedAt !== false) token = token.setIssuedAt(now)
  if (options.withNotBefore !== false) token = token.setNotBefore(options.notBefore ?? now - 1)
  return await token.sign(options.signingKey ?? privateKey)
}

describe("Cloudflare Access founder identity", () => {
  it("rejects an unverified assertion even when Cloudflare Access is enabled", async () => {
    expect(await cloudflareAccessUser(headers("signed", "sasheed@faithmeats.com"), jwks)).toBeNull()
  })

  it("maps the verified JWT email to the configured role and scope", async () => {
    const sabir = await cloudflareAccessUser(
      headers(await signedAssertion(), "SASHEED@FAITHMEATS.COM"),
      jwks,
    )
    const gabe = await cloudflareAccessUser(
      headers(await signedAssertion({ email: "gabec@faithmeats.com" }), "gabec@faithmeats.com"),
      jwks,
    )

    expect(sabir).toMatchObject({
      email: "sasheed@faithmeats.com",
      role: "admin",
      groupId: "allura-epic30-local",
      workspaceId: "epic30-local-workspace",
    })
    expect(gabe).toMatchObject({ email: "gabec@faithmeats.com", role: "viewer" })
    expect(gabe?.id).not.toBe(sabir?.id)
  })

  for (const scopeKey of ["ALLURA_CF_ACCESS_GROUP_ID", "ALLURA_CF_ACCESS_WORKSPACE_ID"]) {
    for (const value of [undefined, "", " \t\n "]) {
      it(`fails closed when ${scopeKey} is ${JSON.stringify(value)}`, async () => {
        if (value === undefined) delete process.env[scopeKey]
        else process.env[scopeKey] = value

        expect(await cloudflareAccessUser(headers(await signedAssertion()), jwks)).toBeNull()
      })
    }
  }

  it("returns the trimmed configured scope IDs", async () => {
    process.env.ALLURA_CF_ACCESS_GROUP_ID = " \tconfigured-group\n "
    process.env.ALLURA_CF_ACCESS_WORKSPACE_ID = " \tconfigured-workspace\n "

    expect(await cloudflareAccessUser(headers(await signedAssertion()), jwks)).toMatchObject({
      groupId: "configured-group",
      workspaceId: "configured-workspace",
    })
  })

  it("rejects wrong issuer, audience, signature, expiry, and not-before claims", async () => {
    const otherPair = await generateKeyPair("RS256")
    const invalidAssertions = [
      await signedAssertion({ issuer: "https://attacker.cloudflareaccess.com" }),
      await signedAssertion({ audience: "other-application" }),
      await signedAssertion({ signingKey: otherPair.privateKey }),
      await signedAssertion({ expirationTime: Math.floor(Date.now() / 1000) - 60 }),
      await signedAssertion({ notBefore: Math.floor(Date.now() / 1000) + 60 }),
    ]

    for (const assertion of invalidAssertions) {
      expect(await cloudflareAccessUser(headers(assertion), jwks)).toBeNull()
    }
  })

  it("rejects missing required claims, non-app tokens, and email-header mismatch", async () => {
    const invalidAssertions = [
      await signedAssertion({ withIssuedAt: false }),
      await signedAssertion({ withNotBefore: false }),
      await signedAssertion({ type: "org" }),
      await signedAssertion({ email: "outsider@example.com" }),
    ]

    for (const assertion of invalidAssertions) {
      expect(await cloudflareAccessUser(headers(assertion), jwks)).toBeNull()
    }

    expect(await cloudflareAccessUser(
      headers(await signedAssertion(), "gabec@faithmeats.com"),
      jwks,
    )).toBeNull()
  })

  it("fails closed when disabled or when verifier configuration is incomplete", async () => {
    const assertion = await signedAssertion()

    process.env.ALLURA_CF_ACCESS_ENABLED = "false"
    expect(await cloudflareAccessUser(headers(assertion), jwks)).toBeNull()

    process.env.ALLURA_CF_ACCESS_ENABLED = "true"
    delete process.env.ALLURA_CF_ACCESS_AUDIENCE
    expect(await cloudflareAccessUser(headers(assertion), jwks)).toBeNull()

    process.env.ALLURA_CF_ACCESS_AUDIENCE = AUDIENCE
    process.env.ALLURA_CF_ACCESS_TEAM_DOMAIN = "http://faithmeats.cloudflareaccess.com"
    expect(await cloudflareAccessUser(headers(assertion), jwks)).toBeNull()
  })
})
