import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"
import { parseFirstUseRuntimeSecrets } from "../../scripts/first-use-local-fixture"

const source = readFileSync(new URL("../../docker-compose.first-use.yml", import.meta.url), "utf8")
interface Service {
  profiles: string[]; container_name?: string; env_file?: unknown; external_links?: unknown; extra_hosts?: unknown;
  networks: string[]; ports?: string[]; environment?: Record<string, unknown>; volumes?: string[];
  cpus: number; mem_limit: string; pids_limit: number; depends_on?: Record<string, { condition: string }>; command?: string[];
}
const model = parse(source) as { services: Record<string, Service>; volumes: Record<string, object>; networks: Record<string, object>; [key: string]: unknown }

describe("AD-71 offline profile safety and readiness boundaries", () => {
  it.each(["malformed", "invalid-shape", "missing", "valid"])("runs the actual entry wrapper with a synthetic %s configuration seam", async (scenario) => {
    const marker = "SYNTHETIC_TRIAL_SECRET_MARKER_FOR_REVIEW"
    const synthetic = { POSTGRES_APP_PASSWORD: "SYNTHETIC_APP_PASSWORD".repeat(2), ALLURA_MCP_TOKEN_SECRET: marker, RUVIX_CONTROL_PLANE_SECRET: marker }
    const dockerfile = readFileSync(new URL("../../docker/first-use/Dockerfile.mcp", import.meta.url), "utf8")
    const entry = dockerfile.match(/COPY <<'EOF' \/app\/first-use-entry\.ts\n([\s\S]*?)\nEOF/)
    expect(entry).not.toBeNull()
    // Execute the actual body with inert read/process/import seams. No mounted
    // file, real process environment, gateway, subprocess or network is used.
    const body = entry![1].replace(/^import .*;\n/gm, "")
      .replace('await import("./src/mcp/canonical-http-gateway.ts");', "await importGateway();")
    const run = new Function("readFileSync", "parseFirstUseRuntimeSecrets", "process", "importGateway", `return (async () => {\n${body}\n})();`) as (...args: unknown[]) => Promise<void>
    const exit = new Error("SYNTHETIC_EXIT")
    let stderr = ""
    let imported = false
    let exitCode: number | undefined
    const env: Record<string, string> = {}
    const completion = run((path: string, encoding: string) => {
      expect(path).toBe("/run/secrets/first_use_mcp")
      expect(encoding).toBe("utf8")
      if (scenario === "missing") throw new Error(marker)
      return scenario === "malformed" ? marker : JSON.stringify(scenario === "valid" ? synthetic : { marker })
    }, parseFirstUseRuntimeSecrets, { env, stderr: { write: (text: string) => { stderr += text } }, exit: (code: number) => { exitCode = code; throw exit } }, async () => { imported = true })
    if (scenario === "valid") {
      await expect(completion).resolves.toBeUndefined()
      expect(imported).toBe(true)
      expect(stderr).toBe("")
      expect(exitCode).toBeUndefined()
      expect(env.POSTGRES_PASSWORD).toBe(synthetic.POSTGRES_APP_PASSWORD)
    } else {
      await expect(completion).rejects.toBe(exit)
      expect(exitCode).toBe(1)
      expect(stderr).toBe("First-use secret configuration invalid\n")
      expect(stderr).not.toContain(marker)
      expect(imported).toBe(false)
      expect(env).toEqual({})
    }
  })
  it("owns resources without inheriting primary storage, networks, host env or fixed containers", () => {
    expect(model.volumes).toEqual({ postgres_data: {}, model_data: {} })
    expect(model.networks).toEqual({ trial: {} })
    for (const service of Object.values(model.services)) {
      expect(service.container_name).toBeUndefined()
      expect(service.env_file).toBeUndefined()
      expect(service.extra_hosts).toBeUndefined()
      expect(service.external_links).toBeUndefined()
      expect(service.networks).toEqual(["trial"])
    }
    expect(source).not.toMatch(/knowledge-postgres|memory_postgres_data|open-webui-stack|external:\s*true/)
    expect(model.services.postgres.volumes).toContain("postgres_data:/var/lib/postgresql/data")
  })
  it("publishes only loopback API access and does not expose PostgreSQL/provider", () => {
    expect(model.services.mcp.ports).toEqual(["127.0.0.1:6487:6487"])
    for (const [name, service] of Object.entries(model.services)) if (name !== "mcp") expect(service.ports).toBeUndefined()
  })
  it("keeps bootstrap unavailable and the MCP service behind an explicit provisioned profile", () => {
    expect(model["x-allura-first-use"]).toMatchObject({ state: "preparation_only", bootstrap: "blocked_no_verified_mcp_database_adapter", schema_alignment: "blocked_pending_verified_exact_target" })
    expect(model.services.mcp.profiles).toEqual(["provisioned"])
    expect(model.services.mcp.environment).toMatchObject({ NODE_ENV: "production", POSTGRES_USER: "allura_app", POSTGRES_APP_USER: "allura_app" })
    expect(model.services.mcp.environment).not.toHaveProperty("ALLURA_MCP_DEV_AUTH")
    expect(model.services.mcp.environment).not.toHaveProperty("ALLURA_MCP_AUTH_TOKEN")
  })
  it("bounds every service and makes model pull explicit rather than automatic permission", () => {
    for (const service of Object.values(model.services)) {
      expect(service.cpus).toBeGreaterThan(0)
      expect(service.mem_limit).toMatch(/^\d+[mg]$/)
      expect(service.pids_limit).toBeGreaterThan(0)
    }
    expect(model.services["model-pull"].environment?.FIRST_USE_ALLOW_MODEL_PULL).toBe("${FIRST_USE_ALLOW_MODEL_PULL:-no}")
    expect(model.services["model-pull"].command?.join(" ")).toContain('= "yes"')
  })
  it("uses frozen Bun dependencies with workspace manifests present, and no baked trial secrets", () => {
    const dockerfile = readFileSync(new URL("../../docker/first-use/Dockerfile.mcp", import.meta.url), "utf8")
    expect(dockerfile).toContain("FROM oven/bun:1.3.14")
    expect(dockerfile.indexOf("COPY packages")).toBeLessThan(dockerfile.indexOf("RUN bun install --frozen-lockfile"))
    expect(dockerfile).not.toMatch(/COPY\s+\.\s|COPY.*\.env|ARG.*PASSWORD/)
    expect(dockerfile).toContain("/run/secrets/first_use_mcp")
    expect(source).toContain("${FIRST_USE_POSTGRES_IMAGE:?")
    expect(source).toContain("${FIRST_USE_OLLAMA_IMAGE:?")
    expect(source).not.toContain(":latest")
  })
  it("uses image-specific context allowlists without inheriting primary private files", () => {
    const mcpIgnore = readFileSync(new URL("../../docker/first-use/Dockerfile.mcp.dockerignore", import.meta.url), "utf8")
    const pgIgnore = readFileSync(new URL("../../docker/first-use/Dockerfile.postgres.dockerignore", import.meta.url), "utf8")
    expect(mcpIgnore).toContain("!packages/**/package.json")
    expect(mcpIgnore).toContain("!packages/**/src/**")
    expect(mcpIgnore).toContain("!packages/sdk/dist/**")
    for (const text of [mcpIgnore, pgIgnore]) {
      expect(text.split("\n").filter((line) => line && !line.startsWith("#"))[0]).toBe("**")
      for (const pattern of ["**/.env*", "**/node_modules/**", "**/.allura/**", "**/private-fixtures/**", "**/secrets/**"]) expect(text).toContain(pattern)
      expect(text.lastIndexOf("**/.env*")).toBeGreaterThan(text.lastIndexOf("!"))
    }
    expect(pgIgnore).toContain("!docker/postgres-init/*.sql")
    expect(model.services.postgres).not.toHaveProperty("env_file")
  })
  it("uses TCP process readiness so the temporary socket-only initialization server cannot pass", () => {
    expect(source).toContain('pg_isready -h 127.0.0.1 -U first_use_owner')
    const gateway = readFileSync(new URL("../../src/mcp/canonical-http-gateway.ts", import.meta.url), "utf8")
    expect(gateway).toContain("server.listen(PORT, HTTP_HOST")
    expect(gateway).not.toContain("import.meta.main")
  })
  it("requires actual model identity and real finite embeddings before starting MCP", () => {
    const job = model.services["embedding-ready"].command?.join(" ") ?? ""
    expect(job).toContain("/api/tags")
    expect(job).toContain("assertFirstUseModelIdentity(await tags.json()")
    expect(job).toContain("/v1/embeddings")
    expect(job).toContain("assertFirstUseEmbeddingResponse")
    expect(job).toContain("response.ok")
    expect(model.services.mcp.depends_on?.["embedding-ready"].condition).toBe("service_completed_successfully")
  })
  it("keeps the empty-schema proposal out of automatic initialization and refuses nonempty/unknown schemas", () => {
    const pgDockerfile = readFileSync(new URL("../../docker/first-use/Dockerfile.postgres", import.meta.url), "utf8")
    const sql = readFileSync(new URL("../../docker/first-use/empty-schema-alignment.sql", import.meta.url), "utf8")
    expect(pgDockerfile).not.toMatch(/^COPY.*empty-schema-alignment/m)
    expect(sql).toContain("current_database() IS DISTINCT FROM expected_database")
    expect(sql.indexOf("ACCESS EXCLUSIVE")).toBeLessThan(sql.indexOf("ALTER TABLE public.allura_memories"))
    expect(sql.indexOf("ACCESS EXCLUSIVE")).toBeLessThan(sql.indexOf("pg_catalog.row_security_active"))
    expect(sql.indexOf("pg_catalog.row_security_active")).toBeLessThan(sql.indexOf("IF EXISTS (SELECT 1 FROM public.allura_memories"))
    expect(sql).toContain("IF EXISTS (SELECT 1 FROM public.allura_memories LIMIT 1)")
    expect(sql).toContain("original_type IS DISTINCT FROM 'vector(4096)'")
    expect(sql).not.toMatch(/USING\s+NULL|DROP\s+INDEX|UPDATE\s+allura_memories|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(sql).toContain("CREATE INDEX allura_mem_hnsw")
    expect(sql).toContain("WHERE embedding IS NOT NULL AND deleted_at IS NULL")
  })
})
