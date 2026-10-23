import { afterEach, describe, expect, it } from "vitest"
import { parse } from "yaml"
import { spawnSync } from "node:child_process"
import { createServer, type Server } from "node:net"
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

import { createPlan, devSafeProjectName } from "../../scripts/dev-safe/commands"
import {
  assertActivationAllowed,
  assertLocalPrerequisites,
  assertSafeWorktree,
  buildEnvironment,
  inspectExecutable,
  inspectLocalDockerEndpoint,
  readPortConfiguration,
} from "../../scripts/dev-safe/environment"

const root = "/worktrees/allura-memory"
const tools = {
  runtime: "/opt/bun/bin/bun",
  docker: "/usr/bin/docker",
  dockerEndpoint: "unix:///var/run/docker.sock",
}
const bunCandidate = (process.env.PATH ?? "")
  .split(delimiter)
  .map((directory) => join(directory, "bun"))
  .find(existsSync)
const bunExecutable = inspectExecutable(bunCandidate, "test Bun runtime")
const bunVersion = spawnSync(bunExecutable, ["--version"], { encoding: "utf8" }).stdout.trim()
const temporaryRoots: string[] = []
const socketServers: Server[] = []

afterEach(() => {
  delete process.env.OPENAI_API_KEY
  delete process.env.ALLURA_MCP_HTTP_PORT
  delete process.env.NODE_OPTIONS
  delete process.env.DOCKER_HOST
  delete process.env.DOCKER_CONTEXT
  delete process.env.DOCKER_TLS_VERIFY
  delete process.env.DOCKER_CERT_PATH
  delete process.env.ALLURA_DEV_SAFE_DOCKER_ENDPOINT
  for (const server of socketServers.splice(0)) server.close()
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

async function unixSocket(path: string): Promise<void> {
  const server = createServer()
  socketServers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(path, resolve)
  })
}

function linkedWorktree(): string {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "allura-dev-safe-"))
  temporaryRoots.push(temporaryRoot)
  writeFileSync(join(temporaryRoot, ".git"), "gitdir: /fixture/repo/worktrees/dev-safe\n")
  return temporaryRoot
}

function launcherFixture(): {
  root: string
  dockerLog: string
  dockerEnvironmentLog: string
  dockerSocket: string
  daemonFailure: string
  path: string
} {
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
    "docker/dev-safe/Dockerfile",
    "docker/dev-safe/Dockerfile.dockerignore",
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
  const dockerSocket = join(temporaryRoot, "docker.sock")
  const daemonFailure = join(temporaryRoot, "daemon-unreachable")
  mkdirSync(toolsDirectory)
  const docker = join(toolsDirectory, "docker")
  writeFileSync(
    docker,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${dockerLog}'\nprintf 'OPENAI_API_KEY=%s\\nDOCKER_HOST=%s\\nDOCKER_CONTEXT=%s\\nDOCKER_TLS_VERIFY=%s\\nDOCKER_CERT_PATH=%s\\nALLURA_MCP_HTTP_PORT=%s\\n' "\${OPENAI_API_KEY-unset}" "\${DOCKER_HOST-unset}" "\${DOCKER_CONTEXT-unset}" "\${DOCKER_TLS_VERIFY-unset}" "\${DOCKER_CERT_PATH-unset}" "\${ALLURA_MCP_HTTP_PORT-unset}" >> '${dockerEnvironmentLog}'\nif [ "$3" = version ] && [ -f '${daemonFailure}' ]; then printf 'daemon unavailable\\n' >&2; exit 42; fi\nprintf '2.30.0\\n'\n`
  )
  chmodSync(docker, 0o755)
  return {
    root: temporaryRoot,
    dockerLog,
    dockerEnvironmentLog,
    dockerSocket,
    daemonFailure,
    path: [toolsDirectory, dirname(bunExecutable), "/usr/bin", "/bin"].join(":"),
  }
}

describe("fixed dev-safe command plans", () => {
  const plan = (name: string) => createPlan(root, [name], tools, { dashboard: 45678 })

  it("starts the app and its private database through the inspected Docker endpoint", () => {
    expect(plan("dev").argv).toEqual([
      tools.docker,
      "--host",
      tools.dockerEndpoint,
      "compose",
      "--project-name",
      devSafeProjectName(root),
      "--project-directory",
      root,
      "--env-file",
      "/dev/null",
      "--file",
      `${root}/docker-compose.dev-safe.yml`,
      "up",
      "--detach",
      "--build",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
    ])
  })

  it("rejects unknown commands, forwarded flags, and missing ports", () => {
    expect(() => plan("brain:down")).toThrow(/Unknown command/)
    expect(() => createPlan(root, ["dev", "--port", "4001"], tools, {})).toThrow(/Exactly one command/)
    expect(() => createPlan(root, ["dev"], tools, {})).toThrow(/ALLURA_DEV_SAFE_DASHBOARD_PORT/)
    expect(() => createPlan(root, ["dev"], tools, { dashboard: 45678 })).not.toThrow()
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

})

describe("local Docker endpoint boundary", () => {
  it("uses the verified default engine socket when no explicit endpoint is selected", async () => {
    const temporaryRoot = linkedWorktree()
    const defaultSocket = join(temporaryRoot, "default.sock")
    const desktopSocket = join(temporaryRoot, "desktop.sock")
    await unixSocket(defaultSocket)

    expect(
      inspectLocalDockerEndpoint(undefined, {
        defaultSocket,
        desktopSocket,
        currentUid: process.getuid!(),
        defaultOwnerUid: process.getuid!(),
      })
    ).toBe(`unix://${defaultSocket}`)
  })

  it("accepts the explicit verified Docker Desktop socket", async () => {
    const temporaryRoot = linkedWorktree()
    const defaultSocket = join(temporaryRoot, "default.sock")
    const desktopSocket = join(temporaryRoot, "desktop.sock")
    await unixSocket(desktopSocket)

    expect(
      inspectLocalDockerEndpoint(`unix://${desktopSocket}`, {
        defaultSocket,
        desktopSocket,
        currentUid: process.getuid!(),
        defaultOwnerUid: 0,
      })
    ).toBe(`unix://${desktopSocket}`)
  })

  it.each(["tcp://127.0.0.1:2375", "ssh://production.example", "unix:///tmp/unapproved-docker.sock"])(
    "rejects remote or unapproved endpoint %s",
    async (endpoint) => {
      const temporaryRoot = linkedWorktree()
      const defaultSocket = join(temporaryRoot, "default.sock")
      const desktopSocket = join(temporaryRoot, "desktop.sock")
      await unixSocket(desktopSocket)

      expect(() =>
        inspectLocalDockerEndpoint(endpoint, {
          defaultSocket,
          desktopSocket,
          currentUid: process.getuid!(),
          defaultOwnerUid: 0,
        })
      ).toThrow(/approved local Unix socket/)
    }
  )

  it("rejects a regular file and an endpoint with the wrong owner", async () => {
    const temporaryRoot = linkedWorktree()
    const defaultSocket = join(temporaryRoot, "default.sock")
    const desktopSocket = join(temporaryRoot, "desktop.sock")
    writeFileSync(desktopSocket, "not a socket")
    const policy = {
      defaultSocket,
      desktopSocket,
      currentUid: process.getuid!(),
      defaultOwnerUid: 0,
    }

    expect(() => inspectLocalDockerEndpoint(`unix://${desktopSocket}`, policy)).toThrow(/not a Unix socket/)
    rmSync(desktopSocket)
    await unixSocket(desktopSocket)
    expect(() =>
      inspectLocalDockerEndpoint(`unix://${desktopSocket}`, {
        ...policy,
        currentUid: process.getuid!() + 1,
      })
    ).toThrow(/not owned by the current user/)
  })

  it("rejects a Desktop socket reached through a user-owned parent symlink", async () => {
    const temporaryRoot = linkedWorktree()
    const realParent = join(temporaryRoot, "real-desktop")
    const linkedParent = join(temporaryRoot, "linked-desktop")
    mkdirSync(realParent)
    symlinkSync(realParent, linkedParent, "dir")
    const desktopSocket = join(linkedParent, "docker.sock")
    await unixSocket(join(realParent, "docker.sock"))

    expect(() =>
      inspectLocalDockerEndpoint(`unix://${desktopSocket}`, {
        defaultSocket: join(temporaryRoot, "default.sock"),
        desktopSocket,
        currentUid: process.getuid!(),
        defaultOwnerUid: 0,
      })
    ).toThrow(/untrusted parent symlink/)
  })

  it("does not reject the root-owned /var/run compatibility symlink", () => {
    expect(() =>
      inspectLocalDockerEndpoint("unix:///var/run/dev-safe-missing.sock", {
        defaultSocket: "/var/run/dev-safe-missing.sock",
        desktopSocket: "/home/dev-safe-missing/.docker/desktop/docker.sock",
        currentUid: process.getuid!(),
        defaultOwnerUid: 0,
      })
    ).toThrow(/Docker endpoint is unavailable/)
  })
})

describe("explicit child environment", () => {
  it("reconstructs safe values without ambient secrets or phantom MCP settings", () => {
    process.env.OPENAI_API_KEY = "ambient-secret"
    process.env.ALLURA_MCP_HTTP_PORT = "65530"
    process.env.NODE_OPTIONS = "--require=/tmp/ambient-hook.js"
    process.env.DOCKER_HOST = "ssh://production.example"
    process.env.DOCKER_CONTEXT = "production"
    process.env.DOCKER_TLS_VERIFY = "1"
    process.env.DOCKER_CERT_PATH = "/tmp/production-certs"
    process.env.ALLURA_DEV_SAFE_DOCKER_ENDPOINT = "ssh://production.example"

    const environment = buildEnvironment(root, "dev", tools, {
      dashboard: 45678,
    })

    expect(environment).toMatchObject({
      HOME: `${root}/.dev-safe-home`,
      NODE_ENV: "development",
      ALLURA_DASHBOARD_PORT: "45678",
      ALLURA_DEV_SAFE_DASHBOARD_PORT: "45678",
    })
    for (const key of [
      "OPENAI_API_KEY",
      "ALLURA_MCP_HTTP_PORT",
      "ALLURA_BRAIN_URL",
      "NODE_OPTIONS",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_TLS_VERIFY",
      "DOCKER_CERT_PATH",
      "ALLURA_DEV_SAFE_DOCKER_ENDPOINT",
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
  it("has no defaults and accepts the registered AD-45 allocation only", () => {
    expect(readPortConfiguration({})).toEqual({})
    expect(
      readPortConfiguration({
        ALLURA_DEV_SAFE_DASHBOARD_PORT: "4002",
      })
    ).toEqual({ dashboard: 4002 })
  })

  it.each([
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "3100", /banned 3000-3999 band/],
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "4001", /must match the registered AD-45 allocation 4002/],
    ["ALLURA_DEV_SAFE_DASHBOARD_PORT", "4003", /must match the registered AD-45 allocation 4002/],
  ])("rejects wrong or reserved %s=%s", (name, value, message) => {
    expect(() => readPortConfiguration({ [name]: value })).toThrow(message)
  })

  it("still rejects malformed ports before allocation matching", () => {
    expect(() => readPortConfiguration({ ALLURA_DEV_SAFE_DASHBOARD_PORT: "not-a-port" })).toThrow(/valid TCP port/)
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

  it("shows that a plain Bun package script loads synthetic dotenv", () => {
    const fixtureRoot = linkedWorktree()
    writeFileSync(join(fixtureRoot, ".env"), "DEV_SAFE_SYNTHETIC_MARKER=loaded-by-plain-bun\n")
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({ scripts: { "unsafe-probe": "bun probe.cjs" } }))
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
    expect(result.stdout).toContain("loaded-by-plain-bun")
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
  it("rejects an owned socket under spoofed HOME through the production default policy", async () => {
    const fixture = launcherFixture()
    const spoofedHome = join(fixture.root, "spoofed-home")
    const spoofedDesktop = join(spoofedHome, ".docker", "desktop")
    mkdirSync(spoofedDesktop, { recursive: true })
    const spoofedSocket = join(spoofedDesktop, "docker.sock")
    const pathLookupMarker = join(fixture.root, "path-getent-ran")
    const pathLookup = join(fixture.root, "tools", "getent")
    writeFileSync(
      pathLookup,
      `#!/bin/sh\ntouch '${pathLookupMarker}'\nprintf 'spoof:x:${process.getuid!()}:0::${spoofedHome}:/bin/sh\\n'\n`
    )
    chmodSync(pathLookup, 0o755)
    await unixSocket(spoofedSocket)

    const result = spawnSync(bunExecutable, ["--no-env-file", "scripts/dev-safe/index.ts", "doctor"], {
      cwd: fixture.root,
      env: {
        HOME: spoofedHome,
        NODE_ENV: "test",
        PATH: fixture.path,
        ALLURA_DEV_SAFE_DOCKER_ENDPOINT: `unix://${spoofedSocket}`,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Docker endpoint must be an approved local Unix socket")
    expect(existsSync(pathLookupMarker)).toBe(false)
    expect(existsSync(fixture.dockerLog)).toBe(false)
  })

  it("doctor verifies the selected daemon and Compose plugin without service access", async () => {
    const fixture = launcherFixture()
    await unixSocket(fixture.dockerSocket)
    writeFileSync(
      join(fixture.root, "doctor.ts"),
      [
        'import { main } from "./scripts/dev-safe/index.ts"',
        `process.exitCode = await main({ dockerEndpointPolicy: { defaultSocket: ${JSON.stringify(fixture.dockerSocket)}, desktopSocket: ${JSON.stringify(join(fixture.root, "desktop.sock"))}, currentUid: ${process.getuid!()}, defaultOwnerUid: ${process.getuid!()} } })`,
      ].join("\n")
    )
    const result = spawnSync(bunExecutable, ["--no-env-file", "doctor.ts", "doctor"], {
      cwd: fixture.root,
      env: {
        HOME: "/ambient/home",
        NODE_ENV: "test",
        PATH: fixture.path,
        OPENAI_API_KEY: "ambient-secret",
        DOCKER_HOST: "ssh://production.example",
        DOCKER_CONTEXT: "production",
        DOCKER_TLS_VERIFY: "1",
        DOCKER_CERT_PATH: "/tmp/production-certs",
      },
      encoding: "utf8",
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`Bun runtime: ${bunVersion}`)
    expect(result.stdout).toContain(`Docker daemon: 2.30.0 (unix://${fixture.dockerSocket})`)
    expect(result.stdout).toContain("Docker Compose plugin: 2.30.0")
    expect(readFileSync(fixture.dockerLog, "utf8").trim()).toBe(
      [
        `--host unix://${fixture.dockerSocket} version --format {{.Server.Version}}`,
        `--host unix://${fixture.dockerSocket} compose version --short`,
      ].join("\n")
    )
    expect(readFileSync(fixture.dockerEnvironmentLog, "utf8").trim()).toBe(
      [
        "OPENAI_API_KEY=unset\nDOCKER_HOST=unset\nDOCKER_CONTEXT=unset\nDOCKER_TLS_VERIFY=unset\nDOCKER_CERT_PATH=unset\nALLURA_MCP_HTTP_PORT=unset",
        "OPENAI_API_KEY=unset\nDOCKER_HOST=unset\nDOCKER_CONTEXT=unset\nDOCKER_TLS_VERIFY=unset\nDOCKER_CERT_PATH=unset\nALLURA_MCP_HTTP_PORT=unset",
      ].join("\n")
    )
  })

  it("doctor fails before claiming readiness when the selected daemon is unreachable", async () => {
    const fixture = launcherFixture()
    await unixSocket(fixture.dockerSocket)
    writeFileSync(fixture.daemonFailure, "fail")
    writeFileSync(
      join(fixture.root, "doctor.ts"),
      [
        'import { main } from "./scripts/dev-safe/index.ts"',
        `process.exitCode = await main({ dockerEndpointPolicy: { defaultSocket: ${JSON.stringify(fixture.dockerSocket)}, desktopSocket: ${JSON.stringify(join(fixture.root, "desktop.sock"))}, currentUid: ${process.getuid!()}, defaultOwnerUid: ${process.getuid!()} } })`,
      ].join("\n")
    )

    const result = spawnSync(bunExecutable, ["--no-env-file", "doctor.ts", "doctor"], {
      cwd: fixture.root,
      env: { HOME: "/ambient/home", NODE_ENV: "test", PATH: fixture.path },
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("failed (42): daemon unavailable")
    expect(result.stdout).not.toContain("Daemon reachability verified")
    expect(readFileSync(fixture.dockerLog, "utf8").trim()).toBe(
      `--host unix://${fixture.dockerSocket} version --format {{.Server.Version}}`
    )
  })
})

describe("compose and build-context boundary", () => {
  it("publishes only the app on loopback and keeps PostgreSQL on a private internal network", () => {
    const text = readFileSync(join(process.cwd(), "docker-compose.dev-safe.yml"), "utf8")
    const config = parse(text)
    expect(Object.keys(config.services)).toEqual(["postgres", "app"])
    expect(config).not.toHaveProperty("name")
    expect(config.services.postgres).toMatchObject({
      build: { context: ".", dockerfile: "docker/portfolio-postgres/Dockerfile" },
      networks: ["backend"],
      tmpfs: ["/var/lib/postgresql/data:size=512m"],
      mem_limit: "768m",
      cpus: 1,
      pids_limit: 128,
      restart: "no",
    })
    expect(config.services.postgres).not.toHaveProperty("volumes")
    expect(config.services.postgres).not.toHaveProperty("image")
    expect(config.services.postgres).not.toHaveProperty("ports")
    expect(config.services.app).toMatchObject({
      build: { context: ".", dockerfile: "docker/dev-safe/Dockerfile" },
      ports: [{ target: 4002, published: "${ALLURA_DEV_SAFE_DASHBOARD_PORT:?set ALLURA_DEV_SAFE_DASHBOARD_PORT}", host_ip: "127.0.0.1", protocol: "tcp" }],
      networks: ["frontend", "backend"],
      depends_on: { postgres: { condition: "service_healthy" } },
      environment: {
        NODE_ENV: "development",
        POSTGRES_HOST: "postgres",
        POSTGRES_PORT: "5432",
        POSTGRES_DB: "allura_dev",
        POSTGRES_USER: "allura",
        POSTGRES_PASSWORD: "allura-dev-local-only",
        POSTGRES_APP_USER: "allura_app",
        POSTGRES_APP_PASSWORD: "change-me-in-production",
      },
    })
    expect(config).not.toHaveProperty("volumes")
    expect(config.networks).toEqual({ frontend: {}, backend: { internal: true } })
    expect(text).not.toContain("ALLURA_MCP_HTTP_PORT")
  })

  it("records the accepted dashboard port and no unpublished database port", () => {
    const blueprint = readFileSync(join(process.cwd(), "docs/allura/BLUEPRINT.md"), "utf8")
    expect(blueprint).toContain(
      "| Isolated development dashboard (Next.js) | 4002 | UI (4000+) — local loopback only |"
    )
    expect(blueprint).not.toContain("Disposable development PostgreSQL host port")

    const rootCompose = parse(readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8"))
    expect(rootCompose["x-allura-port-registry"]).toEqual({
      isolated_dev_dashboard: {
        host_port: 4002,
        tier: "ui",
        status: "registered",
        activation: "explicit-launcher-gate",
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

  it("pins the app runtime and installs the frozen lockfile without browser downloads", () => {
    const dockerfile = readFileSync(join(process.cwd(), "docker/dev-safe/Dockerfile"), "utf8")
    expect(dockerfile).toContain(
      "FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4"
    )
    expect(dockerfile).toContain("ENV PUPPETEER_SKIP_DOWNLOAD=true")
    expect(dockerfile).toContain("RUN bun install --frozen-lockfile")
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

  it("keeps service activation behind an explicit operator signal", () => {
    expect(() => assertActivationAllowed("dev", {})).toThrow(/ALLURA_DEV_SAFE_ACTIVATE=true/)
    expect(() => assertActivationAllowed("db-up", { ALLURA_DEV_SAFE_ACTIVATE: "false" })).toThrow(
      /ALLURA_DEV_SAFE_ACTIVATE=true/
    )
    expect(() => assertActivationAllowed("dev", { ALLURA_DEV_SAFE_ACTIVATE: "true" })).not.toThrow()
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
      "docker/dev-safe/Dockerfile",
      "docker/dev-safe/Dockerfile.dockerignore",
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
    expect(() => assertLocalPrerequisites(temporaryRoot, "dev")).not.toThrow()
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
