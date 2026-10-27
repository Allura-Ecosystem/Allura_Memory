// Bun 1.3.14 exits zero for empty test files: verify execution, not just exit.
const suites = [{ requiredFile: './tests/transform-text.test.ts', minAssertions: 19, requiredCases: [
  'trims valid text and transforms it exactly once',
  'rejects invalid input before invoking the transform',
  'propagates the original transform error without retry',
] }, { requiredFile: './tests/authority.test.ts', minAssertions: 75, requiredCases: [
  'signed human resolves stable principal and exact workspace action',
  'invalid signed identity is rejected before authority work',
  'current membership grant lock and tenant checks fail closed',
  'roles do not confer implicit review or cross-workspace privileges',
  'machine credentials remain separate and action ceilings apply',
  'forged in-process identity cannot mint authority',
  'human mutations require same-origin and login targets stay local',
] }, { requiredFile: './tests/gateway.test.ts', minAssertions: 29, requiredCases: [
  'gateway authenticates before body and never trusts forged headers',
  'gateway bounds streamed body rejects malformed JSON and cross-site',
  'gateway rechecks revocation before disclosure and redacts service errors',
  'post-commit revocation returns unknown rather than a false no-write denial',
  'gateway retains admission while timed-out work is unresolved',
  'gateway machine route cannot consume browser identity',
  'chunked and stalled streams are cancelled within finite budgets',
  'real loopback HTTP preserves authenticated scope and coarse liveness',
] }, {requiredFile:'./tests/retrieval-policy.test.ts',minAssertions:27,requiredCases:[
  'all-mode finite limits normalize before retrieval',
  'full semantic and vector batches never evict exact fresh evidence by confidence',
  'same-ID metadata enrichment preserves vector score and latest durable metadata',
  'explicit confidence filtering occurs before enrichment and never invents confidence',
] }, {requiredFile:'./tests/work-budget.test.ts',minAssertions:18,requiredCases:[
  'work budget admits lazily and retains timed out slots until real settlement',
  'work budget cancellation never starts pre-aborted work and signals admitted work',
  'work budget validates finite ceilings and accounts for synchronous rejection',
] }, {requiredFile:'./tests/consumer-client.test.ts',minAssertions:17,requiredCases:[
  'consumer rejects insecure redirected credential-bearing and malformed endpoint configuration',
  'consumer bounds stalled credentials and oversized replies with redacted errors',
  'consumer never follows redirects or retries an ambiguous request',
  'consumer abort cancels actual stalled HTTP response without retry or credential output',
] }, {requiredFile:'./tests/ci-contract.test.ts',minAssertions:30,requiredCases:[
  'CI rejects malformed or mismatched source and dirty checkouts',
  'CI accepts only complete same-source same-attempt successful nonzero lanes',
  'CI test summaries require exact unit discovery and reject failure skip duplicates and empty assertions',
] }, {requiredFile:'./tests/core-config.test.ts',minAssertions:18,requiredCases:[
  'core configuration binds loopback restricted login explicit origin and public RSA keys',
  'core configuration rejects missing secrets owner credentials remote databases and silent defaults',
] }, {requiredFile:'./tests/recovery-readiness.test.ts',minAssertions:14,requiredCases:[
  'recovery readiness permits more than sixty fast refusals inside its wall-clock budget',
  'recovery readiness expires with sanitized failure and stops retrying',
  'recovery readiness aborts a hung probe and never accepts its late success',
  'recovery readiness rejects invalid budgets before invoking a probe',
] }, {requiredFile:'./tests/device-contract.test.ts',minAssertions:100,requiredCases:[
 'device commands preserve bounded typed immutable snapshots',
 'device contract denies authority injection and privileged action ceilings',
 'device contract rejects malformed identifiers versions labels and keys',
 'device proofs require canonical independent 256 bit secrets without error disclosure',
] },{requiredFile:'./tests/device-secret-store.test.ts',minAssertions:20,requiredCases:[
 'real isolated Linux Secret Service persists scoped secrets without plaintext fallback',
 'real store serializes same profile mutations and releases its lock on process death',
]}];
if (process.argv.length !== 2) {
  throw new Error('The required test lane does not accept selection overrides');
}
for (const { requiredFile, requiredCases, minAssertions } of suites) {
if (!(await Bun.file(requiredFile).exists())) {
  throw new Error(`Required test file missing: ${requiredFile}`);
}
const result = Bun.spawnSync([process.execPath, 'test', requiredFile], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
});
const stdout = result.stdout.toString();
const stderr = result.stderr.toString();
process.stdout.write(stdout);
process.stderr.write(stderr);
const pass = Number(stderr.match(/\b(\d+) pass\b/)?.[1] ?? 0);
const fail = Number(stderr.match(/\b(\d+) fail\b/)?.[1] ?? 0);
const skip = Number(stderr.match(/\b(\d+) skip\b/)?.[1] ?? 0);
const assertions = Number(stderr.match(/\b(\d+) expect\(\) calls\b/)?.[1] ?? 0);
const missingCases = requiredCases.filter((name) => !stderr.includes(`(pass) ${name} [`));
console.log(JSON.stringify({ requiredFile, requiredCases, missingCases, pass, fail, skip, assertions, runnerExit: result.exitCode }));
if (result.exitCode !== 0 || pass < requiredCases.length || fail !== 0 || skip !== 0 || assertions < minAssertions || missingCases.length > 0) {
  throw new Error(`Required test lane failed: ${requiredFile}; require all cases, assertion floor, no failures or skips`);
}
}
