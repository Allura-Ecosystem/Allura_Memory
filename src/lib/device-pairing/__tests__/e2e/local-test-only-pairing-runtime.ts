import { NextRequest } from "next/server";
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

import { POST as createExchangeChallenge } from "@/app/api/device-pairing/challenge/route";
import { POST as completeDevice } from "@/app/api/device-pairing/complete/route";
import { POST as enrollDevice } from "@/app/api/device-pairing/enroll/route";
import { POST as exchangeDeviceToken } from "@/app/api/device-pairing/exchange/route";
import { TEST_ONLY_APPROVAL_USER } from "@/app/api/device-pairing/test-approve/route";
import { closePool } from "@/lib/postgres/connection";
import {
  createMigrationDatabase,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

const runtimeEnvKeys = [
  "POSTGRES_DB",
  "POSTGRES_APP_USER",
  "POSTGRES_APP_PASSWORD",
  "POSTGRES_APP_OPTIONS",
  "ALLURA_MCP_TOKEN_SECRET",
  "ALLURA_MCP_BASE_URL",
  "ALLURA_DEVICE_AUTH_ORIGIN",
  "ALLURA_DEVICE_AUTH_AUDIENCE",
  "ALLURA_DEVICE_PAIRING_CALLBACK_ALLOWLIST",
  "ALLURA_DEV_AUTH_ENABLED",
  "ALLURA_MCP_DEV_AUTH",
] as const;

type RuntimeEnvKey = (typeof runtimeEnvKeys)[number];
type EnvSnapshot = Partial<Record<RuntimeEnvKey, string | undefined>>;

export type LocalTestOnlyPairingRuntime = {
  readonly baseUrl: string;
  readonly mcpBaseUrl: string;
  waitForMemorySearchAudit(input: {
    principalId: string;
    pairedDeviceId: string;
  }): Promise<{ principalId: string; pairedDeviceId: string | null } | null>;
  close(): Promise<void>;
};

function snapshotRuntimeEnv(): EnvSnapshot {
  return Object.fromEntries(runtimeEnvKeys.map((key) => [key, process.env[key]])) as EnvSnapshot;
}

function restoreRuntimeEnv(snapshot: EnvSnapshot): void {
  for (const key of runtimeEnvKeys) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function readRequestBody(request: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function nextHeaders(request: import("node:http").IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return headers;
}

async function listenLoopback(server: Server): Promise<number> {
  const minPort = 49152;
  const maxPort = 65535;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const port = minPort + Math.floor(Math.random() * (maxPort - minPort + 1));
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => reject(error);
        server.once("error", fail);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", fail);
          resolve();
        });
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("Unable to reserve an allowed loopback callback port");
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function reserveGatewayPort(): Promise<number> {
  const reservation = createServer();
  const port = await listenLoopback(reservation);
  await closeServer(reservation);
  return port;
}

async function waitForGateway(baseUrl: string, child: ChildProcess, stderr: () => string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Canonical MCP gateway exited before readiness (${child.exitCode}): ${stderr().slice(-500)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The next bounded probe handles a gateway that is still binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Canonical MCP gateway did not become healthy within 4 seconds");
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const terminated = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  if (!terminated && child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

/**
 * Local-only B1 precursor runtime. It is created inside Vitest with NODE_ENV=test,
 * owns a fresh allura_291_* database, and binds only to 127.0.0.1. Product builds
 * never import or start this server.
 */
export async function startLocalTestOnlyPairingRuntime(): Promise<LocalTestOnlyPairingRuntime> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Local test-only pairing runtime requires NODE_ENV=test");
  }
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error("Local test-only pairing runtime requires disposable POSTGRES_PASSWORD");
  }

  const envSnapshot = snapshotRuntimeEnv();
  let db: MigrationDatabase | undefined;
  let server: Server | undefined;
  let gateway: ChildProcess | undefined;
  try {
    db = await createMigrationDatabase("b1_runtime", "69-device-revocation-lifecycle.sql");
    const gatewayTokenSecret = randomBytes(32).toString("base64url");
    process.env.POSTGRES_DB = db.databaseName;
    process.env.POSTGRES_APP_USER = process.env.POSTGRES_USER;
    process.env.POSTGRES_APP_PASSWORD = process.env.POSTGRES_PASSWORD;
    process.env.POSTGRES_APP_OPTIONS = "-c role=allura_app";
    process.env.ALLURA_MCP_TOKEN_SECRET = gatewayTokenSecret;
    process.env.ALLURA_DEVICE_PAIRING_CALLBACK_ALLOWLIST = "loopback";
    process.env.ALLURA_DEV_AUTH_ENABLED = "false";
    process.env.ALLURA_MCP_DEV_AUTH = "false";

    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [TEST_ONLY_APPROVAL_USER.workspaceId, TEST_ONLY_APPROVAL_USER.groupId, "B1 local runtime workspace"],
    );
    await db.owner.query(
      "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, $4)",
      [
        TEST_ONLY_APPROVAL_USER.groupId,
        TEST_ONLY_APPROVAL_USER.id,
        TEST_ONLY_APPROVAL_USER.email,
        TEST_ONLY_APPROVAL_USER.role,
      ],
    );

    let baseUrl = "";
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", baseUrl || "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/api/device-pairing/enroll") {
        try {
          const body = await readRequestBody(request);
          const enrollment = await enrollDevice(new Request(`${baseUrl}/api/device-pairing/enroll`, {
            method: "POST",
            headers: { "content-type": request.headers["content-type"] ?? "application/json" },
            body,
          }));
          response.writeHead(enrollment.status, Object.fromEntries(enrollment.headers));
          response.end(await enrollment.text());
          return;
        } catch {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end("Enrollment test harness failed");
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/device-pairing/complete") {
        try {
          const body = await readRequestBody(request);
          const completion = await completeDevice(new NextRequest(`${baseUrl}/api/device-pairing/complete`, {
            method: "POST",
            headers: nextHeaders(request),
            body,
          }));
          response.writeHead(completion.status, Object.fromEntries(completion.headers));
          response.end(await completion.text());
          return;
        } catch {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end("Completion test harness failed");
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/device-pairing/challenge") {
        try {
          const body = await readRequestBody(request);
          const challenge = await createExchangeChallenge(new NextRequest(`${baseUrl}/api/device-pairing/challenge`, {
            method: "POST",
            headers: nextHeaders(request),
            body,
          }));
          response.writeHead(challenge.status, Object.fromEntries(challenge.headers));
          response.end(await challenge.text());
          return;
        } catch {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end("Challenge test harness failed");
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/device-pairing/exchange") {
        try {
          const body = await readRequestBody(request);
          const exchange = await exchangeDeviceToken(new NextRequest(`${baseUrl}/api/device-pairing/exchange`, {
            method: "POST",
            headers: nextHeaders(request),
            body,
          }));
          response.writeHead(exchange.status, Object.fromEntries(exchange.headers));
          response.end(await exchange.text());
          return;
        } catch {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end("Exchange test harness failed");
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/callback") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end("<!doctype html><title>Allura test callback</title><p>Callback received.</p>");
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });
    const port = await listenLoopback(server);
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = baseUrl;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = `${baseUrl}/device-auth`;
    const mcpBaseUrl = `http://127.0.0.1:${await reserveGatewayPort()}`;
    process.env.ALLURA_MCP_BASE_URL = mcpBaseUrl;
    let gatewayStderr = "";
    gateway = spawn(process.env.ALLURA_TEST_BUN ?? "bun", ["src/mcp/canonical-http-gateway.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ALLURA_MCP_HTTP_PORT: new URL(mcpBaseUrl).port,
        ALLURA_MCP_HTTP_HOST: "127.0.0.1",
        ALLURA_MCP_BASE_URL: mcpBaseUrl,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    gateway.stderr?.on("data", (chunk: Buffer) => { gatewayStderr += chunk.toString("utf8"); });
    await waitForGateway(mcpBaseUrl, gateway, () => gatewayStderr);

    return {
      baseUrl,
      mcpBaseUrl,
      waitForMemorySearchAudit: async ({ principalId, pairedDeviceId }) => {
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline) {
          const result = await db!.owner.query<{ metadata: { principal_id?: string; paired_device_id?: string | null } }>(
            `SELECT metadata FROM events
             WHERE event_type = 'mcp_auth_decision'
               AND metadata->>'tool' = 'memory_search'
               AND metadata->>'principal_id' = $1
               AND metadata->>'paired_device_id' = $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [principalId, pairedDeviceId],
          );
          const metadata = result.rows[0]?.metadata;
          if (metadata?.principal_id) {
            return { principalId: metadata.principal_id, pairedDeviceId: metadata.paired_device_id ?? null };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
      },
      close: async () => {
        const activeGateway = gateway;
        gateway = undefined;
        if (activeGateway) await stopChild(activeGateway);
        const activeServer = server;
        server = undefined;
        if (activeServer) await closeServer(activeServer);
        await closePool().catch(() => undefined);
        const activeDb = db;
        db = undefined;
        if (activeDb) await activeDb.close();
        restoreRuntimeEnv(envSnapshot);
      },
    };
  } catch (error) {
    if (gateway) await stopChild(gateway).catch(() => undefined);
    if (server) await closeServer(server).catch(() => undefined);
    await closePool().catch(() => undefined);
    if (db) await db.close().catch(() => undefined);
    restoreRuntimeEnv(envSnapshot);
    throw error;
  }
}
