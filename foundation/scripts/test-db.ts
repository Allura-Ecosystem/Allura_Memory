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
  const result = Bun.spawnSync([process.execPath, 'test', './tests/persistence.test.ts', './tests/access.test.ts', './tests/capture.test.ts', './tests/proposals.test.ts', './tests/decisions.test.ts'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ALLURA_DISPOSABLE_DB: 'owned-test-container', ALLURA_DISPOSABLE_DB_URL: url, NO_COLOR: '1', FORCE_COLOR: '0' }, timeout: 90000 });
  const output = result.stderr.toString();
  process.stdout.write(result.stdout); process.stderr.write(output);
  const pass = Number(output.match(/\b(\d+) pass\b/)?.[1] ?? 0);
  const fail = Number(output.match(/\b(\d+) fail\b/)?.[1] ?? 0);
  const skip = Number(output.match(/\b(\d+) skip\b/)?.[1] ?? 0);
  const assertions = Number(output.match(/\b(\d+) expect\(\) calls\b/)?.[1] ?? 0);
  const required = [
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
