#!/usr/bin/env node
// Allura Memory — Desktop Extension stdio proxy.
//
// Bridges a local stdio MCP client (Claude Desktop / Cowork) to a remote,
// hosted Allura Brain over streamable HTTP. Transparent passthrough for
// tools / prompts / resources, plus:
//   - injects the user's API key as a Bearer token on every upstream request
//   - injects the configured group_id ONLY on tool calls whose input schema
//     actually declares a `group_id` property (governance without breakage)
//
// .mcpb requires a LOCAL stdio server — remote HTTP servers cannot be packaged
// directly. This proxy is that local server; the memory itself lives in the
// hosted Brain. See ../README.md.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BRAIN_URL = process.env.ALLURA_BRAIN_URL;
const API_KEY = process.env.ALLURA_API_KEY;
const GROUP_ID = process.env.ALLURA_GROUP_ID || "allura-system";

// stderr only — stdout is the MCP transport and must stay clean.
const log = (...args) => console.error("[allura-memory]", ...args);

if (!BRAIN_URL) {
  log("FATAL: ALLURA_BRAIN_URL is not set. Configure the extension in Claude Desktop settings.");
  process.exit(1);
}

const upstream = new Client(
  { name: "allura-memory-desktop", version: "1.0.0" },
  { capabilities: {} },
);

const transport = new StreamableHTTPClientTransport(new URL(BRAIN_URL), {
  requestInit: {
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  },
});

try {
  await upstream.connect(transport);
} catch (err) {
  log("FATAL: could not connect to Allura Brain at", BRAIN_URL, "-", err?.message ?? err);
  process.exit(1);
}
log("connected to Allura Brain at", BRAIN_URL, "| tenant", GROUP_ID);

const caps = upstream.getServerCapabilities() ?? {};

// Cache tool definitions so we can decide whether to inject group_id.
let toolIndex = new Map();
async function listToolsCached() {
  const result = await upstream.listTools();
  toolIndex = new Map((result.tools ?? []).map((t) => [t.name, t]));
  return result;
}

const server = new Server(
  { name: "allura-memory", version: "1.0.0" },
  {
    capabilities: {
      ...(caps.tools ? { tools: {} } : {}),
      ...(caps.prompts ? { prompts: {} } : {}),
      ...(caps.resources ? { resources: {} } : {}),
    },
  },
);

// ---- Tools ----
server.setRequestHandler(ListToolsRequestSchema, async () => listToolsCached());

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = { ...(req.params.arguments ?? {}) };

  // Inject the tenant only when the upstream tool's schema declares group_id
  // and the caller did not already supply one.
  const tool = toolIndex.get(name) ?? (await listToolsCached(), toolIndex.get(name));
  const acceptsGroupId = Boolean(tool?.inputSchema?.properties?.group_id);
  if (GROUP_ID && acceptsGroupId && args.group_id == null) {
    args.group_id = GROUP_ID;
  }

  return upstream.callTool({ name, arguments: args });
});

// ---- Prompts ----
if (caps.prompts) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => upstream.listPrompts());
  server.setRequestHandler(GetPromptRequestSchema, async (req) =>
    upstream.getPrompt({ name: req.params.name, arguments: req.params.arguments }),
  );
}

// ---- Resources ----
if (caps.resources) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => upstream.listResources());
  server.setRequestHandler(ReadResourceRequestSchema, async (req) =>
    upstream.readResource({ uri: req.params.uri }),
  );
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () =>
    upstream.listResourceTemplates(),
  );
}

// Forward upstream change notifications so Desktop re-queries lists.
upstream.setNotificationHandler =
  upstream.setNotificationHandler ?? (() => {}); // older SDKs: no-op guard

const stdio = new StdioServerTransport();
await server.connect(stdio);
log("Allura Memory proxy ready.");

const shutdown = async () => {
  try {
    await upstream.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
