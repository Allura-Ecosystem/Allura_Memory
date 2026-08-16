import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

async function freePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("failed to allocate a test port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForLive(url: string, child: ChildProcess, diagnostics: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`gateway exited with ${child.exitCode}: ${diagnostics()}`);
    try {
      const response = await fetch(`${url}/live`);
      if (response.ok) return;
    } catch {
      // The gateway is still importing; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("gateway did not become live");
}

describe("canonical HTTP gateway auth denial wiring", () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill("SIGTERM");
    child = undefined;
  });

  it("returns the real 401 denial and preserves request correlation in its audit event", async () => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let output = "";
    const running = spawn("bun", ["run", "src/mcp/canonical-http-gateway.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        ALLURA_MCP_HTTP_PORT: String(port),
        ALLURA_MCP_AUTH_TOKEN: "gateway-denial-valid-token",
        ALLURA_RATE_LIMIT_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = running;
    running.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    running.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });

    await waitForLive(baseUrl, running, () => output);
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong-token",
        "x-request-id": "denied-request-24",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 24, method: "initialize", params: {} }),
    });

    expect(response.status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(output).toContain('"decision":"deny"');
    expect(output).toContain('"session_id":"denied-request-24"');
    expect(output).not.toContain("wrong-token");
  });
});
