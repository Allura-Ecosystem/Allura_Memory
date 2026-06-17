/**
 * Platform Hive — built-in seed dataset.
 *
 * This represents the Allura Platform architecture as a knowledge graph.
 * It is always available even when Neo4j is sparse or offline.
 * The Policy node directly addresses the user feedback about not being
 * able to set or inspect policies.
 */

import type { GraphEdge, GraphNode } from "./types"

export const PLATFORM_NODES: GraphNode[] = [
  {
    id: "allura-platform",
    label: "Allura Hosted Platform",
    type: "platform",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.95,
    owner: "brooks",
    summary: "The top-level product that wraps all Allura services — the thing you log into.",
    connected: 8,
  },
  {
    id: "memory-command-center",
    label: "Memory Command Center",
    type: "platform",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.88,
    owner: "woz",
    summary: "The dashboard you are looking at right now — search, review, and approve memories.",
    connected: 4,
  },
  {
    id: "allura-memory-engine",
    label: "Allura Memory Engine",
    type: "memory",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.92,
    owner: "woz",
    summary: "Stores what your agents learn. Keeps a fast log (Postgres) and a smart graph (Neo4j) in sync.",
    docLinks: ["docs/allura/BLUEPRINT.md"],
    connected: 5,
  },
  {
    id: "allura-guard",
    label: "Allura Guard",
    type: "security",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.93,
    owner: "security-team",
    summary: "Checks every request for a valid workspace ID. Nothing gets in without it.",
    connected: 3,
  },
  {
    id: "mcp-gateway",
    label: "MCP Gateway",
    type: "agent",
    status: "built",
    riskLevel: "medium",
    qualityScore: 0.87,
    owner: "woz",
    summary: "The door that AI tools (Claude, Codex, Cursor) use to read and write memories.",
    connected: 6,
  },
  {
    id: "postgres-episodic",
    label: "PostgreSQL Episodic",
    type: "ops",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.96,
    owner: "infra",
    summary: "The fast event log. Every agent action is written here first — nothing ever gets deleted.",
    connected: 2,
  },
  {
    id: "neo4j-semantic",
    label: "Neo4j Semantic",
    type: "ops",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.91,
    owner: "infra",
    summary: "The knowledge graph. Holds trusted, human-approved insights and how they relate to each other.",
    connected: 2,
  },
  {
    id: "curator-queue",
    label: "Curator Queue",
    type: "audit",
    status: "built",
    riskLevel: "medium",
    qualityScore: 0.84,
    owner: "woz",
    summary: "A human checkpoint. Agent proposals sit here until a curator approves or rejects them.",
    connected: 3,
  },
  {
    id: "agent-registry",
    label: "Agent Registry",
    type: "agent",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.86,
    owner: "brooks",
    summary: "The roster of all agents — who they are, what they can do, and what workspace they belong to.",
    connected: 3,
  },
  {
    id: "audit-events",
    label: "Audit Events",
    type: "audit",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.97,
    owner: "infra",
    summary: "A permanent receipt for every action — who did what, when, and the result. Read-only forever.",
    connected: 2,
  },
  {
    id: "governance-receipt",
    label: "Governance Receipt",
    type: "audit",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.95,
    owner: "infra",
    summary: "Proof that a promotion passed policy checks. Required before anything enters the knowledge graph.",
    connected: 2,
  },
  {
    id: "workspace",
    label: "Workspace",
    type: "platform",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.90,
    owner: "brooks",
    summary: "Your organization's isolated slice of Allura. All data is scoped to your workspace.",
    connected: 4,
  },
  {
    id: "group-id",
    label: "group_id",
    type: "security",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.99,
    owner: "security-team",
    summary: "A label stamped on every piece of data so it can never leak to another workspace.",
    connected: 2,
  },
  {
    id: "policy-pvm-023",
    label: "Policy: Budget Enforcement",
    type: "policy",
    status: "built",
    riskLevel: "medium",
    qualityScore: 0.88,
    owner: "brooks",
    summary:
      "PVM-023 — limits how many tokens an agent can spend per session. Agents that hit the limit are paused automatically.",
    evidenceIds: ["pvm-023"],
    docLinks: ["docs/allura/RISKS-AND-DECISIONS.md"],
    connected: 2,
  },
  // AI agents that connect through the MCP Gateway
  {
    id: "agent-claude",
    label: "Claude",
    type: "agent",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.90,
    owner: "anthropic",
    summary: "Anthropic's AI assistant. Connects to Allura through the MCP Gateway to read and store memories.",
    connected: 1,
  },
  {
    id: "agent-codex",
    label: "Codex",
    type: "agent",
    status: "built",
    riskLevel: "low",
    qualityScore: 0.87,
    owner: "openai",
    summary: "OpenAI's coding agent. Uses the MCP Gateway to access project memory.",
    connected: 1,
  },
  {
    id: "agent-cursor",
    label: "Cursor",
    type: "agent",
    status: "planned",
    riskLevel: "low",
    qualityScore: 0.85,
    owner: "cursor-team",
    summary: "AI-powered editor that can pull context from Allura while you code.",
    connected: 1,
  },
]

export const PLATFORM_EDGES: GraphEdge[] = [
  // Allura Platform owns everything
  { id: "e-owns-mcc",    source: "allura-platform",      target: "memory-command-center", relationship: "OWNS" },
  { id: "e-owns-engine", source: "allura-platform",      target: "allura-memory-engine",  relationship: "OWNS" },
  { id: "e-owns-guard",  source: "allura-platform",      target: "allura-guard",          relationship: "OWNS" },
  { id: "e-owns-mcp",    source: "allura-platform",      target: "mcp-gateway",           relationship: "OWNS" },
  { id: "e-owns-ws",     source: "allura-platform",      target: "workspace",             relationship: "OWNS" },
  { id: "e-owns-reg",    source: "allura-platform",      target: "agent-registry",        relationship: "OWNS" },
  { id: "e-owns-curator",source: "allura-platform",      target: "curator-queue",         relationship: "OWNS" },
  { id: "e-owns-audit",  source: "allura-platform",      target: "audit-events",          relationship: "OWNS" },

  // Allura Guard protects key surfaces
  { id: "e-guard-mcp",   source: "allura-guard",         target: "mcp-gateway",           relationship: "GUARDS" },
  { id: "e-guard-mcc",   source: "allura-guard",         target: "memory-command-center", relationship: "GUARDS" },
  { id: "e-guard-gid",   source: "allura-guard",         target: "group-id",              relationship: "GUARDS" },

  // MCP Gateway connects to AI agents
  { id: "e-conn-claude", source: "mcp-gateway",          target: "agent-claude",          relationship: "CONNECTS" },
  { id: "e-conn-codex",  source: "mcp-gateway",          target: "agent-codex",           relationship: "CONNECTS" },
  { id: "e-conn-cursor", source: "mcp-gateway",          target: "agent-cursor",          relationship: "CONNECTS" },

  // Memory Engine stores in both databases
  { id: "e-store-pg",    source: "allura-memory-engine", target: "postgres-episodic",     relationship: "STORES" },
  { id: "e-store-neo",   source: "allura-memory-engine", target: "neo4j-semantic",        relationship: "STORES" },

  // Curator approves things into the semantic graph
  { id: "e-approves",    source: "curator-queue",        target: "neo4j-semantic",        relationship: "APPROVES" },

  // Governance receipt is generated for promotions
  { id: "e-gen-receipt", source: "curator-queue",        target: "governance-receipt",    relationship: "GENERATES" },

  // Policy governs the workspace and agent registry
  { id: "e-policy-ws",   source: "policy-pvm-023",       target: "workspace",             relationship: "GOVERNED_BY" },
  { id: "e-policy-reg",  source: "policy-pvm-023",       target: "agent-registry",        relationship: "GOVERNED_BY" },

  // group_id belongs to workspace
  { id: "e-gid-ws",      source: "workspace",            target: "group-id",              relationship: "OWNS" },

  // Agents write through MCP, MCP reads memory engine
  { id: "e-mcp-writes",  source: "mcp-gateway",          target: "allura-memory-engine",  relationship: "WRITES" },
  { id: "e-mcp-reads",   source: "mcp-gateway",          target: "allura-memory-engine",  relationship: "READS" },

  // Audit events log everything
  { id: "e-audit-engine",source: "allura-memory-engine", target: "audit-events",          relationship: "GENERATES" },
]
