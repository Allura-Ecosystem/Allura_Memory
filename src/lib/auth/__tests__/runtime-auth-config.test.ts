import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import {
  clearRuntimeAuthConfigForTests,
  readRuntimeAuthConfig,
  setRuntimeAuthConfigForTests,
} from "../runtime-auth-config"
import { clearAuthConfig, getRuntimeAuthStrategy } from "../config"
import { getDevUserSync } from "../dev-auth"
import proxy from "@/proxy"

afterEach(() => {
  clearRuntimeAuthConfigForTests()
  clearAuthConfig()
})

describe("runtime auth manifest", () => {
  it("fails closed when the production manifest is absent", () => {
    expect(() => readRuntimeAuthConfig({ environment: "production", manifestPath: "/tmp/allura-missing-runtime-auth.json" }))
      .toThrow("Runtime auth manifest is required in production")
  })

  it("fails closed when the production manifest is malformed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "allura-runtime-auth-"))
    const manifestPath = join(directory, "runtime-auth.json")
    await writeFile(manifestPath, "not-json")

    try {
      expect(() => readRuntimeAuthConfig({ environment: "production", manifestPath }))
        .toThrow("Runtime auth manifest is invalid in production")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("drives the DevAuth principal and Proxy from one manifest", async () => {
    setRuntimeAuthConfigForTests({
      environment: "development",
      devAuthEnabled: true,
      devAuthForce: true,
      devAuthRole: "curator",
      devAuthGroupId: "allura-runtime-test",
      devAuthUserId: "runtime-auth-user",
      devAuthEmail: "runtime-auth@example.test",
      devAuthWorkspaceId: "runtime-auth-workspace",
      clerkConfigured: false,
    })

    expect(getRuntimeAuthStrategy()).toBe("dev")
    expect(getDevUserSync()).toMatchObject({
      id: "runtime-auth-user",
      role: "curator",
      groupId: "allura-runtime-test",
      workspaceId: "runtime-auth-workspace",
    })

    const response = await proxy(
      new NextRequest("http://localhost/dashboard/mission-control"),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBe("runtime-auth-user")
  })

  it("never selects DevAuth for a production manifest", () => {
    setRuntimeAuthConfigForTests({
      environment: "production",
      devAuthEnabled: true,
      devAuthForce: true,
      devAuthRole: "admin",
      devAuthGroupId: "allura-system",
      devAuthUserId: "should-not-authenticate",
      devAuthEmail: "dev@allura.local",
      devAuthWorkspaceId: "workspace-allura",
      clerkConfigured: false,
    })

    expect(getRuntimeAuthStrategy()).toBe("keyless-production")
    expect(getDevUserSync()).toBeNull()
  })
})
