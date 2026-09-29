import { afterEach, describe, expect, it } from "vitest"

import { cloudflareAccessUser } from "../cloudflare-access"

const original = { ...process.env }
afterEach(() => { process.env = { ...original } })

function headers(values: Record<string, string>): Headers {
  return new Headers(values)
}

describe("Cloudflare Access founder identity", () => {
  it("fails closed unless explicitly enabled with an Access assertion", () => {
    process.env.ALLURA_CF_ACCESS_ENABLED = "false"
    expect(cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "sasheed@faithmeats.com",
      "cf-access-jwt-assertion": "signed",
    }))).toBeNull()

    process.env.ALLURA_CF_ACCESS_ENABLED = "true"
    process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS = "sasheed@faithmeats.com"
    expect(cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "sasheed@faithmeats.com",
    }))).toBeNull()
  })

  it("accepts only configured founders as distinct viewer principals", () => {
    process.env.ALLURA_CF_ACCESS_ENABLED = "true"
    process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS = "sasheed@faithmeats.com,gabec@faithmeats.com"
    process.env.ALLURA_CF_ACCESS_GROUP_ID = "allura-epic30-local"
    process.env.ALLURA_CF_ACCESS_WORKSPACE_ID = "epic30-local-workspace"

    const sabir = cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "SASHEED@FAITHMEATS.COM",
      "cf-access-jwt-assertion": "signed",
    }))
    const gabe = cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "gabec@faithmeats.com",
      "cf-access-jwt-assertion": "signed",
    }))
    const outsider = cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "outsider@example.com",
      "cf-access-jwt-assertion": "signed",
    }))

    expect(sabir).toMatchObject({ email: "sasheed@faithmeats.com", role: "viewer", groupId: "allura-epic30-local" })
    expect(gabe?.id).not.toBe(sabir?.id)
    expect(outsider).toBeNull()
  })
})
