/**
 * Deduplication Module Index
 * 
 * Exports all deduplication components for entity duplicate detection and merging.
 */

// Types
export type {
  EntityType,
  DedupEntity,
  SimilarityResult,
  DuplicatePair,
  MergeRequest,
  MergeStrategy,
  MergeResult,
  MergeAuditEntry,
  DetectionConfig,
  DetectionResult,
  EmbeddingVector,
  CachedEmbedding,
  EmbeddingOptions,
  TextSimilarityOptions,
  TextSimilarityResult,
} from './types'

// Embeddings
export {
  EmbeddingManager,
  createEmbeddingManager,
  createMockEmbeddingManager,
  createOpenAIEmbeddingManager,
} from './embeddings'
export type { EmbeddingGenerator } from './embeddings'

// Text Similarity
export {
  TextSimilarityManager,
  createTextManager,
  createLevenshteinManager,
  createJaroWinklerManager,
  createHybridTextManager,
  normalizeString,
  expandAbbreviations,
  tokenize,
  getNgrams,
  levenshteinDistance,
  levenshteinSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
} from './text-similarity'

// Detector
export {
  DuplicateDetector,
  createDetector,
  createDetectorForTypes,
} from './detector'

// Merger
export {
  MergeManager,
  createMerger,
  createMergerWithStrategy,
} from './merger'
export type { GraphMergeClient } from './merger'

// Proposal Dedup
export {
  ProposalDedupChecker,
  createProposalDedupChecker,
  getDedupThreshold,
  DEFAULT_PROPOSAL_DEDUP_THRESHOLD,
} from './proposal-dedup'
export type {
  ProposalCandidate,
  ProposalDedupResult,
} from './proposal-dedup'

// Default export
import { DuplicateDetector } from './detector'
import { EmbeddingManager } from './embeddings'
import { MergeManager } from './merger'
import { TextSimilarityManager } from './text-similarity'

const dedup = {
  DuplicateDetector,
  MergeManager,
  EmbeddingManager,
  TextSimilarityManager,
}

export default dedup