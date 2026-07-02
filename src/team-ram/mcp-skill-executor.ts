/**
 * MCP Skill Executor — Real runtime executor for Team RAM.
 *
 * Spawns skill MCP servers as stdio child processes, connects via
 * the MCP SDK client, and dispatches tool calls from the orchestrator's
 * plan. This replaces the injected test executor with production wiring.
 *
 * Architecture:
 * - Each skill name maps to a stdio-spawned MCP server process
 * - The executor connects, calls the tool, and returns the parsed result
 * - Lifecycle: spawn → connect → call → disconnect (per invocation)
 * - For long-lived processes, use McpSkillExecutorPool (future)
 *
 * @module team-ram/mcp-skill-executor
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { SkillCall, SkillExecutor } from "./orchestrator"
import { InProcessSkillExecutor } from "./in-process-executor"

// Re-export so callers can import from a single module.
export { InProcessSkillExecutor } from "./in-process-executor"

// ── Skill Server Registry ──────────────────────────────────────────────

/**
 * Describes how to launch a skill MCP server.
 */
export interface SkillServerConfig {
  /** Skill name matching TeamRamSkillName */
  skillName: string
  /** Command to spawn the server (e.g., "bun") */
  command: string
  /** Arguments to pass to the command */
  args: string[]
  /** Environment variables to inject (merged over process.env) */
  env?: Record<string, string>
  /** Working directory for the spawned process */
  cwd?: string
}

/**
 * Default skill server configurations.
 * Points to the skill source files in .opencode/skills/.
 */
const DEFAULT_SKILL_SERVERS: Record<string, SkillServerConfig> = {
  "skill-neo4j-memory": {
    skillName: "skill-neo4j-memory",
    command: "bun",
    args: ["run", ".opencode/skills/skill-neo4j-memory/src/index.ts"],
    env: {},
  },
  "skill-cypher-query": {
    skillName: "skill-cypher-query",
    command: "bun",
    args: ["run", ".opencode/skills/skill-cypher-query/src/index.ts"],
    env: {},
  },
  "skill-database": {
    skillName: "skill-database",
    command: "bun",
    args: ["run", ".opencode/skills/skill-database/src/index.ts"],
    env: {},
  },
}

// ── MCP Client Pool (per skill, reusable within a session) ─────────────

interface PooledClient {
  client: Client
  transport: StdioClientTransport
  skillName: string
}

/**
 * Manages a pool of MCP client connections to skill servers.
 * Connections are reused within a single orchestration run
 * and cleaned up when the pool is destroyed.
 */
export class McpClientPool {
  private pool = new Map<string, PooledClient>()
  private readonly servers: Record<string, SkillServerConfig>
  private readonly baseEnv: Record<string, string>
  private readonly cwd: string

  constructor(options?: {
    servers?: Record<string, SkillServerConfig>
    env?: Record<string, string>
    cwd?: string
  }) {
    this.servers = options?.servers ?? DEFAULT_SKILL_SERVERS
    this.baseEnv = options?.env ?? {}
    this.cwd = options?.cwd ?? process.cwd()
  }

  /**
   * Get or create a client connection for a skill.
   */
  async getClient(skillName: string): Promise<PooledClient> {
    const existing = this.pool.get(skillName)
    if (existing) return existing

    const config = this.servers[skillName]
    if (!config) {
      throw new Error(`No server config for skill: ${skillName}`)
    }

    return this.spawnAndConnect(config)
  }

  private async spawnAndConnect(config: SkillServerConfig): Promise<PooledClient> {
    const env = { ...process.env, ...this.baseEnv, ...config.env }

    // The MCP SDK StdioClientTransport spawns the process itself.
    // We pass command/args/env/cwd — it handles the rest.
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: env as Record<string, string>,
      cwd: config.cwd ?? this.cwd,
      stderr: "pipe",
    })

    const client = new Client(
      { name: `team-ram-executor-${config.skillName}`, version: "1.0.0" },
      { capabilities: {} },
    )

    await client.connect(transport)

    const pooled: PooledClient = {
      client,
      transport,
      skillName: config.skillName,
    }

    this.pool.set(config.skillName, pooled)
    return pooled
  }

  /**
   * Clean up all connections and kill subprocesses.
   */
  async destroy(): Promise<void> {
    const cleanup = Array.from(this.pool.values()).map(async (pooled) => {
      try {
        await pooled.client.close()
      } catch {
        // Best effort
      }
      try {
        // StdioClientTransport closes the spawned process on close()
        // but we call close() above; this is a safety net.
        if ((pooled.transport as any)._process) {
          (pooled.transport as any)._process.kill()
        }
      } catch {
        // Best effort
      }
    })
    await Promise.all(cleanup)
    this.pool.clear()
  }

  /**
   * Check if a skill has an active connection.
   */
  has(skillName: string): boolean {
    return this.pool.has(skillName)
  }

  /**
   * List currently connected skills.
   */
  connectedSkills(): string[] {
    return Array.from(this.pool.keys())
  }
}

// ── MCP Skill Executor ──────────────────────────────────────────────────

/**
 * Options for the MCP skill executor.
 */
export interface McpSkillExecutorOptions {
  /** Custom server configs (overrides defaults) */
  servers?: Record<string, SkillServerConfig>
  /** Extra environment variables for spawned servers */
  env?: Record<string, string>
  /** Working directory for spawned servers */
  cwd?: string
  /** Whether to reuse connections across calls (default: true) */
  poolConnections?: boolean
}

/**
 * Real runtime executor for Team RAM orchestrator.
 *
 * Spawns skill MCP servers as stdio child processes and dispatches
 * tool calls via the MCP SDK client protocol.
 *
 * Usage:
 * ```typescript
 * const executor = new McpSkillExecutor()
 * const result = await orchestrateTeamRamTask(task, executor)
 * await executor.destroy()  // Clean up spawned processes
 * ```
 */
export class McpSkillExecutor implements SkillExecutor {
  private readonly pool: McpClientPool
  private readonly poolConnections: boolean
  private destroyed = false

  constructor(options?: McpSkillExecutorOptions) {
    this.pool = new McpClientPool({
      servers: options?.servers,
      env: options?.env,
      cwd: options?.cwd,
    })
    this.poolConnections = options?.poolConnections ?? true
  }

  /**
   * Execute a skill call via MCP protocol.
   */
  async execute(call: SkillCall): Promise<unknown> {
    if (this.destroyed) {
      throw new Error("McpSkillExecutor has been destroyed")
    }

    const pooled = await this.pool.getClient(call.skillName)

    try {
      const result = await pooled.client.callTool({
        name: call.toolName,
        arguments: call.input,
      })

      // MCP SDK returns { content: [{ type: "text", text: "..." }] }
      const parsed = this.extractResult(result)
      return parsed
    } finally {
      // If not pooling, clean up after each call
      if (!this.poolConnections) {
        await this.pool.destroy()
      }
    }
  }

  /**
   * Extract structured data from MCP tool result.
   *
   * Skill servers return JSON in text content blocks.
   * Parse the text to get the actual result object.
   */
  private extractResult(raw: unknown): unknown {
    // Handle MCP CallToolResult shape: { content: [...], isError?: boolean }
    const result = raw as { content?: Array<{ type: string; text?: string }>; isError?: boolean }

    if (result.isError) {
      const errorText = result.content?.[0]?.text ?? "Unknown skill error"
      throw new Error(`Skill ${errorText}`)
    }

    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")

      if (textContent) {
        try {
          const parsed = JSON.parse(textContent)
          // Skill servers wrap in { success: true, result: ... } or { success: true, ... }
          if (parsed && typeof parsed === "object" && "success" in parsed) {
            if (parsed.success === false) {
              const error = (parsed as { error?: string }).error ?? "Skill returned failure"
              throw new Error(`Skill error: ${error}`)
            }
            // Return the inner result if it exists, otherwise the whole object
            return (parsed as { result?: unknown }).result ?? parsed
          }
          return parsed
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Skill")) throw e
          // Not JSON — return raw text
          return textContent
        }
      }
    }

    return raw
  }

  /**
   * Clean up all connections and spawned processes.
   */
  async destroy(): Promise<void> {
    this.destroyed = true
    await this.pool.destroy()
  }

  /**
   * Check which skills are currently connected.
   */
  connectedSkills(): string[] {
    return this.pool.connectedSkills()
  }
}

// ── Convenience Factory ─────────────────────────────────────────────────

/**
 * Create a configured skill executor for Team RAM orchestration.
 *
 * Returns an InProcessSkillExecutor that satisfies the SkillExecutor
 * contract using the repo's own connection layers (PG + Neo4j) instead
 * of spawning stdio child processes.
 *
 * The connection layers read credentials directly from process.env, so
 * options.cwd and options.extraEnv are accepted for API compatibility
 * but are not forwarded (no child processes are spawned).
 */
export function createMcpSkillExecutor(_options?: {
  cwd?: string
  extraEnv?: Record<string, string>
  poolConnections?: boolean
}): InProcessSkillExecutor {
  return new InProcessSkillExecutor()
}