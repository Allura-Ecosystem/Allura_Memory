# Focused Subgraph Contract

Story 31.1 freezes the server-owned contract for the `/dashboard/graph` Knowledge Map. The executable source is `src/lib/subgraph/contract.ts`; this document records the protocol and the boundary that later stories must preserve.

## Boundary

The browser sends traversal intent only. `SubgraphQuery` contains no tenant, workspace, principal, session, role, policy, or other authority field. Optional legacy scope selectors remain transport-level equality assertions and are not part of this contract. The server derives authority and validates it before a repository read.

This story does not extend `IGraphAdapter`, read a repository, add route SQL, change the database schema, implement UI behavior, restore Neo4j, fabricate graph data, or promote events into semantic nodes. Story 31.2 will implement the relational repository and route against this contract; Story 31.3 will consume it in visual and same-data text views.

Contract version `2.0` has two strict request variants:

- `overview` accepts optional node/relationship filters, node and edge budgets, and an opaque continuation.
- `focus` additionally requires a qualified `memory:<opaque-id>` or `structural:<opaque-id>` key and accepts direction, depth, and lineage intent.

Unknown object fields are rejected at every external boundary. Raw node IDs are invalid. Kind filters are validated, deduplicated, and sorted. Defaults are made explicit, and effective budgets are capped at 200 nodes, 400 edges, and depth 2. Focus defaults to both directions, depth 1, and no lineage; overview has depth 0. Depth outside `0 | 1 | 2` is malformed rather than silently expanding authority.

`normalizeSubgraphQuery` produces a deterministic, versioned value. `serializeNormalizedSubgraphQuery` canonicalizes filter arrays and excludes the opaque continuation so different page tokens cannot change the semantic query digest. A continuation remains one opaque token in browser input; its internal claims are never accepted as decomposed request fields.

## Identity, taxonomy, and evidence

Node keys are collision-safe and qualified as `memory:<opaque-id>` or `structural:<opaque-id>`. Stable edge keys are qualified as `edge:<opaque-id>`. Every emitted edge must reference two nodes in the same response page, and node and edge keys are unique.

Product node kinds are `Memory`, `Agent`, `Team`, and `Project`. Reserved product names cannot be relabeled as structural or unknown. Other allowlisted structural names remain explicit. Validated unknown node and relationship kinds use an explicit `unknown` classification; canonical names cannot be relabeled as unknown, and nothing is coerced to `CONNECTED_TO`. Canonical relationships are:

- `AUTHORED_BY`
- `RELATES_TO`
- `MEMBER_OF`
- `CONTRIBUTES_TO`
- `SUPERSEDES` (newer to superseded)

Each node and edge includes a direct source-record reference or a versioned derivation rule, freshness, evidence, and traversal ordering metadata. Node version/deprecation state is not reused for edges. Evidence is exactly `available`, `absent`, or `unavailable`. Full authorized content, tenant/workspace scope, detailed provenance, lineage, and relationship context belong only in the optional focused inspection object.

Response nodes are ordered by distance, stable kind rank, freshness descending, and qualified key. Edges are ordered by depth, relationship kind, direction, qualified source, qualified target, and stable edge key. Warning codes, evidence references, derivation source keys, inspection relationship keys, and lineage entries are unique and canonically ordered; order-varying equivalents are rejected.

Focused lineage names the admitted newer and superseded nodes plus the admitted `SUPERSEDES` edge. Both nodes must be in the page, self-supersession is invalid, and the edge must point from a higher version to a deprecated lower version. No lineage key can disclose an unadmitted node.

## Result states

`SubgraphResponse` is a strict discriminated union:

| State | Meaning | Graph arrays | Continuation |
|---|---|---:|---:|
| `complete` | Authorized traversal exhausted within budgets | Yes | No |
| `empty` | Healthy complete authorized query returned no graph records | Empty only | No |
| `partial` | Valid graph page exhausted a named budget | Yes | Required |
| `degraded` | Semantic graph equivalence is unavailable | No | No |
| `denied` | Authentication/authorization refused without disclosure | No | No |
| `error` | Sanitized malformed, conflict, or unavailable outcome | No | No |

Successful graph pages carry the contract version, policy epoch, graph revision, captured timestamp, requested and applied budgets, nodes, edges, warning codes, and optional focused inspection. Applied budgets cannot exceed requested budgets or the global caps. A `partial` page must reach every applied budget dimension named by `exhausted`; a false exhaustion claim is invalid.

`SubgraphExchangeSchema` is the executable query/response seam. It requires response budgets to equal the normalized query's requested/effective budgets, forbids inspection on overview, requires a focused inspection key to equal `focusNodeKey`, and rejects lineage when it was not requested.

A degraded response may carry separately typed `event-context`, but it must say `non-equivalent` and never puts fallback records in semantic node or edge arrays. Denied and error objects have fixed, sanitized code/action/retryability combinations and are structurally unable to carry protected scope, IDs, labels, snippets, counts, nodes, or edges.

## HTTP mapping

The thin Story 31.2 route maps the contract as follows:

- `200`: `complete`, `empty`, `partial`, or labeled `degraded`
- `400`: malformed query or continuation token
- `401`: login required
- `403`: insufficient role, explicit scope conflict, or continuation authority mismatch
- `409`: snapshot or continuation conflict; action is `restart`
- `503`: sanitized unavailable/error

Loading is client-only and is not a server result state. A stale continuation or changed graph snapshot never becomes `empty`.

## Continuation claims

Tokens require authenticated encryption with a graph-specific key derivation and domain/AAD distinct from the Epic 30 read cursor. The internal `SubgraphContinuationClaims` schema requires every binding below:

- contract version;
- tenant, workspace, principal, session hash, and role;
- policy epoch and route-policy version;
- normalized-query hash;
- effective node, edge, and depth budgets;
- graph revision;
- deterministic node/edge ordering boundary;
- issuance and expiry timestamps; and
- key version.

The ordering boundary represents the canonical node order (distance, kind rank, freshness descending, qualified key) and edge order (depth, relationship kind, direction, qualified source, qualified target, stable edge key). At least one boundary is present, and boundary distance/depth cannot exceed the token's effective depth. Expiry must follow issuance; this contract deliberately does not invent a maximum TTL. Tampering, expiry, query/policy/membership/revision change, or scope replay fails before disclosure.

## Rollout and rollback

`src/lib/subgraph/rollout.ts` imports `server-only` and reads `ALLURA_GRAPH_V2_ENABLED` at call time. Only the exact case-sensitive value `true` enables Graph V2. Missing, `false`, whitespace-padded, case-changed, or otherwise malformed values fail closed.

Missing, disabled, and malformed deployment values map to the same public `degraded` `GRAPH_V2_UNAVAILABLE` response. Client metadata does not reveal which deployment condition occurred, and it is never a successful empty graph. Legacy fallback remains forbidden. Rollback order is:

1. Set the server flag to disabled.
2. Revert later UI and service wiring.
3. Wait beyond the continuation TTL.
4. Remove additive revision machinery only through a reviewed recovery migration.

Rollback never restores Neo4j, browser-selected scope, mock nodes, semantic event fallback, or the deleted legacy route wholesale. The flag value itself is never returned to the client.

## Architecture trace

- AD-64 owns the focused-subgraph repository and contract decision.
- REQ-MAP-001 traces the server-owned contract and distinct truth states.
- REQ-MAP-002 traces relational authorization, deterministic ordering, continuations, and 200/400/2 budgets.
- REQ-MAP-003 traces identical authorized arrays for the visual map and adjacent accessible text view.
- AD-59 remains endpoint-isolation authority and is unchanged.

AD-64 and REQ-MAP-001..003 were already coherent with the executable contract, so Story 31.1 makes no edits to their accepted rows.
