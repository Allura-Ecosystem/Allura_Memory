import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const manifestPath = "/app/.allura/runtime-auth.json"
const environment = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test"
  ? process.env.NODE_ENV
  : "development"

const manifest = {
  environment,
  devAuthEnabled: process.env.ALLURA_DEV_AUTH_ENABLED !== "false",
  devAuthForce: process.env.ALLURA_DEMO_DEV_AUTH_FORCE === "true",
  devAuthRole: process.env.ALLURA_DEV_AUTH_ROLE ?? "admin",
  devAuthGroupId: process.env.ALLURA_DEV_AUTH_GROUP_ID ?? "allura-system",
  devAuthUserId: process.env.ALLURA_DEV_AUTH_USER_ID ?? "dev-user-allura",
  devAuthEmail: process.env.ALLURA_DEV_AUTH_EMAIL ?? "dev@allura.local",
  devAuthWorkspaceId: process.env.ALLURA_DEV_AUTH_WORKSPACE_ID ?? "workspace-allura",
  clerkConfigured:
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && Boolean(process.env.CLERK_SECRET_KEY),
}

await mkdir(dirname(manifestPath), { recursive: true })
await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 })
