import { randomBytes, randomUUID } from 'node:crypto';
import { SQL } from 'bun';

// No production URL fallback. This lane owns exactly one fresh container.
if (process.argv.length !== 2) { throw new Error('DB lane accepts no selection overrides'); }
const stop = '/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026/STOP';
if (await Bun.file(stop).exists()) { throw new Error('Direct-build STOP present'); }
const name = `allura-direct-test-${randomUUID()}`;
const image = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const password = randomBytes(32).toString('hex');
function docker(args: string[]): string {
  const result = Bun.spawnSync(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) { throw new Error(`Disposable Docker operation failed: ${args[0]}`); }
  return result.stdout.toString().trim();
}
let created = false;
try {
  docker(['run', '--detach', '--name', name, '--label', 'allura.task=direct-build-20261026', '--publish', '127.0.0.1::5432', '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=allura_test', '--tmpfs', '/var/lib/postgresql/data', image]);
  created = true;
  const binding = docker(['port', name, '5432/tcp']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) { throw new Error('Unexpected non-loopback binding'); }
  const url = `postgres://postgres:${password}@${binding}/allura_test`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = Bun.spawnSync(['docker', 'exec', name, 'pg_isready', '-U', 'postgres', '-d', 'allura_test'], { stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode === 0) { ready = true; break; }
    await Bun.sleep(250);
  }
  if (!ready) { throw new Error('Disposable PostgreSQL readiness exhausted'); }
  let server: string | undefined;
  for (let attempt = 0; attempt < 40 && !server; attempt++) {
    const probe = new SQL(url, { connectionTimeout: 1 });
    try { const [version] = await probe`SELECT version()`; server = version.version as string; }
    catch { await Bun.sleep(250); }
    finally { await probe.close(); }
  }
  if (!server) { throw new Error('Disposable TCP readiness exhausted'); }
  console.log(JSON.stringify({ image, server, target: 'isolated-loopback-disposable', container: name }));
  const result = Bun.spawnSync([process.execPath, 'test', './tests/persistence.test.ts', './tests/access.test.ts', './tests/capture.test.ts', './tests/proposals.test.ts', './tests/decisions.test.ts', './tests/decision-atomic.test.ts', './tests/corrections.test.ts', './tests/lifecycle.test.ts', './tests/restoration.test.ts', './tests/indexing.test.ts', './tests/retrieval.test.ts', './tests/federation.test.ts', './tests/retrieval-evaluation.test.ts', './tests/operations.test.ts', './tests/consumer-http.test.ts', './tests/consumer-pack.test.ts', './tests/recovery.test.ts', './tests/core-release.test.ts', './tests/device-authority.test.ts', './tests/devices.test.ts', './tests/device-http.test.ts', './tests/device-client.test.ts'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ALLURA_DISPOSABLE_DB: 'owned-test-container', ALLURA_DISPOSABLE_DB_URL: url, NO_COLOR: '1', FORCE_COLOR: '0' }, timeout: 360000 });
  const output = result.stderr.toString();
  process.stdout.write(result.stdout); process.stderr.write(output);
  const pass = Number(output.match(/\b(\d+) pass\b/)?.[1] ?? 0);
  const fail = Number(output.match(/\b(\d+) fail\b/)?.[1] ?? 0);
  const skip = Number(output.match(/\b(\d+) skip\b/)?.[1] ?? 0);
  const assertions = Number(output.match(/\b(\d+) expect\(\) calls\b/)?.[1] ?? 0);
  const required = [
    'persistent device reconciles lost responses using actual secure store HTTP and MCP',
    'real device HTTP enrollment enforces human CSRF scope proof and current MCP revocation',
    'device expiry requires human reauthentication and duplicate tokens cannot create partial authority',
    'device deferred commit failure and preaborted commands leave no authority or receipts',
    'device enrollment needs explicit current admin approval and proof then returns secret free replay receipts',
    'device enrollment rejects foreign owners expired proofs stale approvers and machine callers',
    'device rotation revocation and replay never reactivate an old credential generation',
    'device concurrent exchanges rotations and enrollment cap have one bounded durable outcome',
    'device audit failure rolls back exchange and rotation without credential leaks',
    'device current authority intersects owner role and never gains human or admin powers',
    'device owner binding membership grant and current generation fail closed on reused identity',
    'device linkage and baseline helpers are private and RLS sees owner attenuation',
    'device transaction locks owner authority until completion then revocation denies',
    'migration is repeatable and checksum drift fails',
    'restricted login is not owner superuser or RLS bypass',
    'authorized append persists exact actor and scoped evidence',
    'RLS denies missing foreign malformed and spoofed contexts',
    'events reject update delete truncate even accidental owner writes',
    'rollback leaves no partial events and reused pool clears scope',
    'current revocation membership lock binding and role are enforced',
    'concurrent revocation waits for transaction then denies next use',
    'database machine binding revocation and ceilings remain current',
    'real HTTP evidence read enforces database scope and revocation',
    'creation atomically records explicit admin and requires nominee consent',
    'access HTTP authenticates before input and supports a grantless request lifecycle',
    'service creation requires current explicit ceiling and consenting active human',
    'grants require current independent workspace admin and exact revision',
    'invitations grant nothing until acceptance and recheck inviter authority',
    'access requests support narrower approval privacy and terminal notification',
    'last administrator transfer activates consenting successor atomically',
    'orphan recovery requires different nominee consent and one concurrent winner',
    'organization projection is allowlisted and contains no content or request rationale',
    'audit failure rolls back grant and untrusted identity or locked scope denies',
    'invitation expiry withdrawal cancellation and concurrent revisions fail safely',
    'stale requests and malformed inputs never overwrite grants',
    'capture canonicalization preserves content and normalizes only declared defaults',
    'concurrent capture creates one atomic record set and byte exact replay',
    'capture conflicts and denied scope create no durable effects',
    'operation key is actor scoped and unknown acknowledgement reconciles',
    'capture rollback at every durable boundary and commit leaves no partial set',
    'capture artifacts are immutable restricted and independent of providers',
    'terminated capture connection rolls back and same key safely retries',
    'proposal generation links exact evidence and high score remains pending',
    'proposal authority rejects spoofed actors unknown modes and inaccessible evidence',
    'curator sees only linked proposal evidence and viewers cannot read pending content',
    'proposal revisions are immutable and concurrent expected version has one winner',
    'proposal audit failure atomically rolls back state versions links and event',
    'independent human approval creates exact immutable semantic content and receipt',
    'human decision denies machine role-only self source-author and forged identity',
    'stale human decision and foreign evidence cause zero writes',
    'request evidence stays pending and immutable replay survives newer version',
    'real human review HTTP enforces identity CSRF exact version and error privacy',
    'decision faults at every durable boundary and commit preserve full rollback',
    'concurrent decision replay and independent competing reviewers have one atomic winner',
    'terminated approval connection leaves no partial state and same key can recover',
    'lost HTTP approval response reconciles without repeating semantic mutation',
    'correction submission is pending retry safe and never directly replaces the head',
    'correction approval appends immutable version and lineage with one current head',
    'competing corrections require explicit refresh and new human reviewed version',
    'correction denies foreign base invalid version and unauthorised actor without writes',
    'supersedes failure rolls back new semantic receipt intent and head change',
    'correction submission receipt failure rolls back evidence proposal and base binding',
    'real correction HTTP exposes exact base for fresh independent review',
    'governed deletion is replay safe while immutable history remains visible',
    'lifecycle authority foreign identifiers and stale heads fail without mutation',
    'lifecycle receipt failure rolls back tombstone event and head state',
    'exact text duplicate approvals preserve provenance and append scoped equivalence',
    'concurrent first duplicate roots and delete retries serialize without double effects',
    'real foreign semantic ids never leak through delete restore history or equivalence',
    'restoration copies exact history into pending proposal with current permission and replay',
    'independent restoration appends new version and preserves deletion and supersedes',
    'competing restoration exact head revision has one winner and no stale resurrection',
    'restoration hidden source machine approval and revoked authority never change head',
    'restoration late decision failure rolls back head version lineage and receipt',
    'restore historical ancestor creates fresh lineage and rejects original producer approval',
    'real HTTP deletion history restoration and review preserve current authority',
    'real pinned offline model produces normalized vectors and native semantic retrieval',
    'index current scope and raw source entitlement deny before provider work',
    'index replay validates model identity and vector failure never reports ready',
    'embedding failure uses equivalent scoped lexical fallback with truthful stores',
    'index lease fencing concurrency retries and batch drain persist actual vectors',
    'index revocation after embedding cannot publish and search rechecks lifecycle',
    'indexed foreign workspace sentinel is excluded from native and fallback paths',
    'semantic get and list distinguish current history and inaccessible identifiers',
    'signed pagination binds principal scope filters and rejects malformed cursors',
    'graph authorizes both endpoints and raw provenance independently',
    'real retrieval HTTP provides signed authorized reuse and no-store graph responses',
    'history search labels stale knowledge while read audits never store content',
    'foreign tenant and workspace graph metadata and cursors remain isolated',
    'real full semantic and native batches retain unindexed exact fresh evidence',
    'live indexed evidence preserves cosine score and explicit unknown confidence semantics',
    'federation reports real path failures without presenting raw fallback as native readiness',
    'federation rechecks current lifecycle and denies authority before fallback',
    'real federation HTTP labels fresh evidence and rejects selector overrides',
    'fresh evidence native and fallback paths isolate actual foreign indexed scopes',
    'federation timeouts preserve fallback and grant changes serialize with retrieval',
    'bounded source selection preserves trimmed Unicode exact evidence priority',
    'versioned live retrieval evaluation reports mode labeled quality latency freshness and isolation',
    'evaluation metrics distinguish ranking from no answer and reject empty telemetry',
    'fixed additional paraphrases and no answer probes exercise measured vector policy',
    'evaluation reports injected provider timeout and fallback separately from healthy latency',
    'scoped health probes real providers and reports durable pending then indexed freshness',
    'health and observation reads deny org viewer foreign locked and revoked contexts before probes',
    'operational observations are append only scoped redacted and honestly label fallback',
    'health HTTP reports provider failure and unknown timeout without exposing secrets',
    'promotion observations require committed independent decisions and disappear on rollback',
    'saturated provider admission reports unknown readiness without invoking a probe',
    'real MCP initialization and five tools preserve capture replay independent approval and second session reuse',
    'MCP boundary rejects authority overrides foreign scope and alternate REST capture',
    'clean packed SDK declarations Node and Bun clients execute real receipt replay without source imports',
    'packed CLI and actual stdio MCP client share governed remote contracts and redact credentials',
    'packed second principal reuses approved record and exact revision deletion honors current grants',
    'MCP schemas reject null enum values and array coercion without invoking alternate semantics',
    'composed gateway shares admission across MCP and API and cancels stalled bodies',
    'consumer packing preserves existing artifacts in caller supplied directories',
    'packed CLI and stdio reject oversized frames with no protocol or credential spill',
    'recovery targets reject forged capabilities and preserve data through actual database restart',
    'one streaming backup exceeds old buffer limits and two same-day manifests restore exact chosen evidence',
    'restore hashes actual archive and rejects missing corrupt traversal and incompatible evidence before target writes',
    'backup deadline removes partial output and emits no successful manifest',
    'restore refuses pre-existing foreign schema without adding restored data',
    'concurrent restore admits one writer and mutated owned resource bounds deny before operations',
    'clean packed core initializes without seed knowledge and survives real server and database restarts',
    'packed core refuses occupied initialization elevated runtime roles and missing offline model',
    'packed core refuses tampered source before database work and never prints injected credentials',
    'packed recovery backs up and restores without a source checkout or git provenance fallback',
    'packed DOC-J01 through DOC-J06 journey preserves review atomicity replay provenance and current retrieval',
    'index cancellation avoids pre-aborted claims and never publishes late provider success',
  ];
  const missing = required.filter(name => !output.includes(`(pass) ${name} [`));
  console.log(JSON.stringify({ lane: 'restricted-postgres', pass, fail, skip, assertions, missing, exit: result.exitCode }));
  if (result.exitCode !== 0 || pass < required.length || fail || skip || assertions < 40 || missing.length) { throw new Error('Required non-owner database lane failed'); }
} finally {
  if (created) {
    docker(['rm', '--force', name]);
    const remaining = docker(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']);
    if (remaining) { throw new Error('Owned disposable container cleanup unverified'); }
    console.log(`Verified removed owned container ${name}`);
  }
}
