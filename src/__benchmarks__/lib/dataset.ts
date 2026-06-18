/**
 * Labeled fixtures for the benchmark harness.
 *
 * Documents carry a `key` that is embedded verbatim into the seeded content as a
 * marker token `[[BENCH:<runId>:<key>]]`. Relevance is judged by whether a
 * returned result's content contains the expected marker — this makes scoring
 * independent of the gateway's id scheme and robust across the episodic/semantic
 * stores.
 */

/** A document to seed into the memory store. */
export interface CorpusDoc {
  /** Stable key, also used to build the relevance marker. */
  key: string
  /** Topic cluster the doc belongs to. */
  topic: string
  /** Human-readable content (the marker is appended at seed time). */
  text: string
}

/** A retrieval query with ground-truth relevant document keys. */
export interface RetrievalQuery {
  query: string
  /** Keys of documents that should be retrieved for this query. */
  relevantKeys: string[]
}

/** A curation example with the expected promotion verdict. */
export interface CurationExample {
  text: string
  /**
   * Expected verdict: `true` for memories a curator SHOULD promote
   * (durable, decision-grade), `false` for noise that should stay episodic.
   */
  shouldPromote: boolean
  /** Short label for reporting. */
  label: string
}

/** Build the marker token embedded into a seeded doc. */
export function markerFor(runId: string, key: string): string {
  return `[[BENCH:${runId}:${key}]]`
}

/** Retrieval corpus: three topic clusters with clearly separable vocabulary. */
export const RETRIEVAL_CORPUS: CorpusDoc[] = [
  // Topic: dual-database architecture
  {
    key: "arch-dual-db",
    topic: "architecture",
    text: "Allura uses a dual-database architecture: PostgreSQL stores append-only episodic execution traces and Neo4j stores the versioned semantic knowledge graph.",
  },
  {
    key: "arch-supersedes",
    topic: "architecture",
    text: "Neo4j knowledge is versioned with SUPERSEDES relationships; nodes are never edited in place, a new version supersedes the deprecated one.",
  },
  {
    key: "arch-mcp-surface",
    topic: "architecture",
    text: "Allura Brain exposes memory operations over MCP using Streamable HTTP with Server-Sent Events and JSON-RPC envelopes.",
  },
  {
    key: "arch-append-only",
    topic: "architecture",
    text: "PostgreSQL trace rows are strictly append-only; the system never issues UPDATE or DELETE against historical events.",
  },
  // Topic: hybrid retrieval
  {
    key: "search-rrf",
    topic: "retrieval",
    text: "Hybrid search fuses vector ANN and BM25 text ranking using reciprocal rank fusion with a constant of sixty.",
  },
  {
    key: "search-embeddings",
    topic: "retrieval",
    text: "Memory embeddings are 768-dimensional vectors produced by the nomic-embed-text model and stored in RuVector.",
  },
  {
    key: "search-cosine",
    topic: "retrieval",
    text: "Vector similarity in RuVector is computed with cosine distance over the approximate nearest neighbour index.",
  },
  // Topic: governance and curation
  {
    key: "gov-hitl",
    topic: "governance",
    text: "Promotion to the semantic graph requires human-in-the-loop approval; agents cannot autonomously promote memories to Neo4j.",
  },
  {
    key: "gov-tenant",
    topic: "governance",
    text: "Every database read and write must carry a group_id matching the allura tenant namespace pattern for isolation.",
  },
  {
    key: "gov-curator",
    topic: "governance",
    text: "The curator pipeline scores candidate traces and queues high-confidence proposals for human approval before any graph write.",
  },
]

/** Retrieval queries with ground-truth labels keyed to the corpus. */
export const RETRIEVAL_QUERIES: RetrievalQuery[] = [
  {
    query: "how does Allura version the knowledge graph",
    relevantKeys: ["arch-supersedes", "arch-dual-db"],
  },
  {
    query: "what model produces memory embeddings and how big are they",
    relevantKeys: ["search-embeddings", "search-cosine"],
  },
  {
    query: "reciprocal rank fusion of vector and text search",
    relevantKeys: ["search-rrf", "search-cosine"],
  },
  {
    query: "who approves promotion to the semantic store",
    relevantKeys: ["gov-hitl", "gov-curator"],
  },
  {
    query: "tenant isolation with group id namespace",
    relevantKeys: ["gov-tenant"],
  },
  {
    query: "append only postgres execution traces",
    relevantKeys: ["arch-append-only", "arch-dual-db"],
  },
]

/**
 * Curation examples. The "promote" set is durable, decision-grade knowledge;
 * the "noise" set is conversational chatter or low-information fragments that a
 * curator should leave episodic.
 */
export const CURATION_EXAMPLES: CurationExample[] = [
  {
    label: "architectural-decision",
    shouldPromote: true,
    text: "Decision: Allura adopts a dual-database design — PostgreSQL for episodic traces, Neo4j for the semantic graph, versioned via SUPERSEDES. Rationale: append-only auditability plus queryable relationships.",
  },
  {
    label: "operational-invariant",
    shouldPromote: true,
    text: "Invariant: every memory read and write must include a group_id matching ^allura-[a-z0-9-]+$, otherwise the CHECK constraint rejects the row. This enforces hard tenant isolation.",
  },
  {
    label: "design-rationale",
    shouldPromote: true,
    text: "Hybrid retrieval fuses vector ANN with BM25 using reciprocal rank fusion (k=60) because pure vector search missed exact-term queries while pure BM25 missed paraphrases.",
  },
  {
    label: "incident-postmortem",
    shouldPromote: true,
    text: "Postmortem: the curator queue stalled at 100+ items because the embedding backfill worker crashed; mitigation is a watchdog that restarts the worker and alerts when depth exceeds the threshold.",
  },
  {
    label: "chatter-ack",
    shouldPromote: false,
    text: "ok sounds good thanks",
  },
  {
    label: "chatter-filler",
    shouldPromote: false,
    text: "lol yeah",
  },
  {
    label: "noise-fragment",
    shouldPromote: false,
    text: "asdf test 123",
  },
  {
    label: "noise-greeting",
    shouldPromote: false,
    text: "hi there, are you online?",
  },
]
