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

  it("maps configured admin emails to admin while founders remain distinct", () => {
    process.env.ALLURA_CF_ACCESS_ENABLED = "true"
    process.env.ALLURA_CF_ACCESS_ALLOWED_EMAILS = "sasheed@faithmeats.com,gabec@faithmeats.com,agent-browser-admin@local.test"
    process.env.ALLURA_CF_ACCESS_ADMIN_EMAILS = "sasheed@faithmeats.com,agent-browser-admin@local.test"
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
    const agentBrowser = cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "agent-browser-admin@local.test",
      "cf-access-jwt-assertion": "local-only",
    }))
    const outsider = cloudflareAccessUser(headers({
      "cf-access-authenticated-user-email": "outsider@example.com",
      "cf-access-jwt-assertion": "signed",
    }))

    expect(sabir).toMatchObject({ email: "sasheed@faithmeats.com", role: "admin", groupId: "allura-epic30-local" })
    expect(gabe).toMatchObject({ email: "gabec@faithmeats.com", role: "viewer" })
    expect(agentBrowser).toMatchObject({ email: "agent-browser-admin@local.test", role: "admin" })
    expect(gabe?.id).not.toBe(sabir?.id)
    expect(outsider).toBeNull()
  })
})
