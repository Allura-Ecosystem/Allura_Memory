# Installing Allura Memory in Claude Desktop / Cowork

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

## 1. Install the extension

1. Download `allura-memory.mcpb`.
2. Open **Claude Desktop** → **Settings → Extensions**.
3. Drag `allura-memory.mcpb` onto the window (or **Install from file**).
4. Confirm the install prompt.

## 2. Configure (one time)

When prompted, fill in:

| Field | Value |
| --- | --- |
| **Allura Brain URL** | Your hosted Brain endpoint, e.g. `https://brain.allura.dev/mcp` |
| **API Key** | Your Allura Brain API key (stored in the OS keychain) |
| **Tenant (group_id)** | Your namespace, e.g. `allura-yourname` (must match `^allura-[a-z0-9-]+$`) |

## 3. Verify

Start a chat and ask: *"Search my Allura memory for anything about onboarding."*
Claude should call the `memory_search` tool. If it errors with a connection failure,
check that the Brain URL is reachable and the API key is valid.

## Troubleshooting

- **"could not connect to Allura Brain"** — the `base_url` is wrong/unreachable, or the
  Brain isn't running. The proxy logs to stderr; view it in Desktop's extension logs.
- **Auth errors** — the API key is missing or rejected by the Brain.
- **No tools appear** — fully quit and reopen Desktop after install.

## Distributing to the world

`.mcpb` is just a file — host it anywhere (GitHub Releases, your site, a download link).
There is no public marketplace requirement. Users download and drag-drop. The only hard
dependency is a reachable, multi-tenant Allura Brain (see [README.md](README.md)).
