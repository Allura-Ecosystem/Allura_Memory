import { existsSync, readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
}));

import LoginPage from "@/app/auth/v2/login/[[...sign-in]]/page";
import { CuratorHandoffContent } from "@/app/dashboard/curator/page";
import RootLayout from "@/app/layout";
import proxy from "@/proxy";
import { clearAuthConfig, isDevAuthActive } from "../config";
import { extractAlluraMetadata } from "../clerk";
import { AUTH_LOGIN_PATH, sanitizeRedirectTarget } from "../redirect-target";
import { resolveRouteAuthority } from "../route-scope-manifest";
import { getAuthUser } from "../api-auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  clearAuthConfig();
});

describe("Story 25.2b authenticated session entry", () => {
  it("reads Allura authority from the canonical custom session claim", () => {
    const claim = {
      role: "curator",
      groupId: "allura-acme",
      workspaceId: "workspace-a",
    };

    expect(() => extractAlluraMetadata(claim as never)).not.toThrow();
    expect(extractAlluraMetadata(claim as never)).toEqual(claim);
  });

  it("fails closed when Clerk authority metadata is missing or malformed", () => {
    expect(() => extractAlluraMetadata(undefined)).toThrow(/metadata/i);
    expect(() => extractAlluraMetadata({
      allura: { role: "owner", groupId: "not-a-group", workspaceId: "workspace-a" },
    } as never)).toThrow(/role|group/i);
  });

  it("adds real auth, login, and curator handoff surfaces", () => {
    expect(existsSync("src/lib/auth/redirect-target.ts")).toBe(true);
    expect(existsSync("src/app/auth/v2/login/[[...sign-in]]/page.tsx")).toBe(true);
    expect(existsSync("src/app/dashboard/curator/page.tsx")).toBe(true);
    expect(existsSync("src/app/unauthorized/page.tsx")).toBe(true);

    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("ClerkProvider");
    expect(layout).not.toContain('from "@clerk/nextjs"');
    expect(layout).not.toContain("ssr: false");
    expect(readFileSync("src/app/clerk-provider.tsx", "utf8")).toContain("dynamic(");

    const login = readFileSync("src/app/auth/v2/login/[[...sign-in]]/page.tsx", "utf8");
    expect(login).not.toContain('from "@clerk/nextjs"');
    expect(login).toContain("ClerkSignIn");
    expect(readFileSync("src/app/clerk-sign-in.tsx", "utf8")).toContain("dynamic(");
  });

  it("never enables DevAuthProvider in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ALLURA_DEV_AUTH_ENABLED = "true";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    clearAuthConfig();

    expect(isDevAuthActive()).toBe(false);
  });

  it("rejects partial downstream authority instead of fabricating defaults", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.ALLURA_DEV_AUTH_ENABLED = "true";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    clearAuthConfig();

    const request = new NextRequest("http://allura.local/dashboard/curator", {
      headers: { "x-allura-user-id": "user-clerk" },
    });

    expect(getAuthUser(request)).toBeNull();
  });

  it("keeps secretless production builds renderable while protected requests fail closed", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ALLURA_DEV_AUTH_ENABLED = "true";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    clearAuthConfig();

    const keylessMarkup = renderToStaticMarkup(RootLayout({ children: createElement("p", null, "keyless") }));
    expect(keylessMarkup).toContain("keyless");
    const loginMarkup = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({}) }),
    );
    expect(loginMarkup).toContain("Authentication unavailable");

    const login = await proxy(new NextRequest(`http://allura.local${AUTH_LOGIN_PATH}`));
    expect(login.status).toBe(200);
    expect(login.headers.get("location")).toBeNull();

    const denied = await proxy(new NextRequest("http://allura.local/dashboard/curator"));
    expect(denied.status).toBe(307);
    expect(denied.headers.get("location")).toContain("/auth/v2/login");
    expect(denied.headers.get("location")).not.toContain("/dashboard/curator");
    expect(isDevAuthActive()).toBe(false);
  });

  it("server-renders ClerkProvider when both Clerk keys are configured", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_configured";
    process.env.CLERK_SECRET_KEY = "sk_test_configured";
    clearAuthConfig();

    const markup = renderToStaticMarkup(
      RootLayout({ children: createElement("p", null, "configured") }),
    );

    expect(markup).toContain("configured");
  });

  it("keeps post-login redirects on the local application origin", () => {
    expect(sanitizeRedirectTarget("/dashboard/curator?tab=queue")).toBe(
      "/dashboard/curator?tab=queue",
    );
    expect(sanitizeRedirectTarget("//evil.example/steal")).toBe("/dashboard/curator");
    expect(sanitizeRedirectTarget("https://evil.example/steal")).toBe("/dashboard/curator");
    expect(sanitizeRedirectTarget("/\\evil.example/steal")).toBe("/dashboard/curator");
  });

  it("requires curator authority for the handoff page", () => {
    expect(resolveRouteAuthority("/dashboard/curator")).toMatchObject({
      kind: "declared",
      requiredRole: "curator",
    });
    expect(resolveRouteAuthority("/unauthorized")).toMatchObject({ kind: "public" });
  });

  it("smokes unauthenticated -> login -> authenticated -> curator", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.ALLURA_DEV_AUTH_ENABLED = "false";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    clearAuthConfig();

    const unauthenticated = await proxy(
      new NextRequest("http://allura.local/dashboard/curator"),
    );
    expect(unauthenticated.status).toBe(307);
    expect(unauthenticated.headers.get("location")).toContain("/auth/v2/login");

    process.env.ALLURA_DEV_AUTH_ENABLED = "true";
    process.env.ALLURA_DEV_AUTH_ROLE = "curator";
    process.env.ALLURA_DEV_AUTH_GROUP_ID = "allura-acme";
    process.env.ALLURA_DEV_AUTH_WORKSPACE_ID = "workspace-a";
    clearAuthConfig();

    const authenticated = await proxy(
      new NextRequest("http://allura.local/dashboard/curator"),
    );
    expect(authenticated.status).toBe(200);
    expect(authenticated.headers.get("x-middleware-request-x-allura-group-id")).toBe("allura-acme");
    expect(authenticated.headers.get("x-middleware-request-x-allura-workspace-id")).toBe("workspace-a");

    const downstream = new NextRequest("http://allura.local/dashboard/curator", {
      headers: {
        "x-allura-user-id": authenticated.headers.get("x-middleware-request-x-allura-user-id") ?? "",
        "x-allura-role": authenticated.headers.get("x-middleware-request-x-allura-role") ?? "",
        "x-allura-group-id": authenticated.headers.get("x-middleware-request-x-allura-group-id") ?? "",
        "x-allura-workspace-id": authenticated.headers.get("x-middleware-request-x-allura-workspace-id") ?? "",
        "x-allura-session-id": authenticated.headers.get("x-middleware-request-x-allura-session-id") ?? "",
      },
    });
    const user = getAuthUser(downstream);
    expect(user).toMatchObject({
      id: "dev-user-allura",
      role: "curator",
      groupId: "allura-acme",
      workspaceId: "workspace-a",
    });

    const markup = renderToStaticMarkup(createElement(CuratorHandoffContent, { user: user! }));
    expect(markup).toContain("dev-user-allura");
    expect(markup).toContain("workspace-a");
    expect(markup).toContain("allura-acme");
    expect(markup).toContain("curator");
  });
});
