/**
 * Clerk Removal Contract — Epic 30 recovery slice.
 *
 * User directive: fully remove Clerk from the active dashboard runtime and
 * package, moving toward Cloudflare Access only. This test is written FIRST
 * (TDD RED) and asserts the end-state contract:
 *
 *   - No @clerk packages in package.json or bun.lock.
 *   - No source file under src/ imports @clerk.
 *   - Clerk provider/sign-in component files and lib/auth/clerk.ts do not exist.
 *   - Active env schema/examples expose no NEXT_PUBLIC_CLERK_* / CLERK_SECRET_KEY.
 *   - Layout has no Clerk provider wrapper.
 *   - Production with Cloudflare Access disabled (and dev flag forced on)
 *     still yields no principal and denies.
 *   - Nonproduction explicit DevAuth remains available.
 *   - Login page has no sign-in component/form and truthfully states
 *     Cloudflare Access or auth unavailable.
 *
 * Context7 receipt (/clerk/clerk-nextjs-app-quickstart): Clerk integration
 * surfaces are ClerkProvider, clerkMiddleware, and SignIn — all must disappear.
 */
import { NextRequest } from "next/server"
import { type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import LoginPage from "@/app/auth/v2/login/[[...sign-in]]/page"
import RootLayout from "@/app/layout"
import { clearAuthConfig, isDevAuthActive } from "@/lib/auth/config"
import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import proxy from "@/proxy"

vi.mock("server-only", () => ({}))

function renderToStaticMarkupAdapter(element: ReactElement): string {
  return renderToStaticMarkup(element)
}

const PROJECT_ROOT = process.cwd()
const originalEnv = { ...process.env }

function readProjectFile(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8")
}

function listSourceFiles(directory: string): string[] {
  const entries = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", directory],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter((line) => line.length > 0)
  return entries
}

const CLERK_RUNTIME_REFERENCE = /(?:\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?|\b(?:import|require)\s*\(\s*)["']@clerk\//s

function hasClerkRuntimeReference(source: string): boolean {
  return CLERK_RUNTIME_REFERENCE.test(source)
}

beforeEach(() => {
  process.env = { ...originalEnv }
  clearAuthConfig()
})

afterEach(() => {
  process.env = { ...originalEnv }
  clearAuthConfig()
})

// ── Package surface ─────────────────────────────────────────────────────────

describe("Clerk removal contract — package surface", () => {
  it("package.json contains no @clerk dependencies", () => {
    const pkg = readProjectFile("package.json")
    expect(pkg).not.toMatch(/@clerk\//)
    expect(pkg).not.toMatch(/"@clerk[^"]*"/)
  })

  it("bun.lock contains no @clerk packages", () => {
    const lock = readProjectFile("bun.lock")
    expect(lock).not.toMatch(/@clerk\//)
  })
})

// ── Source import surface ──────────────────────────────────────────────────

describe("Clerk removal contract — source imports", () => {
  it("detects static imports, dynamic imports, requires, and re-exports", () => {
    expect(hasClerkRuntimeReference("import { auth } from '@clerk/nextjs/server'")).toBe(true)
    expect(hasClerkRuntimeReference("const sdk = await import('@clerk/nextjs/server')")).toBe(true)
    expect(hasClerkRuntimeReference("const sdk = require('@clerk/nextjs/server')")).toBe(true)
    expect(hasClerkRuntimeReference("export { auth } from '@clerk/nextjs/server'")).toBe(true)
    expect(hasClerkRuntimeReference("expect(source).not.toMatch(/@clerk\\//)")).toBe(false)
  })

  it("no source file under src imports @clerk", () => {
    const srcFiles = listSourceFiles("src")
    expect(srcFiles.length).toBeGreaterThan(1000)
    const offenders: string[] = []
    for (const file of srcFiles) {
      if (!/\.(ts|tsx|mjs|cjs|js|jsx)$/.test(file)) continue
      if (file === "src/lib/auth/__tests__/clerk-removal-contract.test.ts") continue
      const filePath = join(PROJECT_ROOT, file)
      if (!existsSync(filePath)) continue
      const content = readFileSync(filePath, "utf8")
      if (hasClerkRuntimeReference(content)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it("dedicated Clerk runtime files no longer exist", () => {
    expect(existsSync(join(PROJECT_ROOT, "src/app/clerk-provider.tsx"))).toBe(false)
    expect(existsSync(join(PROJECT_ROOT, "src/app/clerk-sign-in.tsx"))).toBe(false)
    expect(existsSync(join(PROJECT_ROOT, "src/lib/auth/clerk.ts"))).toBe(false)
  })
})

// ── Environment surface ────────────────────────────────────────────────────

describe("Clerk removal contract — environment surface", () => {
  const CLERK_ENV_KEY = /NEXT_PUBLIC_CLERK_|CLERK_SECRET_KEY/

  it("env.mjs does not expose Clerk keys", () => {
    expect(readProjectFile("env.mjs")).not.toMatch(CLERK_ENV_KEY)
  })

  it(".env.example does not expose Clerk keys", () => {
    expect(readProjectFile(".env.example")).not.toMatch(CLERK_ENV_KEY)
  })

  it(".env.portfolio.example does not expose Clerk keys", () => {
    expect(readProjectFile(".env.portfolio.example")).not.toMatch(CLERK_ENV_KEY)
  })

  it("scripts/restore-on-laptop.sh does not mention Clerk keys", () => {
    expect(readProjectFile("scripts/restore-on-laptop.sh")).not.toMatch(CLERK_ENV_KEY)
  })

  it("operator examples keep the unverified Cloudflare path disabled", () => {
    const envExample = readProjectFile(".env.example")
    const restoreScript = readProjectFile("scripts/restore-on-laptop.sh")

    for (const source of [envExample, restoreScript]) {
      expect(source).toContain("ALLURA_CF_ACCESS_ENABLED=false")
      expect(source).not.toContain("ALLURA_CF_ACCESS_ENABLED=true")
      expect(source).toMatch(/cryptographic|signature/i)
      expect(source).toMatch(/blocked|do not enable/i)
    }
  })

  it("the auth env schema no longer declares Clerk keys", async () => {
    const { authEnvSchema } = await import("@/lib/auth/config")
    const shape = authEnvSchema.shape as Record<string, unknown>
    const clerkKeys = Object.keys(shape).filter((key) => CLERK_ENV_KEY.test(key))
    expect(clerkKeys).toEqual([])
  })
})

// ── Layout provider surface ────────────────────────────────────────────────

describe("Clerk removal contract — layout provider", () => {
  it("layout has no Clerk provider wrapper", async () => {
    const layout = readProjectFile("src/app/layout.tsx")
    expect(layout).not.toMatch(/Clerk/i)
    expect(layout).not.toMatch(/@clerk/)

    const markup = renderToStaticMarkupAdapter(RootLayout({ children: "plain-children" }))
    expect(markup).toContain("plain-children")
    expect(markup).not.toMatch(/clerk/i)
  })
})

// ── Runtime fail-closed / DevAuth contracts ────────────────────────────────

describe("Clerk removal contract — production fail-closed and DevAuth", () => {
  it("production with CF Access disabled and dev flag true yields no principal", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production"
    process.env.ALLURA_CF_ACCESS_ENABLED = "false"
    process.env.ALLURA_DEV_AUTH_ENABLED = "true"

    const principal = await getDashboardPrincipal()
    expect(principal).toBeNull()
    expect(isDevAuthActive()).toBe(false)
  })

  it("production with CF Access disabled denies protected routes and redirects to login", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production"
    process.env.ALLURA_CF_ACCESS_ENABLED = "false"
    process.env.ALLURA_DEV_AUTH_ENABLED = "true"

    const response = await proxy(
      new NextRequest("http://allura.local/dashboard/curator"),
    )
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toContain("/auth/v2/login")
    expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
  })

  it("nonproduction explicit DevAuth remains available", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.ALLURA_DEV_AUTH_ENABLED = "true"

    expect(isDevAuthActive()).toBe(true)
  })

  it("nonproduction with explicit DevAuth forwards the dev principal upstream", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.ALLURA_DEV_AUTH_ENABLED = "true"
    process.env.ALLURA_DEV_AUTH_ROLE = "admin"
    process.env.ALLURA_DEV_AUTH_GROUP_ID = "allura-system"
    process.env.ALLURA_DEV_AUTH_USER_ID = "dev-user-allura"

    const response = await proxy(
      new NextRequest("http://allura.local/memory"),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBe("dev-user-allura")
    expect(response.headers.get("x-middleware-request-x-allura-role")).toBe("admin")
  })
})

// ── Login page surface ─────────────────────────────────────────────────────

describe("Clerk removal contract — informational login page", () => {
  it("has no sign-in component or form and never imports @clerk", async () => {
    const source = readProjectFile("src/app/auth/v2/login/[[...sign-in]]/page.tsx")
    expect(source).not.toMatch(/@clerk/)
    expect(source).not.toMatch(/<form|ClerkSignIn|SignIn\b/)
    expect(source).not.toContain("sanitizeRedirectTarget")

    const markup = renderToStaticMarkupAdapter(
      LoginPage(),
    )
    expect(markup).not.toMatch(/<form/i)
  })

  it("production without CF identity says authentication is unavailable and Cloudflare Access is required", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production"
    process.env.ALLURA_CF_ACCESS_ENABLED = "false"

    const markup = renderToStaticMarkupAdapter(
      LoginPage(),
    )
    expect(markup).toContain("Authentication unavailable")
    expect(markup).toMatch(/Cloudflare Access/i)
  })

  it("nonproduction with active DevAuth says development authentication is active", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.ALLURA_DEV_AUTH_ENABLED = "true"

    const markup = renderToStaticMarkupAdapter(
      LoginPage(),
    )
    expect(markup).toContain("Development authentication is active")
  })

  it("nonproduction with DevAuth disabled says development authentication is unavailable", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.ALLURA_DEV_AUTH_ENABLED = "false"

    const markup = renderToStaticMarkupAdapter(
      LoginPage(),
    )
    expect(markup).toContain("Development authentication unavailable")
  })
})