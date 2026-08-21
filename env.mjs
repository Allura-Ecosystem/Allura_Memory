import { createEnv } from "@t3-oss/env-nextjs"
import { config, parse } from "dotenv"
import { z } from "zod"
import { existsSync, readFileSync } from "fs"

// Load base config plus local overrides without clobbering already-injected
// runtime environment variables. This keeps Docker/CI/Varlock injection
// authoritative while still allowing .env.local to override .env on disk.
function loadEnvFiles() {
  const merged = {}

  for (const path of [".env", ".env.local"]) {
    if (!existsSync(path)) continue
    Object.assign(merged, parse(readFileSync(path)))
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadEnvFiles()

export const env = createEnv({
  server: {
    // Build tooling
    ANALYZE: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),

    // PostgreSQL (episodic traces)
    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_DB: z.string().default("memory"),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_POOL_MAX: z.coerce.number().default(10),

    // Neo4j (knowledge graph)
    NEO4J_URI: z.string().default("bolt://localhost:7687"),
    NEO4J_USER: z.string().default("neo4j"),
    NEO4J_PASSWORD: z.string().optional(),
    NEO4J_HEAP_INITIAL: z.string().default("512m"),
    NEO4J_HEAP_MAX: z.string().default("2G"),
    NEO4J_PAGECACHE: z.string().default("1G"),

    // RuVector (vector + hybrid search, port 5433)
    RUVECTOR_HOST: z.string().default("localhost"),
    RUVECTOR_PORT: z.coerce.number().default(5433),
    RUVECTOR_DB: z.string().default("memory"),
    RUVECTOR_USER: z.string().default("ronin4life"),
    RUVECTOR_PASSWORD: z.string().optional(),

    // Ollama (embedding generation)
    OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
    OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),

    // RuVix control plane
    RUVIX_CONTROL_PLANE_SECRET: z.string().min(32).optional(),
    // Routes memory() writes to the direct adapter backend instead of syscall_mutate.
    // Migration escape hatch per AD-40. The pre-rename name MEMORY_BYPASS_KERNEL is
    // still honoured as a deprecated fallback (see src/lib/memory/writer.ts).
    MEMORY_BYPASS_CONTROL_PLANE: z.string().optional(),
    MEMORY_BYPASS_KERNEL: z.string().optional(),

    // Multi-tenancy
    DEFAULT_GROUP_ID: z.string().default("allura-default"),

    // Dev auth (no Clerk needed locally)
    ALLURA_DEV_AUTH_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    ALLURA_DEV_AUTH_ROLE: z.enum(["admin", "curator", "viewer"]).default("admin"),
    ALLURA_DEV_AUTH_GROUP_ID: z.string().default("allura-system"),
    ALLURA_DEV_AUTH_USER_ID: z.string().default("dev-user-allura"),
    ALLURA_DEV_AUTH_EMAIL: z.string().default("dev@allura.local"),

    // Node environment
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },

  client: {
    // Clerk (optional — production only)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  },

  runtimeEnv: {
    ANALYZE: process.env.ANALYZE,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_DB: process.env.POSTGRES_DB,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_POOL_MAX: process.env.POSTGRES_POOL_MAX,
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USER: process.env.NEO4J_USER,
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
    NEO4J_HEAP_INITIAL: process.env.NEO4J_HEAP_INITIAL,
    NEO4J_HEAP_MAX: process.env.NEO4J_HEAP_MAX,
    NEO4J_PAGECACHE: process.env.NEO4J_PAGECACHE,
    RUVECTOR_HOST: process.env.RUVECTOR_HOST,
    RUVECTOR_PORT: process.env.RUVECTOR_PORT,
    RUVECTOR_DB: process.env.RUVECTOR_DB,
    RUVECTOR_USER: process.env.RUVECTOR_USER,
    RUVECTOR_PASSWORD: process.env.RUVECTOR_PASSWORD,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    RUVIX_CONTROL_PLANE_SECRET: process.env.RUVIX_CONTROL_PLANE_SECRET,
    MEMORY_BYPASS_CONTROL_PLANE: process.env.MEMORY_BYPASS_CONTROL_PLANE,
    MEMORY_BYPASS_KERNEL: process.env.MEMORY_BYPASS_KERNEL,
    DEFAULT_GROUP_ID: process.env.DEFAULT_GROUP_ID,
    ALLURA_DEV_AUTH_ENABLED: process.env.ALLURA_DEV_AUTH_ENABLED,
    ALLURA_DEV_AUTH_ROLE: process.env.ALLURA_DEV_AUTH_ROLE,
    ALLURA_DEV_AUTH_GROUP_ID: process.env.ALLURA_DEV_AUTH_GROUP_ID,
    ALLURA_DEV_AUTH_USER_ID: process.env.ALLURA_DEV_AUTH_USER_ID,
    ALLURA_DEV_AUTH_EMAIL: process.env.ALLURA_DEV_AUTH_EMAIL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
