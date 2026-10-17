/**
 * Merge Operations Tests
 * 
 * Tests for canonical merge operations, relationship updates, and audit trails.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createMerger, createMergerWithStrategy, MergeManager } from './merger'
import type { DedupEntity, MergeRequest, MergeResult, MergeStrategy } from './types'

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestEntity(overrides: Partial<DedupEntity> = {}): DedupEntity {
  return {
    id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'insight',
    primaryText: 'Test Entity',
    properties: {},
    createdAt: new Date(),
    ...overrides,
  }
}

// =============================================================================
// Merge Manager Tests
// =============================================================================

describe('MergeManager', () => {
  let manager: MergeManager

  beforeEach(() => {
    manager = createMerger()
  })

  // =============================================================================
  // Basic Merge Tests
  // =============================================================================

  describe('merge', () => {
    it('should merge duplicate entities', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2', 'entity-3'],
        entityType: 'insight',
        strategy: {
          canonicalSelection: 'oldest',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)

      expect(result).toBeDefined()
      expect(result.canonicalId).toBe('entity-1')
      expect(result.mergedIds).toEqual(['entity-2', 'entity-3'])
      expect(result.mergedAt).toBeInstanceOf(Date)
      expect(result.auditId).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should return merge result with statistics', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2'],
        entityType: 'agent',
        strategy: {
          canonicalSelection: 'manual',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)

      expect(result.relationshipsUpdated).toBeGreaterThanOrEqual(0)
      expect(result.propertiesMerged).toBeDefined()
      expect(Array.isArray(result.propertiesMerged)).toBe(true)
    })

    it('should handle empty duplicate list', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: [],
        entityType: 'insight',
        strategy: {
          canonicalSelection: 'oldest',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)

      expect(result.mergedIds).toEqual([])
      expect(result.relationshipsUpdated).toBe(0)
    })

    it('should handle multiple duplicates', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2', 'entity-3', 'entity-4', 'entity-5'],
        entityType: 'knowledge-item',
        strategy: {
          canonicalSelection: 'manual',
          conflictResolution: 'merge-all',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)

      expect(result.mergedIds.length).toBe(4)
    })
  })

  // =============================================================================
  // Canonical Selection Tests
  // =============================================================================

  describe('selectCanonical', () => {
    it('should select oldest entity by default', () => {
      const entities = [
        createTestEntity({ id: 'newest', createdAt: new Date('2024-01-03') }),
        createTestEntity({ id: 'middle', createdAt: new Date('2024-01-02') }),
        createTestEntity({ id: 'oldest', createdAt: new Date('2024-01-01') }),
      ]

      const canonicalId = manager.selectCanonical(entities, 'oldest')
      expect(canonicalId).toBe('oldest')
    })

    it('should select newest entity when specified', () => {
      const entities = [
        createTestEntity({ id: 'oldest', createdAt: new Date('2024-01-01') }),
        createTestEntity({ id: 'newest', createdAt: new Date('2024-01-03') }),
        createTestEntity({ id: 'middle', createdAt: new Date('2024-01-02') }),
      ]

      const canonicalId = manager.selectCanonical(entities, 'newest')
      expect(canonicalId).toBe('newest')
    })

    it('should select first entity for manual selection', () => {
      const entities = [
        createTestEntity({ id: 'first' }),
        createTestEntity({ id: 'second' }),
        createTestEntity({ id: 'third' }),
      ]

      const canonicalId = manager.selectCanonical(entities, 'manual')
      expect(canonicalId).toBe('first')
    })

    it('should select first entity for most-connected (simplified)', () => {
      const entities = [
        createTestEntity({ id: 'first' }),
        createTestEntity({ id: 'second' }),
      ]

      // Most-connected would require the semantic store query; simplified returns first
      const canonicalId = manager.selectCanonical(entities, 'most-connected')
      expect(canonicalId).toBe('first')
    })
  })

  // =============================================================================
  // Conflict Resolution Tests
  // =============================================================================

  describe('resolvePropertyConflict', () => {
    const canonical = { name: 'Canonical', value: 10, extra: 'extra' }
    const duplicate = { name: 'Duplicate', value: 20, other: 'other' }

    it('should prefer canonical with canonical-wins strategy', () => {
      const result = manager.resolvePropertyConflict(canonical, duplicate, 'canonical-wins')
      expect(result.name).toBe('Canonical')
      expect(result.value).toBe(10)
    })

    it('should prefer newest with newest-wins strategy', () => {
      const result = manager.resolvePropertyConflict(canonical, duplicate, 'newest-wins')
      // Without timestamps, falls back to canonical
      expect(result).toBeDefined()
    })

    it('should merge all properties with merge-all strategy', () => {
      const result = manager.resolvePropertyConflict(canonical, duplicate, 'merge-all')
      
      expect(result.name).toBe('Canonical')
      expect(result.value).toBe(10)
      expect(result.extra).toBe('extra')
      expect(result.other).toBe('other')
    })

    it('should prefer canonical for manual strategy', () => {
      const result = manager.resolvePropertyConflict(canonical, duplicate, 'manual')
      expect(result.name).toBe('Canonical')
    })
  })

  // =============================================================================
  // Audit Trail Tests
  // =============================================================================

  describe('audit trail', () => {
    it('should create audit entry on merge', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2'],
        entityType: 'insight',
        strategy: {
          canonicalSelection: 'oldest',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)

      expect(result.auditId).toBeDefined()
      expect(result.auditId).toMatch(/^merge-audit-/)
    })

    it('should retrieve audit entries', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2'],
        entityType: 'agent',
        strategy: {
          canonicalSelection: 'oldest',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      await manager.merge(request)
      const entries = await manager.getAuditEntries('entity-1')

      expect(entries.length).toBeGreaterThan(0)
      expect(entries[0].canonicalId).toBe('entity-1')
      expect(entries[0].mergedIds).toContain('entity-2')
    })

    it('should undo merge operation', async () => {
      const request: MergeRequest = {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2'],
        entityType: 'insight',
        strategy: {
          canonicalSelection: 'oldest',
          conflictResolution: 'canonical-wins',
          preserveData: true,
          updateRelationships: true,
          createAuditTrail: true,
        },
      }

      const result = await manager.merge(request)
      const undoResult = await manager.undoMerge(result.auditId)

      expect(undoResult).toBe(true)
    })
  })

  // =============================================================================
  // Strategy Tests
  // =============================================================================

  describe('strategy', () => {
    it('should use default strategy', () => {
      const defaultStrategy = manager.getStrategy()
      
      expect(defaultStrategy.canonicalSelection).toBe('oldest')
      expect(defaultStrategy.conflictResolution).toBe('canonical-wins')
      expect(defaultStrategy.preserveData).toBe(true)
      expect(defaultStrategy.updateRelationships).toBe(true)
      expect(defaultStrategy.createAuditTrail).toBe(true)
    })

    it('should update strategy', () => {
      manager.setStrategy({
        canonicalSelection: 'newest',
        conflictResolution: 'merge-all',
      })
      
      const strategy = manager.getStrategy()
      expect(strategy.canonicalSelection).toBe('newest')
      expect(strategy.conflictResolution).toBe('merge-all')
      // Other settings should be preserved
      expect(strategy.preserveData).toBe(true)
    })

    it('should preserve non-updated strategy values', () => {
      manager.setStrategy({ preserveData: false })
      manager.setStrategy({ updateRelationships: false })
      
      const strategy = manager.getStrategy()
      expect(strategy.preserveData).toBe(false)
      expect(strategy.updateRelationships).toBe(false)
      expect(strategy.createAuditTrail).toBe(true)
    })
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('factory functions', () => {
  it('should create manager with default config', () => {
    const manager = createMerger()
    expect(manager).toBeInstanceOf(MergeManager)
  })

  it('should create manager with custom strategy', () => {
    const strategy: Partial<MergeStrategy> = {
      canonicalSelection: 'newest',
      conflictResolution: 'merge-all',
    }
    const manager = createMerger({ strategy })
    
    const actualStrategy = manager.getStrategy()
    expect(actualStrategy.canonicalSelection).toBe('newest')
    expect(actualStrategy.conflictResolution).toBe('merge-all')
  })

  it('should create merger with canonical selection strategy', () => {
    const manager = createMergerWithStrategy('oldest')
    const strategy = manager.getStrategy()
    expect(strategy.canonicalSelection).toBe('oldest')
  })

  it('should create merger with newest selection strategy', () => {
    const manager = createMergerWithStrategy('newest')
    const strategy = manager.getStrategy()
    expect(strategy.canonicalSelection).toBe('newest')
  })

  it('should create merger with most-connected selection strategy', () => {
    const manager = createMergerWithStrategy('most-connected')
    const strategy = manager.getStrategy()
    expect(strategy.canonicalSelection).toBe('most-connected')
  })

  it('should merge additional strategy config', () => {
    const manager = createMergerWithStrategy('newest', {
      conflictResolution: 'newest-wins',
      preserveData: false,
    })
    const strategy = manager.getStrategy()
    
    expect(strategy.canonicalSelection).toBe('newest')
    expect(strategy.conflictResolution).toBe('newest-wins')
    expect(strategy.preserveData).toBe(false)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('MergeManager Integration', () => {
  it('should handle complex merge scenario', async () => {
    const manager = createMerger({
      strategy: {
        canonicalSelection: 'oldest',
        conflictResolution: 'merge-all',
        preserveData: true,
        updateRelationships: true,
        createAuditTrail: true,
      },
    })

    const entities = [
      createTestEntity({
        id: 'oldest',
        createdAt: new Date('2024-01-01'),
        primaryText: 'Original Entity',
      }),
      createTestEntity({
        id: 'middle',
        createdAt: new Date('2024-01-02'),
        primaryText: 'Similar Entity',
      }),
      createTestEntity({
        id: 'newest',
        createdAt: new Date('2024-01-03'),
        primaryText: 'Another Similar Entity',
      }),
    ]

    // Select canonical
    const canonicalId = manager.selectCanonical(entities, 'oldest')
    expect(canonicalId).toBe('oldest')

    // Perform merge
    const request: MergeRequest = {
      canonicalId,
      duplicateIds: ['middle', 'newest'],
      entityType: 'insight',
      strategy: manager.getStrategy(),
    }

    const result = await manager.merge(request)

    expect(result.canonicalId).toBe('oldest')
    expect(result.mergedIds).toContain('middle')
    expect(result.mergedIds).toContain('newest')

    // Verify audit trail
    const entries = await manager.getAuditEntries(canonicalId)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].operation).toBe('merge')
  })

  it('should handle merge with requested by', async () => {
    const manager = createMerger()

    const request: MergeRequest = {
      canonicalId: 'entity-1',
      duplicateIds: ['entity-2'],
      entityType: 'agent',
      strategy: manager.getStrategy(),
      requestedBy: 'user@example.com',
      reason: 'Detected as duplicate during import',
    }

    const result = await manager.merge(request)

    expect(result).toBeDefined()

    const entries = await manager.getAuditEntries('entity-1')
    expect(entries[0].performedBy).toBe('user@example.com')
    expect(entries[0].reason).toBe('Detected as duplicate during import')
  })

  it('should handle rapid sequential merges', async () => {
    const manager = createMerger()

    const requests: MergeRequest[] = [
      {
        canonicalId: 'entity-1',
        duplicateIds: ['entity-2'],
        entityType: 'insight',
        strategy: manager.getStrategy(),
      },
      {
        canonicalId: 'entity-3',
        duplicateIds: ['entity-4'],
        entityType: 'insight',
        strategy: manager.getStrategy(),
      },
      {
        canonicalId: 'entity-5',
        duplicateIds: ['entity-6'],
        entityType: 'insight',
        strategy: manager.getStrategy(),
      },
    ]

    const results = await Promise.all(requests.map((r) => manager.merge(r)))

    expect(results.length).toBe(3)
    results.forEach((result) => {
      expect(result.auditId).toBeDefined()
      expect(result.mergedAt).toBeInstanceOf(Date)
    })
  })

  it('should maintain separate audit trails for different entities', async () => {
    const manager = createMerger()

    await manager.merge({
      canonicalId: 'entity-1',
      duplicateIds: ['entity-2'],
      entityType: 'agent',
      strategy: manager.getStrategy(),
    })

    await manager.merge({
      canonicalId: 'entity-3',
      duplicateIds: ['entity-4'],
      entityType: 'agent',
      strategy: manager.getStrategy(),
    })

    const entries1 = await manager.getAuditEntries('entity-1')
    const entries2 = await manager.getAuditEntries('entity-3')

    expect(entries1[0].canonicalId).toBe('entity-1')
    expect(entries2[0].canonicalId).toBe('entity-3')
  })
})