/**
 * Merge Operations
 * 
 * Handles canonical merge operations for duplicate entities.
 * Updates relationships and preserves audit trail.
 */

import type {
  DedupEntity,
  EntityType,
  MergeAuditEntry,
  MergeRequest,
  MergeResult,
  MergeStrategy,
} from './types'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_STRATEGY: MergeStrategy = {
  canonicalSelection: 'oldest',
  conflictResolution: 'canonical-wins',
  preserveData: true,
  updateRelationships: true,
  createAuditTrail: true,
}

// =============================================================================
// Graph Merge Client Interface
// =============================================================================

/**
 * Graph merge client interface for merge operations
 */
export interface GraphMergeClient {
  run(query: string, params?: Record<string, unknown>): Promise<{ records: unknown[] }>
  close(): Promise<void>
}

// =============================================================================
// Cypher Queries
// =============================================================================

const QUERIES = {
  /**
   * Get entity by ID
   */
  getEntity: `
    MATCH (e {id: $id})
    RETURN e.id as id, labels(e) as labels, e as properties
  `,

  /**
   * Get relationships for an entity
   */
  getRelationships: `
    MATCH (e {id: $id})-[r]-(other)
    RETURN type(r) as type, 
           startNode(r).id as sourceId, 
           endNode(r).id as targetId,
           properties(r) as properties,
           CASE WHEN startNode(r) = e THEN 'outgoing' ELSE 'incoming' END as direction
  `,

  /**
   * Update relationship to point to canonical entity
   */
  updateRelationshipSource: `
    MATCH (old {id: $oldId})-[r]->(target)
    MATCH (canonical {id: $canonicalId})
    MERGE (canonical)-[newR:$(relationshipType)]->(target)
    SET newR += r
    DELETE r
  `,

  /**
   * Update relationship target
   */
  updateRelationshipTarget: `
    MATCH (source)-[r]->(old {id: $oldId})
    MATCH (canonical {id: $canonicalId})
    MERGE (source)-[newR:$(relationshipType)]->(canonical)
    SET newR += r
    DELETE r
  `,

  /**
   * Merge entity properties
   */
  mergeEntityProperties: `
    MATCH (canonical {id: $canonicalId})
    MATCH (duplicate {id: $duplicateId})
    SET canonical += $mergedProperties,
        canonical.mergedFrom = $duplicateId,
        canonical.mergedAt = datetime(),
        canonical.mergeHistory = coalesce(canonical.mergeHistory, []) + $mergeEntry
    RETURN canonical.id as id
  `,

  /**
   * Delete duplicate entity
   */
  deleteEntity: `
    MATCH (e {id: $id})
    DETACH DELETE e
  `,

  /**
   * Archive merged entity
   */
  archiveEntity: `
    MATCH (e {id: $id})
    SET e:_Merged,
        e.mergedAt = datetime(),
        e.mergedInto = $canonicalId
    RETURN e.id as id
  `,

  /**
   * Get entities by IDs
   */
  getEntitiesByIds: `
    MATCH (e)
    WHERE e.id IN $ids
    RETURN e.id as id, labels(e) as labels, e as properties, e.createdAt as createdAt
  `,

  /**
   * Get relationship count
   */
  getRelationshipCount: `
    MATCH (e {id: $id})-[r]-()
    RETURN count(r) as count
  `,

  /**
   * Create audit entry
   */
  createAuditEntry: `
    CREATE (audit:MergeAudit {
      id: $id,
      timestamp: datetime(),
      operation: $operation,
      entityType: $entityType,
      canonicalId: $canonicalId,
      mergedIds: $mergedIds,
      performedBy: $performedBy,
      reason: $reason,
      similarityScore: $similarityScore,
      strategy: $strategy,
      beforeData: $beforeData,
      afterData: $afterData,
      metadata: $metadata
    })
    RETURN audit.id as id
  `,

  /**
   * Get audit entries for entity
   */
  getAuditEntries: `
    MATCH (audit:MergeAudit)
    WHERE $entityId IN audit.mergedIds OR audit.canonicalId = $entityId
    RETURN audit.id as id,
           audit.timestamp as timestamp,
           audit.operation as operation,
           audit.canonicalId as canonicalId,
           audit.mergedIds as mergedIds,
           audit.performedBy as performedBy,
           audit.reason as reason
    ORDER BY audit.timestamp DESC
    LIMIT $limit
  `,
}

// =============================================================================
// Merge Manager
// =============================================================================

/**
 * Merge Manager
 * 
 * Handles canonical merge operations with audit trail support.
 */
export class MergeManager {
  private client: GraphMergeClient | null
  private strategy: MergeStrategy
  private auditEntries: Map<string, MergeAuditEntry>

  constructor(config: {
    client?: GraphMergeClient
    strategy?: Partial<MergeStrategy>
  } = {}) {
    this.client = config.client ?? null
    this.strategy = { ...DEFAULT_STRATEGY, ...config.strategy }
    this.auditEntries = new Map()
  }

  /**
   * Merge duplicate entities into canonical entity
   */
  async merge(request: MergeRequest): Promise<MergeResult> {
    const startTime = Date.now()

    // Resolve canonical entity if not specified
    const canonicalId = request.canonicalId
    const duplicateIds = request.duplicateIds

    // Generate audit ID
    const auditId = this.generateAuditId()

    // Get entities before merge (for audit)
    const beforeData = await this.getEntitiesBeforeMerge(canonicalId, duplicateIds)

    // Perform merge operations
    let relationshipsUpdated = 0
    const propertiesMerged: string[] = []

    if (this.client) {
      // Real graph merge
      relationshipsUpdated = await this.mergeWithGraphClient(
        canonicalId,
        duplicateIds,
        request.entityType
      )
    } else {
      // Mock merge
      relationshipsUpdated = await this.mockMerge(canonicalId, duplicateIds)
    }

    // Create audit trail
    if (this.strategy.createAuditTrail) {
      await this.createAudit({
        auditId,
        canonicalId,
        duplicateIds,
        entityType: request.entityType,
        performedBy: request.requestedBy ?? 'system',
        reason: request.reason ?? 'Duplicate detection merge',
        beforeData,
        strategy: this.strategy,
      })
    }

    const durationMs = Date.now() - startTime

    return {
      canonicalId,
      mergedIds: duplicateIds,
      relationshipsUpdated,
      propertiesMerged,
      mergedAt: new Date(),
      auditId,
      durationMs,
    }
  }

  /**
   * Merge with graph client
   */
  private async mergeWithGraphClient(
    canonicalId: string,
    duplicateIds: string[],
    _entityType: EntityType
  ): Promise<number> {
    if (!this.client) return 0

    let relationshipsUpdated = 0

    for (const duplicateId of duplicateIds) {
      // Update relationships pointing to duplicate
      const relResult = await this.client.run(
        'MATCH (source)-[r]->(dup {id: $dupId}) MATCH (can {id: $canId}) MERGE (source)-[newR]->(can) SET newR += properties(r) DELETE r RETURN count(newR) as count',
        { dupId: duplicateId, canId: canonicalId }
      )
      
      const incomingCount = (relResult.records?.[0] as { count: number } | undefined)?.count ?? 0
      relationshipsUpdated += incomingCount

      // Update relationships from duplicate
      const outResult = await this.client.run(
        'MATCH (dup {id: $dupId})-[r]->(target) MATCH (can {id: $canId}) MERGE (can)-[newR]->(target) SET newR += properties(r) DELETE r RETURN count(newR) as count',
        { dupId: duplicateId, canId: canonicalId }
      )

      const outgoingCount = (outResult.records?.[0] as { count: number } | undefined)?.count ?? 0
      relationshipsUpdated += outgoingCount

      // Archive or delete duplicate
      if (this.strategy.preserveData) {
        await this.client.run(QUERIES.archiveEntity, {
          id: duplicateId,
          canonicalId,
        })
      } else {
        await this.client.run(QUERIES.deleteEntity, {
          id: duplicateId,
        })
      }
    }

    return relationshipsUpdated
  }

  /**
   * Mock merge for testing
   */
  private async mockMerge(
    _canonicalId: string,
    duplicateIds: string[]
  ): Promise<number> {
    // Simulate relationship updates (1-3 per duplicate)
    await new Promise((resolve) => setTimeout(resolve, 10))
    return duplicateIds.length * Math.floor(Math.random() * 3 + 1)
  }

  /**
   * Get entities before merge
   */
  private async getEntitiesBeforeMerge(
    canonicalId: string,
    duplicateIds: string[]
  ): Promise<Record<string, unknown>> {
    const beforeData: Record<string, unknown> = {
      canonicalId,
      duplicateIds,
      timestamp: new Date().toISOString(),
    }

    if (this.client) {
      // Get entities from the graph client
      const result = await this.client.run(QUERIES.getEntitiesByIds, {
        ids: [canonicalId, ...duplicateIds],
      })

      if (result.records) {
        beforeData.entities = result.records.map((record) => {
          const r = record as { id: string; labels: string[]; properties: unknown; createdAt: string }
          return {
            id: r.id,
            labels: r.labels,
            properties: r.properties,
            createdAt: r.createdAt,
          }
        })
      }
    }

    return beforeData
  }

  /**
   * Create audit entry
   */
  private async createAudit(params: {
    auditId: string
    canonicalId: string
    duplicateIds: string[]
    entityType: EntityType
    performedBy: string
    reason: string
    beforeData: Record<string, unknown>
    strategy: MergeStrategy
  }): Promise<void> {
    const entry: MergeAuditEntry = {
      id: params.auditId,
      timestamp: new Date(),
      operation: 'merge',
      entityType: params.entityType,
      canonicalId: params.canonicalId,
      mergedIds: params.duplicateIds,
      performedBy: params.performedBy,
      reason: params.reason,
      similarityScore: 0, // Would be passed from detector
      strategy: params.strategy,
      beforeData: params.beforeData,
    }

    this.auditEntries.set(params.auditId, entry)

    if (this.client) {
      await this.client.run(QUERIES.createAuditEntry, {
        id: params.auditId,
        operation: 'merge',
        entityType: params.entityType,
        canonicalId: params.canonicalId,
        mergedIds: params.duplicateIds,
        performedBy: params.performedBy,
        reason: params.reason,
        similarityScore: 0,
        strategy: JSON.stringify(params.strategy),
        beforeData: JSON.stringify(params.beforeData),
        afterData: JSON.stringify({}),
        metadata: JSON.stringify({}),
      })
    }
  }

  /**
   * Get audit entries for an entity
   */
  async getAuditEntries(
    entityId: string,
    limit: number = 10
  ): Promise<MergeAuditEntry[]> {
    if (this.client) {
      const result = await this.client.run(QUERIES.getAuditEntries, {
        entityId,
        limit,
      })

      if (result.records) {
        return result.records.map((record) => {
          const r = record as {
            id: string
            timestamp: string
            operation: string
            canonicalId: string
            mergedIds: string[]
            performedBy: string
            reason: string
          }
          return {
            id: r.id,
            timestamp: new Date(r.timestamp),
            operation: r.operation as 'merge' | 'undo' | 'review' | 'reject',
            entityType: 'agent' as EntityType, // Would be fetched
            canonicalId: r.canonicalId,
            mergedIds: r.mergedIds,
            performedBy: r.performedBy,
            reason: r.reason,
            similarityScore: 0,
            strategy: DEFAULT_STRATEGY,
          }
        })
      }
    }

    // Return local audit entries
    return Array.from(this.auditEntries.values())
      .filter(
        (e) => e.canonicalId === entityId || e.mergedIds.includes(entityId)
      )
      .slice(0, limit)
  }

  /**
   * Undo a merge operation
   */
  async undoMerge(auditId: string): Promise<boolean> {
    const entry = this.auditEntries.get(auditId)
    if (!entry) return false

    // Create undo audit entry
    const undoAuditId = this.generateAuditId()
    const undoEntry: MergeAuditEntry = {
      id: undoAuditId,
      timestamp: new Date(),
      operation: 'undo',
      entityType: entry.entityType,
      canonicalId: entry.canonicalId,
      mergedIds: entry.mergedIds,
      performedBy: entry.performedBy,
      reason: `Undo merge ${auditId}`,
      similarityScore: entry.similarityScore,
      strategy: entry.strategy,
      beforeData: entry.beforeData,
    }

    this.auditEntries.set(undoAuditId, undoEntry)

    // Note: Full undo would require restoring entities and relationships
    // This is a simplified version for demonstration

    if (this.client) {
      await this.client.run(QUERIES.createAuditEntry, {
        id: undoAuditId,
        operation: 'undo',
        entityType: entry.entityType,
        canonicalId: entry.canonicalId,
        mergedIds: entry.mergedIds,
        performedBy: 'system',
        reason: `Undo merge ${auditId}`,
        similarityScore: entry.similarityScore,
        strategy: JSON.stringify(entry.strategy),
        beforeData: JSON.stringify(entry.beforeData ?? {}),
        afterData: JSON.stringify({}),
        metadata: JSON.stringify({ undoOf: auditId }),
      })
    }

    return true
  }

  /**
   * Select canonical entity from candidates
   */
  selectCanonical(
    entities: DedupEntity[],
    strategy: MergeStrategy['canonicalSelection'] = 'oldest'
  ): string {
    switch (strategy) {
      case 'oldest':
        return entities.reduce((oldest, current) =>
          current.createdAt < oldest.createdAt ? current : oldest
        ).id
      
      case 'newest':
        return entities.reduce((newest, current) =>
          current.createdAt > newest.createdAt ? current : newest
        ).id
      
      case 'most-connected':
        // Would need to query the graph client for connection count
        // For now, return first entity
        return entities[0].id
      
      case 'manual':
      default:
        return entities[0].id
    }
  }

  /**
   * Resolve property conflicts
   */
  resolvePropertyConflict(
    canonical: Record<string, unknown>,
    duplicate: Record<string, unknown>,
    strategy: MergeStrategy['conflictResolution']
  ): Record<string, unknown> {
    switch (strategy) {
      case 'canonical-wins':
        return { ...duplicate, ...canonical }
      
      case 'newest-wins':
        // Would need timestamps - for now, prefer canonical
        return { ...canonical }
      
      case 'merge-all':
        const merged: Record<string, unknown> = {}
        const canonicalKeys = Object.keys(canonical)
        const duplicateKeys = Object.keys(duplicate)
        const allKeys = [...canonicalKeys, ...duplicateKeys]
        
        for (const key of allKeys) {
          if (key in canonical && key in duplicate) {
            // Both have the property - prefer canonical value
            merged[key] = canonical[key]
          } else if (key in canonical) {
            merged[key] = canonical[key]
          } else {
            merged[key] = duplicate[key]
          }
        }
        
        return merged
      
      case 'manual':
      default:
        return canonical
    }
  }

  /**
   * Generate audit ID
   */
  private generateAuditId(): string {
    return `merge-audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Update merge strategy
   */
  setStrategy(strategy: Partial<MergeStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy }
  }

  /**
   * Get current strategy
   */
  getStrategy(): MergeStrategy {
    return { ...this.strategy }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a merge manager
 */
export function createMerger(config: {
  client?: GraphMergeClient
  strategy?: Partial<MergeStrategy>
} = {}): MergeManager {
  return new MergeManager(config)
}

/**
 * Create a merge manager for specific strategy
 */
export function createMergerWithStrategy(
  strategy: MergeStrategy['canonicalSelection'],
  config: Omit<Partial<MergeStrategy>, 'canonicalSelection'> = {}
): MergeManager {
  return new MergeManager({
    strategy: {
      ...DEFAULT_STRATEGY,
      ...config,
      canonicalSelection: strategy,
    },
  })
}

// =============================================================================
// Default Export
// =============================================================================

export default MergeManager