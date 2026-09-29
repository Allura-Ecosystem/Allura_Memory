/**
 * Curator Governance - Manages promotion workflow for high-value insights
 * 
 * This module handles the human-in-the-loop approval process
 * for promoting insights from episodic (PostgreSQL) to semantic (PostgreSQL + RuVector) memory.
 */

import { memory_add } from 'mcp:allura-memory';

interface PromotionProposal {
  insight: string;
  rationale: string;
  confidence: number;
  agentId: string;
  group_id?: string;
}

/**
 * Propose an insight for promotion to the canonical semantic layer
 * 
 * If confidence ≥ 0.85 and PROMOTION_MODE = 'auto': promoted immediately
 * If confidence < 0.85 or PROMOTION_MODE = 'soc2': queued for curator approval
 */
export async function proposePromotion(params: PromotionProposal): Promise<void> {
  const { insight, rationale, confidence, agentId, group_id = 'allura-system' } = params;
  
  try {
    await memory_add({
      group_id: group_id,
      user_id: agentId,
      content: insight,
      metadata: {
        source: 'agent',
        event_type: 'PROMOTION_PROPOSED',
        rationale: rationale,
        confidence: confidence,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`[Curator] Proposed promotion: ${insight.substring(0, 50)}... (confidence: ${confidence})`);
  } catch (error) {
    console.error('[Curator] Failed to propose promotion:', error);
  }
}

/**
 * Approve a promotion proposal (curator action)
 * 
 * This creates a memory_promoted event and triggers the canonical semantic write
 */
export async function approvePromotion(params: {
  proposalId: string;
  curatorId: string;
  group_id?: string;
}): Promise<void> {
  const { proposalId, curatorId, group_id = 'allura-system' } = params;
  
  try {
    await memory_add({
      group_id: group_id,
      user_id: curatorId,
      content: `Approved promotion: ${proposalId}`,
      metadata: {
        source: 'curator',
        event_type: 'PROMOTION_APPROVED',
        proposal_id: proposalId,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`[Curator] Approved promotion ${proposalId}`);
  } catch (error) {
    console.error('[Curator] Failed to approve promotion:', error);
  }
}

/**
 * Reject a promotion proposal (curator action)
 */
export async function rejectPromotion(params: {
  proposalId: string;
  curatorId: string;
  reason: string;
  group_id?: string;
}): Promise<void> {
  const { proposalId, curatorId, reason, group_id = 'allura-system' } = params;
  
  try {
    await memory_add({
      group_id: group_id,
      user_id: curatorId,
      content: `Rejected promotion: ${proposalId}`,
      metadata: {
        source: 'curator',
        event_type: 'PROMOTION_REJECTED',
        proposal_id: proposalId,
        rejection_reason: reason,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`[Curator] Rejected promotion ${proposalId}: ${reason}`);
  } catch (error) {
    console.error('[Curator] Failed to reject promotion:', error);
  }
}