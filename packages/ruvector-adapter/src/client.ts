// RuVectorAdapter — thin, governed wrapper around RuVector.
// Optional and disabled by default (base Allura boot must not require it, AD-09).

import type { AlluraScope } from "@allura/types";
import { search, type SearchHit, type SearchResult } from "./search.ts";
import { recordFeedback, type FeedbackProposal } from "./feedback.ts";
import {
  snapshot,
  restore,
  type SnapshotReceipt,
  type RestoreReceipt,
} from "./snapshot.ts";

export interface RuVectorAdapterConfig {
  baseUrl?: string;
  /** Adapter is opt-in; defaults to disabled so base boot never depends on it. */
  enabled?: boolean;
}

export class RuVectorAdapter {
  constructor(private readonly config: RuVectorAdapterConfig = {}) {}

  get enabled(): boolean {
    return this.config.enabled ?? false;
  }

  search(scope: AlluraScope, query: string, hits?: SearchHit[]): Promise<SearchResult> {
    return search(scope, query, hits);
  }

  recordFeedback(
    scope: AlluraScope,
    memoryId: string,
    signal: number,
  ): Promise<FeedbackProposal> {
    return recordFeedback(scope, memoryId, signal);
  }

  snapshot(scope: AlluraScope): Promise<SnapshotReceipt> {
    return snapshot(scope);
  }

  restore(scope: AlluraScope, snapshotId: string): Promise<RestoreReceipt> {
    return restore(scope, snapshotId);
  }
}
