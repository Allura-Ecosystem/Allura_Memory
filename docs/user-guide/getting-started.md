# Save a project decision

**Start with the Allura tools already connected to your agent.** Ask it to save one decision, keep the returned record ID, then try finding that decision in a fresh session. You do not need to clone this repository or supply another token for this connected-agent path.

If your agent cannot see Allura's memory tools, ask the connection owner to enable the existing integration. Use the project scope the connection already authorizes; do not choose another tenant or invent an identity.

## 1. Ask your connected agent to save a decision

Copy this into the agent's chat:

```text
Use the Allura memory tools already connected here to save this project decision:
“We chose PostgreSQL because our project needs transactional records.”

Use our existing authorized project scope. Return the saved record ID and any
reported source and review state. Keep an unknown review state unknown. If the
save response is uncertain, reconcile it before trying again. Do not promote it.
```

Keep the returned ID somewhere you can bring to the next session. It is a locator for checking the same record, not a credential or proof of approval. A successful save does not mean that a person reviewed the decision.

## 2. Try finding it in a fresh session

Start another session with the same Allura connection and authorized project scope, then copy:

```text
Search our connected Allura memory: what database did this project choose, and
why? Include saved evidence as well as approved knowledge. Show the returned
record ID, source and review state. If you cannot find it, say so. Do not invent
a decision, save a replacement or approve anything to make the check pass.
```

Compare the returned ID and content with the earlier save. Keep the locator out of the first search request so this checks discovery rather than direct lookup. If search misses, you may provide the saved ID for a separate reconciliation read; that read is not a search success.

A returned record must match both the saved ID and its content. An unrelated search hit does not demonstrate that the decision was found. Requesting saved evidence does not guarantee that search returns the new record. A result may also be recorded evidence that has not become approved knowledge; inspect the reported state before relying on it.

## Current result and what it means

The configured connector was checked on **2026-10-20**. Saving the example and fetching its exact ID succeeded. Three searches requesting fresh saved evidence did **not** return that record, including a repeat after the existing connection was independently verified. The latest search completed without a tool error; it was a discovery failure, not a missing-credential diagnosis. Its save-time review state was not reported, and no human approval was requested or verified.

That means this journey is ready to **test**, not verified as a successful later-session search. The [connector evidence](../reference/reddit-remediation/connector-evidence.json) records the exact scope and outcomes; it does not prove two distinct transport sessions or a clean installation. If your search also misses the record, preserve the ID and report that result rather than repeatedly saving it.

Human promotion remains a separate task for an authorized independent reviewer through the provisioned curator workflow. A high score, a storage label or an agent's assertion cannot substitute for that person's decision.

<details>
<summary>Developer reference: SDK and an explicit two-session runner</summary>

This reference is for developers evaluating an already-provisioned authenticated gateway. It is optional for an agent whose Allura tools are already connected. A clean installation is still unverified: the primary Compose file expects existing external storage/networks, and the old first-run script contains retired infrastructure steps.

### Developer prerequisites

- This repository and its pinned Bun runtime (`bun@1.3.14` in `package.json`).
- An operator-provided MCP gateway base URL and authentication token.
- An existing tenant/workspace authorization for that principal, with memory read/write permission.
- A configured embedding/retrieval service on the gateway. Process health alone does not prove retrieval.

The service uses PostgreSQL and the RuVector graph adapter by default. Neo4j is retired. You do not need to create another database to run this client check.

### Prepare the developer client

```bash
git clone https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory
bun install
```

Have your operator supply these client environment values through approved secret tooling:

| Variable | Meaning |
|---|---|
| `ALLURA_BASE_URL` | Existing gateway origin, without `/mcp`, query strings or embedded credentials |
| `ALLURA_AUTH_TOKEN` | Existing credential bound to the intended principal and workspace |
| `ALLURA_GROUP_ID` | The already-authorized `allura-*` tenant selector |

For example, `http://localhost:6477` is the primary Compose host mapping when that stack has actually been provisioned there. Confirm the real endpoint; there is no fallback endpoint or guessed identity in the runner. Do not put tokens in command arguments, screenshots or committed files.

### Run the two-session check

This command appends one example decision to the authorized workspace:

```bash
bun run scripts/first-use-memory.ts --allow-write --output /tmp/allura-first-use-receipt.json
```

The runner:

1. Opens an authenticated MCP session and submits a uniquely identified PostgreSQL decision without inventing `user_id`.
2. Closes that client session and initializes another.
3. Requests `status: "all"` so the search is eligible to include accessible saved evidence. This is a request, not a guarantee that the fresh record will be returned. Default approved-only search excludes unpromoted episodic saves.
4. Requires the exact saved ID **and** content to appear in the later search result.
5. Records source, provenance, save-time pending-review signal, and any retrieval metadata in a receipt without the token or MCP session identifiers.

A passing receipt establishes that bounded round trip on that endpoint and revision. It does not establish clean installation, retrieval quality across a corpus, human approval or usability. Record the repository revision alongside the receipt, and keep the receipt private if its tenant or source IDs are sensitive.

### Read the developer receipt

| Signal | What it establishes |
|---|---|
| Save receipt with ID | The service reported a saved record; inspect uncertainty if the response was lost |
| Exact later-session match | The later session retrieved that same saved content |
| Source/provenance | Reported storage/source attribution, not a correctness guarantee |
| `pending_review_at_save: true` | The save reported a pending review; it is not approved shared knowledge |
| `not_reported` | The service did not provide that review signal; do not infer it |
| `human_review_exercised: false` | This client check did not exercise a person's promotion decision |

Human approval remains a separate step. An authorized independent reviewer must inspect the actual proposal through the provisioned curator workflow. Saving, a high score, or a semantic storage label cannot replace that decision. Do not approve the agent's own work automatically to make this example pass.

### If the developer runner fails

The command exits nonzero and prints a sanitized failure stage/code. Keep that receipt as a failed attempt.

| Failure | Next action |
|---|---|
| Missing configuration | Obtain the existing endpoint, token and authorized group from the operator |
| Authentication/scope rejection | Correct the provisioned authorization through its owner; do not guess identities or broaden scope |
| Endpoint unavailable | Have the operator inspect the existing service; do not start or overwrite a shared database |
| Save timeout or lost response | The record may have committed. Reconcile the uncertain save before another invocation |
| Exact record missing | Inspect indexing, retrieval and scope; an unrelated search hit is not a pass |
| Separate session not established | Inspect MCP session support; health output cannot substitute for this check |

The runner never retries `memory_add`. Each deliberate new invocation can append another record. It never promotes or deletes records.


The [public SDK example](../../examples/quickstart/README.md) offers the same bounded task through `@allura/sdk`. Its source and offline tests do not establish live persistence, search quality or human approval.

</details>

For service boundaries, read [Architecture](../allura/SOLUTION-ARCHITECTURE.md). The [requirements matrix](../allura/REQUIREMENTS-MATRIX.md) and [five-person study protocol](../reference/reddit-remediation/usability-study.md) track the remaining acceptance checks. A fresh self-hosted installation still needs its own reviewed deployment recipe, isolated infrastructure, authorized principal/workspace provisioning, round-trip evidence and recovery checks.

*AI-assisted editorial revision, 2026-10-20. Connected-agent instructions, developer checks, clean installation, human review and usability evidence are separate scopes.*
