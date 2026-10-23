import { afterEach, describe, expect, it } from "vitest"
import { parse } from "yaml"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"

import { createDatabaseReadinessPlan, createPlan, devSafeProjectName } from "../../scripts/dev-safe/commands"
import {
  assertActivationAllowed,
  assertLocalPrerequisites,
  assertSafeWorktree,
  buildEnvironment,
  inspectExecutable,
  readPortConfiguration,
} from "../../scripts/dev-safe/environment"

const root = "/worktrees/allura-memory"
const tools = { runtime: "/opt/bun/bin/bun", docker: "/usr/bin/docker" }
const bunCandidate = (process.env.PATH ?? "")
  .split(delimiter)
  .map((directory) => join(directory, "bun"))
  .find(existsSync)
const bunExecutable = inspectExecutable(bunCandidate, "test Bun runtime")
const bunVersion = spawnSync(bunExecutable, ["--version"], { encoding: "utf8" }).stdout.trim()
const temporaryRoots: string[] = []

afterEach(() => {
  delete process.env.OPENAI_API_KEY
  delete process.env.ALLURA_MCP_HTTP_PORT
  delete process.env.NODE_OPTIONS
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

function linkedWorktree(): string {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "allura-dev-safe-"))
  temporaryRoots.push(temporaryRoot)
  writeFileSync(join(temporaryRoot, ".git"), "gitdir: /fixture/repo/worktrees/dev-safe\n")
  return temporaryRoot
}

function launcherFixture(): { root: string; dockerLog: string; dockerEnvironmentLog: string; path: string } {
  const temporaryRoot = linkedWorktree()
  mkdirSync(join(temporaryRoot, "scripts"))
  cpSync(join(process.cwd(), "scripts/dev-safe"), join(temporaryRoot, "scripts/dev-safe"), {
    recursive: true,
  })
  writeFileSync(join(temporaryRoot, "package.json"), JSON.stringify({ packageManager: `bun@${bunVersion}` }))
  for (const path of [
    "docker-compose.dev-safe.yml",
    "docker/portfolio-postgres/Dockerfile",
    "docker/portfolio-postgres/Dockerfile.dockerignore",
    "node_modules/next/dist/bin/next",
    "node_modules/vitest/vitest.mjs",
    "node_modules/typescript/bin/tsc",
  ]) {
    const absolute = join(temporaryRoot, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, "fixture")
  }
  const toolsDirectory = join(temporaryRoot, "tools")
  const dockerLog = join(temporaryRoot, "docker.log")
  const dockerEnvironmentLog = join(temporaryRoot, "docker-environment.log")
  mkdirSync(toolsDirectory)
  const docker = join(toolsDirectory, "docker")
  writeFileSync(
    docker,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${dockerLog}'\nprintf 'OPENAI_API_KEY=%s\\nDOCKER_HOST=%s\\nALLURA_MCP_HTTP_PORT=%s\\n' "\${OPENAI_API_KEY-unset}" "\${DOCKER_HOST-unset}" "\${ALLURA_MCP_HTTP_PORT-unset}" >> '${dockerEnvironmentLog}'\nprintf '2.30.0\\n'\n`
  )
  chmodSync(docker, 0o755)
  return {
    root: temporaryRoot,
    dockerLog,
    dockerEnvironmentLog,
    path: [toolsDirectory, dirname(bunExecutable), "/usr/bin", "/bin"].join(":"),
  }
}

describe("fixed dev-safe command plans", () => {
  const plan = (name: string) => createPlan(root, [name], tools, { dashboard: 45678, postgres: 45679 })

  it("uses the inspected runtime executable for the loopback dashboard", () => {
    expect(plan("dev").argv).toEqual([
      tools.runtime,
      `${root}/node_modules/next/dist/bin/next`,
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "45678",
    ])
  })

  it("rejects unknown commands, forwarded flags, and missing ports", () => {
    expect(() => plan("brain:down")).toThrow(/Unknown command/)
    expect(() => createPlan(root, ["dev", "--port", "4001"], tools, {})).toThrow(/Exactly one command/)
    expect(() => createPlan(root, ["dev"], tools, {})).toThrow(/ALLURA_DEV_SAFE_DASHBOARD_PORT/)
    expect(() => createPlan(root, ["dev"], tools, { dashboard: 45678 })).toThrow(/ALLURA_DEV_SAFE_POSTGRES_PORT/)
  })

  it.each(["status", "db-up", "db-down"])(
    "scopes %s to the inspected Docker executable, project, and compose file",
    (name) => {
      const argv = plan(name).argv
      expect(argv.slice(0, 13)).toEqual([
        tools.docker,
        "--host",
        "unix:///var/run/docker.sock",
        "compose",
        "--project-name",
        devSafeProjectName(root),
        "--project-directory",
        root,
        "--env-file",
        "/dev/null",
        "--file",
        `${root}/docker-compose.dev-safe.yml`,
        name === "status" ? "ps" : name === "db-up" ? "up" : "down",
      ])
      if (name === "db-up") {
        expect(argv.slice(13)).toEqual(["--detach", "--build", "--wait", "--wait-timeout", "120", "postgres"])
      }
    }
  )

  it("runs typecheck and focused tests through the inspected runtime", () => {
    expect(plan("typecheck").argv).toEqual([
      tools.runtime,
      `${root}/node_modules/typescript/bin/tsc`,
      "--noEmit",
      "--incremental",
      "false",
    ])
    expect(plan("test:launcher").argv).toEqual([
      tools.runtime,
      `${root}/node_modules/vitest/vitest.mjs`,
      "run",
      "--config",
      "tests/scripts/vitest.config.dev-safe.ts",
      "tests/scripts/dev-safe.test.ts",
      "--maxWorkers=1",
      "--minWorkers=1",
      "--no-file-parallelism",
    ])
  })

  it("checks the isolated PostgreSQL service before starting the dashboard", () => {
    expect(createDatabaseReadinessPlan(root, tools, { postgres: 45679 })).toEqual([
      tools.docker,
      "--host",
      "unix:///var/run/docker.sock",
      "compose",
      "--project-name",
      devSafeProjectName(root),
      "--project-directory",
      root,
      "--env-file",
      "/dev/null",
      "--file",
      `${root}/docker-compose.dev-safe.yml`,
      "exec",
      "--no-TTY",
      "postgres",
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "allura",
      "-d",
      "allura_dev",
    ])
  })
})

describe("explicit child environment", () => {
  it("reconstructs safe values without ambient secrets or phantom MCP settings", () => {
    process.env.OPENAI_API_KEY = "ambient-secret"
    process.env.ALLURA_MCP_HTTP_PORT = "65530"
    process.env.NODE_OPTIONS = "--require=/tmp/ambient-hook.js"

    const environment = buildEnvironment(root, "dev", tools, {
      dashboard: 45678,
      postgres: 45679,
    })

    expect(environment).toMatchObject({
      HOME: `${root}/.dev-safe-home`,
      NODE_ENV: "development",
      ALLURA_DASHBOARD_PORT: "45678",
      ALLURA_DEV_SAFE_POSTGRES_PORT: "45679",
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: "45679",
      POSTGRES_DB: "allura_dev",
      POSTGRES_USER: "allura",
      POSTGRES_PASSWORD: "allura-dev-local-only",
    })
    for (const key of [
      "OPENAI_API_KEY",
      "ALLURA_MCP_HTTP_PORT",
      "ALLURA_BRAIN_URL",
      "NODE_OPTIONS",
      "DOCKER_HOST",
      "COMPOSE_FILE",
    ]) {
      expect(environment).not.toHaveProperty(key)
    }
  })

  it("omits database credentials from source-only test commands", () => {
    const environment = buildEnvironment(root, "test:unit", tools, {})
    expect(environment.NODE_ENV).toBe("test")
    for (const key of [
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "POSTGRES_APP_USER",
      "POSTGRES_APP_PASSWORD",
      "RUN_E2E_TESTS",
    ]) {
      expect(environment).not.toHaveProperty(key)
    }
  })
})

describe("port configuration", () => {
  it("has no defaults and accepts the proposed AD-45 allocation only", () => {
    expect(readPortConfiguration({})).toEqual({})
    expect(
      readPortConfiguration({
        ALLURA_DEV_SAFE_DASHBOARD_PORT: "4002",
        ALLURA_DEV_SAFE_POSTGRES_PORT: "7002",
      })
    ).toEqual({ dashboard: 4002, postgres: 7002 })
  })

  it.each([
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "3100", /banned 3000-3999 band/],
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "4001", /must match the proposed AD-45 allocation 4002/],
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "4003", /must match the proposed AD-45 allocation 4002/],
    ["ALLURA_DEV_SAFE_POSTGRES_PORT", "5432", /must match the proposed AD-45 allocation 7002/],
    ["ALLURA_DEV_SAFE_POSTGRES_PORT", "5433", /must match the proposed AD-45 allocation 7002/],
    ["ALLURA_DEV_SAFE_POSTGRES_PORT", "5888", /must match the proposed AD-45 allocation 7002/],
    ["ALLURA_DEV_SAFE_POSTGRES_PORT", "7001", /must match the proposed AD-45 allocation 7002/],
    ["ALLURA_DEV_SAFE_POSTGRES_PORT", "7003", /must match the proposed AD-45 allocation 7002/],
  ])("rejects wrong or reserved %s=%s", (name, value, message) => {
    expect(() => readPortConfiguration({ [name]: value })).toThrow(message)
  })

  it("still rejects malformed ports before allocation matching", () => {
    expect(() => readPortConfiguration({ ALLURA_DEV_SAFE_POSTGRES_PORT: "not-a-port" })).toThrow(/valid TCP port/)
  })
})

describe("package aliases", () => {
  it("adds only direct launcher and focused-test entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))
    expect(packageJson.scripts["dev:safe"]).toBe("bun --no-env-file scripts/dev-safe/index.ts")
    expect(packageJson.scripts["test:dev-safe"]).toBe(
      "bun --no-env-file node_modules/vitest/vitest.mjs run --config tests/scripts/vitest.config.dev-safe.ts tests/scripts/dev-safe.test.ts"
    )
    const config = readFileSync(join(process.cwd(), "tests/scripts/vitest.config.dev-safe.ts"), "utf8")
    expect(config).not.toContain("dotenv")
  })

  it("shows that unsafe plain bun run loads synthetic dotenv before its script", () => {
    const fixtureRoot = linkedWorktree()
    writeFileSync(join(fixtureRoot, ".env"), "DEV_SAFE_SYNTHETIC_MARKER=loaded-by-outer-bun\n")
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({ scripts: { "unsafe-probe": "node probe.cjs" } }))
    writeFileSync(join(fixtureRoot, "probe.cjs"), "console.log(process.env.DEV_SAFE_SYNTHETIC_MARKER ?? 'unset')\n")

    const result = spawnSync(bunExecutable, ["run", "unsafe-probe"], {
      cwd: fixtureRoot,
      env: {
        HOME: join(fixtureRoot, "home"),
        NODE_ENV: "test",
        PATH: [dirname(bunExecutable), "/usr/bin", "/bin"].join(delimiter),
      },
      encoding: "utf8",
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("loaded-by-outer-bun")
  })

  it("keeps synthetic dotenv out when the documented outer test command starts Vitest", () => {
    const fixtureRoot = linkedWorktree()
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))
    mkdirSync(join(fixtureRoot, "tests/scripts"), { recursive: true })
    symlinkSync(join(process.cwd(), "node_modules"), join(fixtureRoot, "node_modules"), "dir")
    writeFileSync(join(fixtureRoot, ".env"), "DEV_SAFE_SYNTHETIC_MARKER=loaded-from-synthetic-dotenv\n")
    writeFileSync(
      join(fixtureRoot, "package.json"),
      JSON.stringify({ scripts: { "test:dev-safe": packageJson.scripts["test:dev-safe"] } })
    )
    cpSync(
      join(process.cwd(), "tests/scripts/vitest.config.dev-safe.ts"),
      join(fixtureRoot, "tests/scripts/vitest.config.dev-safe.ts")
    )
    writeFileSync(
      join(fixtureRoot, "tests/scripts/dev-safe.test.ts"),
      [
        'import { expect, it } from "vitest"',
        "",
        'it("does not load the synthetic dotenv marker", () => {',
        "  expect(process.env.DEV_SAFE_SYNTHETIC_MARKER).toBeUndefined()",
        "})",
        "",
      ].join("\n")
    )

    const result = spawnSync(bunExecutable, ["--no-env-file", "run", "test:dev-safe"], {
      cwd: fixtureRoot,
      env: {
        HOME: join(fixtureRoot, "home"),
        NODE_ENV: "test",
        PATH: [dirname(bunExecutable), "/usr/bin", "/bin"].join(delimiter),
      },
      encoding: "utf8",
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})

describe("launcher entrypoint", () => {
  it("doctor inspects the selected Bun runtime and Compose plugin without service access", () => {
    const fixture = launcherFixture()
    const result = spawnSync(bunExecutable, ["--no-env-file", "scripts/dev-safe/index.ts", "doctor"], {
      cwd: fixture.root,
      env: {
        HOME: "/ambient/home",
        NODE_ENV: "test",
        PATH: fixture.path,
        OPENAI_API_KEY: "ambient-secret",
        DOCKER_HOST: "ssh://production.example",
      },
      encoding: "utf8",
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`Bun runtime: ${bunVersion}`)
    expect(result.stdout).toContain("Docker Compose plugin: 2.30.0")
    expect(readFileSync(fixture.dockerLog, "utf8").trim()).toBe(
      "--host unix:///var/run/docker.sock compose version --short"
    )
    expect(readFileSync(fixture.dockerEnvironmentLog, "utf8").trim()).toBe(
      "OPENAI_API_KEY=unset\nDOCKER_HOST=unset\nALLURA_MCP_HTTP_PORT=unset"
    )
  })
})

describe("compose and build-context boundary", () => {
  it("publishes only registered port 7002 on loopback and an internal network", () => {
    const text = readFileSync(join(process.cwd(), "docker-compose.dev-safe.yml"), "utf8")
    const config = parse(text)
    expect(Object.keys(config.services)).toEqual(["postgres"])
    expect(config).not.toHaveProperty("name")
    expect(config.services.postgres).toMatchObject({
      build: { context: ".", dockerfile: "docker/portfolio-postgres/Dockerfile" },
      ports: [
        {
          target: 5432,
          published: "7002",
          host_ip: "127.0.0.1",
          protocol: "tcp",
        },
      ],
      tmpfs: ["/var/lib/postgresql/data:size=512m"],
      mem_limit: "768m",
      cpus: 1,
      pids_limit: 128,
      restart: "no",
    })
    expect(config.services.postgres).not.toHaveProperty("volumes")
    expect(config.services.postgres).not.toHaveProperty("image")
    expect(config).not.toHaveProperty("volumes")
    expect(config.networks).toEqual({ default: { internal: true } })
    expect(text).not.toContain("ALLURA_MCP_HTTP_PORT")
  })

  it("records the inactive proposal in canonical docs and root Compose metadata", () => {
    const blueprint = readFileSync(join(process.cwd(), "docs/allura/BLUEPRINT.md"), "utf8")
    expect(blueprint).toContain(
      "| Isolated development dashboard (Next.js) | 4002 | UI (4000+) — proposed; pending PR acceptance; inactive |"
    )
    expect(blueprint).toContain(
      "| Disposable development PostgreSQL host port | 7002 | aux (7000+) — proposed; pending PR acceptance; inactive |"
    )

    const rootCompose = parse(readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8"))
    expect(rootCompose["x-allura-port-registry"]).toEqual({
      isolated_dev_dashboard: {
        host_port: 4002,
        tier: "ui",
        status: "proposed-pending-pr-acceptance",
        activation: "inactive",
      },
      disposable_dev_postgres: {
        host_port: 7002,
        container_port: 5432,
        tier: "auxiliary",
        status: "proposed-pending-pr-acceptance",
        activation: "inactive",
      },
    })
    expect(Object.keys(rootCompose.services)).toEqual(["postgres", "mcp"])
  })

  it("sends only database initialization inputs to the PostgreSQL build", () => {
    const ignore = readFileSync(join(process.cwd(), "docker/portfolio-postgres/Dockerfile.dockerignore"), "utf8")
    expect(ignore.trim().split("\n")).toEqual([
      "**",
      "!docker/",
      "docker/*",
      "!docker/postgres-init/",
      "!docker/postgres-init/**",
      "!docker/portfolio-postgres/",
      "docker/portfolio-postgres/*",
      "!docker/portfolio-postgres/99-portfolio-demo-workspace.sql",
    ])
  })
})

describe("runtime and activation gates", () => {
  it("accepts only an inspected executable file", () => {
    const temporaryRoot = linkedWorktree()
    const executable = join(temporaryRoot, "tool")
    writeFileSync(executable, "#!/bin/sh\nexit 0\n")
    expect(() => inspectExecutable(executable, "test tool")).toThrow(/not executable/)
    chmodSync(executable, 0o755)
    expect(inspectExecutable(executable, "test tool")).toBe(executable)
  })

  it("keeps service activation gated until the port decision is recorded", () => {
    expect(() => assertActivationAllowed("dev", {})).toThrow(/port decision is pending/)
    expect(() => assertActivationAllowed("db-up", { ALLURA_DEV_SAFE_PORTS_APPROVED: "false" })).toThrow(
      /port decision is pending/
    )
    expect(() => assertActivationAllowed("dev", { ALLURA_DEV_SAFE_PORTS_APPROVED: "true" })).not.toThrow()
    expect(() => assertActivationAllowed("typecheck", {})).not.toThrow()
  })

  it("requires app dependencies for app commands without blocking database cleanup", () => {
    const temporaryRoot = linkedWorktree()
    expect(() => assertLocalPrerequisites(temporaryRoot, "doctor")).toThrow(/Missing dev-safe prerequisite/)

    for (const path of [
      "package.json",
      "docker-compose.dev-safe.yml",
      "docker/portfolio-postgres/Dockerfile",
      "docker/portfolio-postgres/Dockerfile.dockerignore",
      "node_modules/next/dist/bin/next",
      "node_modules/vitest/vitest.mjs",
      "node_modules/typescript/bin/tsc",
    ]) {
      const absolute = join(temporaryRoot, path)
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, "fixture")
    }
    expect(() => assertLocalPrerequisites(temporaryRoot, "doctor")).not.toThrow()

    rmSync(join(temporaryRoot, "node_modules"), { recursive: true })
    expect(() => assertLocalPrerequisites(temporaryRoot, "db-down")).not.toThrow()
    expect(() => assertLocalPrerequisites(temporaryRoot, "dev")).toThrow(/node_modules\/next/)
  })
})

describe("worktree preflight", () => {
  it("accepts examples and rejects dotenv files without reading their contents", () => {
    const temporaryRoot = linkedWorktree()
    writeFileSync(join(temporaryRoot, ".env.development.example"), "PUBLIC_FIXTURE")
    expect(() => assertSafeWorktree(temporaryRoot)).not.toThrow()

    mkdirSync(join(temporaryRoot, "nested"))
    writeFileSync(join(temporaryRoot, "nested/.env.local"), "PRIVATE_SENTINEL")
    expect(() => assertSafeWorktree(temporaryRoot)).toThrow(/Environment file refused/)
    try {
      assertSafeWorktree(temporaryRoot)
    } catch (error) {
      expect(String(error)).not.toContain("PRIVATE_SENTINEL")
    }
  })
})
