import { createHash, randomUUID } from 'node:crypto';
import { type Identity } from './authentication.ts';
import { resolveAuthority, AuthorityError, type AuthorityStore, type Scope } from './authority.ts';
import {
  ExperimentError, experimentLimits, exactObject, boundedText, boundedArray, experimentId, memoryId,
  parseScope, sameScope, parseSnapshot, snapshotDigest, type BaseSnapshot, type ExperimentRecord,
} from './memory-experiment-contract.ts';

// Strict bounded JSON digest: no getters/toJSON/prototype execution, no silent NaN/undefined.
function jsonDigest(value: unknown): string {
  let nodes = 0;
  const walk = (item: unknown, depth: number): unknown => {
    if (++nodes > 16384 || depth > 8) { throw new ExperimentError('invalid'); }
    if (item === null || typeof item === 'boolean') { return item; }
    if (typeof item === 'string') {
      if (Buffer.byteLength(item) > 131072) { throw new ExperimentError('invalid'); }
      return item;
    }
    if (typeof item === 'number' && Number.isSafeInteger(item)) { return item; }
    if (!item || typeof item !== 'object') { throw new ExperimentError('invalid'); }
    if (Array.isArray(item)) {
      if (item.length > 128 || Reflect.ownKeys(item).length !== item.length + 1) { throw new ExperimentError('invalid'); }
      return Array.from({ length: item.length }, (_, i) => {
        const property = Object.getOwnPropertyDescriptor(item, String(i));
        if (!property || !Object.hasOwn(property, 'value')) { throw new ExperimentError('invalid'); }
        return walk(property.value, depth + 1);
      });
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) { throw new ExperimentError('invalid'); }
    const keys = Object.keys(item).sort();
    if (keys.length > 32 || Reflect.ownKeys(item).length !== keys.length) { throw new ExperimentError('invalid'); }
    return Object.fromEntries(keys.map(key => {
      const property = Object.getOwnPropertyDescriptor(item, key)!;
      if (!Object.hasOwn(property, 'value')) { throw new ExperimentError('invalid'); }
      return [key, walk(property.value, depth + 1)];
    }));
  };
  const text = JSON.stringify(walk(value, 0));
  if (Buffer.byteLength(text) > 400000) { throw new ExperimentError('quota'); }
  return createHash('sha256').update(text).digest('hex');
}

type State = 'active' | 'quarantined' | 'disposed' | 'expired';
export type ExperimentBranch = Readonly<{
  branchId: string; ownerId: string; scope: Scope; baseDigest: string; snapshotId: string;
  parentBranchId: string | null; revision: number; createdAt: number; expiresAt: number; state: State;
}>;
export type ExperimentDiff = Readonly<{
  memoryId: string; knowledgeId: string; expectedBaseVersion: string;
  kind: 'replace' | 'tombstone'; before: string; after: string | null; evidenceIds: readonly string[];
}>;
export type ExperimentViewRecord = Readonly<Omit<ExperimentRecord, 'version'> & {
  baseVersion: string; experimentOnly: true;
}>;
type Branch = {
  meta: ExperimentBranch; base: BaseSnapshot | null; overlay: Map<string, string | null>;
  candidate: ProposalCandidate | null;
  checkpoints: Map<string, Map<string, string | null>>; keys: Set<string>;
  timer: ReturnType<typeof setTimeout>;
};
export type ExperimentResult =
  | { kind: 'updated'; branch: ExperimentBranch }
  | { kind: 'checkpoint'; branch: ExperimentBranch; checkpointId: string }
  | { kind: 'fork'; branch: ExperimentBranch };
export type ExperimentOptions = {
  authority: AuthorityStore;
  /** Trusted adapter, not a caller-supplied base. Must return current same-scope authorized records. */
  readSnapshot: (identity: Identity, scope: Scope, snapshotId: string) => Promise<unknown>;
  /** Test seam only; production uses server time and independent real retention timers. */
  now?: () => number;
};
export type ProposalCandidate = Readonly<{
  schema: 'memory-experiment-proposal-v1'; status: 'requires_curator_review'; canonicalMutation: false;
  branchId: string; scope: Scope; producerId: string; baseDigest: string; snapshotId: string;
  revision: number; expiresAt: number; changes: readonly ExperimentDiff[];
  evidenceIds: readonly string[]; rationale: string; candidateDigest: string;
}>;
const ttl = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > experimentLimits.maxTtlMs) { throw new ExperimentError('invalid'); }
  return Number(value);
};
const digest = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) { throw new ExperimentError('invalid'); }
  return value;
};

/** Disposable local candidate. Intentionally no SQL, disk, network, import, approve or merge API. */
export class MemoryExperimentEngine {
  #options: ExperimentOptions;
  #branches = new Map<string, Branch>();
  #createKeys = new Set<string>();
  #busy = false;
  #closed = false;
  #lastTime: number;
  #deadline: number;
  #timer: ReturnType<typeof setTimeout>;

  constructor(options: ExperimentOptions) {
    this.#options = { ...options };
    this.#lastTime = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(this.#lastTime) || this.#lastTime < 0 || !Number.isSafeInteger(this.#lastTime + experimentLimits.maxTtlMs)) { throw new ExperimentError('invalid'); }
    this.#deadline = this.#lastTime + experimentLimits.maxTtlMs;
    this.#timer = setTimeout(() => this.destroy(), experimentLimits.maxTtlMs);
    this.#timer.unref();
  }
  /** Host-only teardown, not an authenticated transport action. Permanently invalidates this engine. */
  destroy(): void {
    this.#closed = true;
    clearTimeout(this.#timer);
    for (const branch of this.#branches.values()) { this.#purge(branch, 'disposed'); }
    this.#branches.clear(); this.#createKeys.clear();
  }
  #time(): number {
    if (this.#closed) { throw new ExperimentError('disposed'); }
    const now = (this.#options.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < this.#lastTime) { this.destroy(); throw new ExperimentError('unavailable'); }
    this.#lastTime = now;
    if (now >= this.#deadline) { this.destroy(); throw new ExperimentError('expired'); }
    for (const branch of this.#branches.values()) {
      if (now >= branch.meta.expiresAt && branch.meta.state === 'active') { this.#purge(branch, 'expired'); }
    }
    return now;
  }
  #purge(branch: Branch, state: Exclude<State, 'active'>): void {
    clearTimeout(branch.timer); branch.base = null; branch.candidate = null; branch.overlay.clear(); branch.checkpoints.clear();
    branch.meta = Object.freeze({ ...branch.meta, state });
    if (state === 'quarantined') {
      for (const child of this.#branches.values()) {
        if (child.meta.parentBranchId === branch.meta.branchId && child.meta.state !== 'quarantined') { this.#purge(child, 'quarantined'); }
      }
    }
    // IDs/operation keys remain bounded until engine teardown; disposal cannot reset replay or quota.
  }
  async #run<T>(work: () => Promise<T>): Promise<T> {
    this.#time();
    if (this.#busy) { throw new ExperimentError('busy'); }
    this.#busy = true;
    try { return await work(); } finally { this.#busy = false; }
  }
  async #authorize(identity: Identity, scope: Scope, write: boolean): Promise<string> {
    const read = await resolveAuthority(identity, scope, 'memory:read', this.#options.authority);
    if (write) {
      const proposal = await resolveAuthority(identity, scope, 'proposal:write', this.#options.authority);
      if (read.principalId !== proposal.principalId) { throw new AuthorityError('forbidden'); }
    }
    this.#time();
    return read.principalId;
  }
  #get(id: string, scope: Scope, ownerId: string): Branch {
    const branch = this.#branches.get(id);
    if (!branch || !sameScope(branch.meta.scope, scope) || branch.meta.ownerId !== ownerId) { throw new ExperimentError('not_found'); }
    if (branch.meta.state !== 'active') { throw new ExperimentError(branch.meta.state); }
    if (!branch.base || snapshotDigest(branch.base) !== branch.meta.baseDigest) {
      this.#purge(branch, 'quarantined'); throw new ExperimentError('quarantined');
    }
    return branch;
  }
  #allocate(base: BaseSnapshot, ownerId: string, expiresAt: number, parent: Branch | null): Branch {
    if (this.#branches.size >= experimentLimits.branches) { throw new ExperimentError('quota'); }
    const now = this.#time();
    const meta: ExperimentBranch = Object.freeze({ branchId: randomUUID(), ownerId, scope: base.scope,
      baseDigest: snapshotDigest(base), snapshotId: base.snapshotId, parentBranchId: parent?.meta.branchId ?? null,
      revision: 0, createdAt: now, expiresAt: Math.min(expiresAt, this.#deadline), state: 'active' });
    const branch: Branch = { meta, base, candidate: null, overlay: new Map(parent?.overlay), checkpoints: new Map(), keys: new Set(),
      timer: setTimeout(() => { this.#purge(branch, 'expired'); }, meta.expiresAt - now) };
    branch.timer.unref(); this.#branches.set(meta.branchId, branch); return branch;
  }
  async create(identity: Identity, requestedScope: Scope, input: unknown): Promise<ExperimentBranch> {
    return this.#run(async () => {
      const scope = parseScope(requestedScope);
      const owner = await this.#authorize(identity, scope, true);
      const request = exactObject(input, ['snapshotId', 'expectedBaseDigest', 'operationKey', 'ttlMs']);
      const snapshotId = experimentId(request.snapshotId);
      const expected = digest(request.expectedBaseDigest);
      const key = JSON.stringify([scope, owner, experimentId(request.operationKey)]);
      const duration = ttl(request.ttlMs);
      if (this.#createKeys.has(key)) { throw new ExperimentError('conflict'); }
      if (this.#branches.size >= experimentLimits.branches) { throw new ExperimentError('quota'); }
      let raw: unknown;
      try { raw = await this.#options.readSnapshot(identity, scope, snapshotId); } catch { throw new ExperimentError('unavailable'); }
      const base = parseSnapshot(raw, scope);
      if (base.snapshotId !== snapshotId) { throw new ExperimentError('not_found'); }
      if (snapshotDigest(base) !== expected) { throw new ExperimentError('conflict'); }
      if (await this.#authorize(identity, scope, true) !== owner) { throw new AuthorityError('forbidden'); }
      const branch = this.#allocate(base, owner, this.#time() + duration, null);
      this.#createKeys.add(key); return branch.meta;
    });
  }
  #diff(branch: Branch): readonly ExperimentDiff[] {
    return Object.freeze(branch.base!.records.flatMap(row => {
      if (!branch.overlay.has(row.memoryId)) { return []; }
      const after = branch.overlay.get(row.memoryId)!;
      if (after === row.content) { return []; }
      return [Object.freeze({ memoryId: row.memoryId, knowledgeId: row.knowledgeId, expectedBaseVersion: row.version,
        kind: after === null ? 'tombstone' as const : 'replace' as const, before: row.content, after, evidenceIds: row.evidenceIds })];
    }));
  }
  async view(identity: Identity, requestedScope: Scope, branchId: string): Promise<{
    branch: ExperimentBranch; records: readonly ExperimentViewRecord[]; diff: readonly ExperimentDiff[];
  }> {
    return this.#run(async () => {
      const scope = parseScope(requestedScope);
      const owner = await this.#authorize(identity, scope, false);
      experimentId(branchId);
      if (await this.#authorize(identity, scope, false) !== owner) { throw new AuthorityError('forbidden'); }
      const branch = this.#get(branchId, scope, owner);
      const records = Object.freeze(branch.base!.records.flatMap(row => {
        const content = branch.overlay.has(row.memoryId) ? branch.overlay.get(row.memoryId)! : row.content;
        const { version, ...base } = row;
        return content === null ? [] : [Object.freeze({ ...base, content, baseVersion: version, experimentOnly: true as const })];
      }));
      return Object.freeze({ branch: branch.meta, records, diff: this.#diff(branch) });
    });
  }
  async #currentBase(identity: Identity, scope: Scope, branch: Branch): Promise<void> {
    let raw: unknown;
    try { raw = await this.#options.readSnapshot(identity, scope, branch.meta.snapshotId); } catch { throw new ExperimentError('unavailable'); }
    const current = parseSnapshot(raw, scope);
    if (snapshotDigest(current) !== branch.meta.baseDigest) {
      this.#purge(branch, 'quarantined'); throw new ExperimentError('conflict');
    }
  }
  async candidate(identity: Identity, requestedScope: Scope, input: unknown): Promise<ProposalCandidate> {
    return this.#run(async () => {
      const scope = parseScope(requestedScope);
      const owner = await this.#authorize(identity, scope, true);
      const request = exactObject(input, ['branchId', 'expectedRevision', 'operationKey', 'memoryIds', 'rationale']);
      const branch = this.#get(experimentId(request.branchId), scope, owner);
      const key = experimentId(request.operationKey);
      const rationale = boundedText(request.rationale, 4000);
      if (!Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0 ||
          !Array.isArray(request.memoryIds) || request.memoryIds.length < 1 || request.memoryIds.length > 16) { throw new ExperimentError('invalid'); }
      const ids = boundedArray(request.memoryIds, 1, 16).map(memoryId).sort();
      if (new Set(ids).size !== ids.length) { throw new ExperimentError('invalid'); }
      if (request.expectedRevision !== branch.meta.revision || branch.keys.has(key)) { throw new ExperimentError('conflict'); }
      if (branch.keys.size >= experimentLimits.operations) { throw new ExperimentError('quota'); }
      const changes = Object.freeze(this.#diff(branch).filter(change => ids.includes(change.memoryId)));
      if (changes.length !== ids.length) { throw new ExperimentError('not_found'); }
      const evidenceIds = Object.freeze([...new Set(changes.flatMap(change => change.evidenceIds))].sort());
      if (evidenceIds.length > 31) { throw new ExperimentError('quota'); }
      await this.#currentBase(identity, scope, branch);
      if (await this.#authorize(identity, scope, true) !== owner) { throw new AuthorityError('forbidden'); }
      this.#get(branch.meta.branchId, scope, owner);
      const body = { schema: 'memory-experiment-proposal-v1' as const, status: 'requires_curator_review' as const,
        canonicalMutation: false as const, branchId: branch.meta.branchId, scope, producerId: owner,
        baseDigest: branch.meta.baseDigest, snapshotId: branch.meta.snapshotId, revision: branch.meta.revision + 1,
        expiresAt: branch.meta.expiresAt, changes, evidenceIds, rationale };
      const candidate: ProposalCandidate = Object.freeze({ ...body, candidateDigest: jsonDigest(body) });
      branch.keys.add(key); branch.meta = Object.freeze({ ...branch.meta, revision: body.revision });
      branch.candidate = candidate;
      return candidate;
    });
  }
  /** Authenticity/freshness check inside the issuing process only. Never approval or submission. */
  async verifyCandidate(identity: Identity, requestedScope: Scope, input: unknown): Promise<true> {
    await this.verifiedCandidate(identity, requestedScope, input);
    return true;
  }
  /** Returns the frozen issued object, never caller-owned references after asynchronous checks. */
  async verifiedCandidate(identity: Identity, requestedScope: Scope, input: unknown): Promise<ProposalCandidate> {
    return this.#run(async () => {
      const scope = parseScope(requestedScope);
      const owner = await this.#authorize(identity, scope, true);
      const value = exactObject(input, ['schema', 'status', 'canonicalMutation', 'branchId', 'scope', 'producerId',
        'baseDigest', 'snapshotId', 'revision', 'expiresAt', 'changes', 'evidenceIds', 'rationale', 'candidateDigest']);
      const branch = this.#get(experimentId(value.branchId), scope, owner);
      if (!branch.candidate || branch.candidate.revision !== branch.meta.revision ||
          jsonDigest(value) !== jsonDigest(branch.candidate)) { throw new ExperimentError('conflict'); }
      await this.#currentBase(identity, scope, branch);
      if (await this.#authorize(identity, scope, true) !== owner) { throw new AuthorityError('forbidden'); }
      this.#get(branch.meta.branchId, scope, owner);
      return branch.candidate;
    });
  }
  async execute(identity: Identity, requestedScope: Scope, input: unknown): Promise<ExperimentResult> {
    return this.#run(async () => {
      const scope = parseScope(requestedScope);
      const owner = await this.#authorize(identity, scope, true);
      // Inspect only a data descriptor before strict parsing; accessor/prototype objects never execute.
      const kind = input && typeof input === 'object' ? Object.getOwnPropertyDescriptor(input, 'kind')?.value : undefined;
      const extras: Record<string, readonly string[]> = { put: ['memoryId', 'content'], tombstone: ['memoryId'],
        checkpoint: [], rollback: ['checkpointId'], fork: ['ttlMs'], quarantine: [], dispose: [] };
      if (typeof kind !== 'string' || !Object.hasOwn(extras, kind)) { throw new ExperimentError('invalid'); }
      const request = exactObject(input, ['kind', 'branchId', 'expectedRevision', 'operationKey', ...extras[kind]!]);
      const id = experimentId(request.branchId); const key = experimentId(request.operationKey);
      if (!Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0) { throw new ExperimentError('invalid'); }
      if (await this.#authorize(identity, scope, true) !== owner) { throw new AuthorityError('forbidden'); }
      const branch = this.#get(id, scope, owner);
      if (branch.meta.revision !== request.expectedRevision || branch.keys.has(key)) { throw new ExperimentError('conflict'); }
      if (branch.keys.size >= experimentLimits.operations && kind !== 'dispose' && kind !== 'quarantine') { throw new ExperimentError('quota'); }
      let checkpointId: string | undefined;
      let child: Branch | undefined;
      if (kind === 'put' || kind === 'tombstone') {
        const target = memoryId(request.memoryId);
        if (!branch.base!.records.some(r => r.memoryId === target)) { throw new ExperimentError('not_found'); }
        const next = new Map(branch.overlay);
        next.set(target, kind === 'put' ? boundedText(request.content, experimentLimits.contentBytes) : null);
        if (Buffer.byteLength(JSON.stringify([...next])) > experimentLimits.bytes) { throw new ExperimentError('quota'); }
        branch.overlay = next;
      } else if (kind === 'checkpoint') {
        if (branch.checkpoints.size >= experimentLimits.checkpoints) { throw new ExperimentError('quota'); }
        checkpointId = randomUUID(); branch.checkpoints.set(checkpointId, new Map(branch.overlay));
      } else if (kind === 'rollback') {
        const checkpoint = branch.checkpoints.get(experimentId(request.checkpointId));
        if (!checkpoint) { throw new ExperimentError('not_found'); }
        branch.overlay = new Map(checkpoint);
      } else if (kind === 'fork') {
        const duration = ttl(request.ttlMs);
        child = this.#allocate(branch.base!, owner, Math.min(branch.meta.expiresAt, this.#time() + duration), branch);
      }
      branch.keys.add(key); branch.candidate = null; branch.meta = Object.freeze({ ...branch.meta, revision: branch.meta.revision + 1 });
      if (kind === 'dispose' || kind === 'quarantine') { this.#purge(branch, kind === 'dispose' ? 'disposed' : 'quarantined'); }
      if (checkpointId) { return { kind: 'checkpoint', branch: branch.meta, checkpointId }; }
      if (child) { return { kind: 'fork', branch: child.meta }; }
      return { kind: 'updated', branch: branch.meta };
    });
  }
}
