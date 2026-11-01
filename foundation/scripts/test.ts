import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBunReport } from '../src/test-runner.ts';
// Bun 1.3.14 exits zero for empty test files: verify execution, not just exit.
const suites = [{requiredFile:'./tests/run-contract.test.ts',minAssertions:72,requiredCases:[
 'run revision six admission preserves historical parser revisions',
 'run contract rejects authority policy and executable input overrides',
 'run start input preserves exact bounded UTF8 bytes and immutable copies',
 'run start definition pins owned source and fixed data only policy',
]},{requiredFile:'./tests/selected-consent-transport.test.ts',minAssertions:259,requiredCases:[
 'selected consent transport freezes exact display uses same origin and blocks duplicate decisions',
 'selected consent transport denies malformed scope context and display without disclosure or recovery',
 'selected consent transport bounds malformed oversized denied and lost responses with no retry',
 'selected consent transport aborts late display and decision responses after closure',
 'selected consent callback validation rejects arbitrary ambiguous and malformed destinations',
 'selected consent rejects every missing or wrongly typed frozen field and decision envelope',
 'selected consent timeout wins over abort ignoring fetch and duplicate display without late disclosure',
 'selected consent navigation accepts only one exact transaction and no fragment or extra field',
 'selected consent transport bounds stalled streams and never retries a consumed display',
]},{requiredFile:'./tests/oauth-consent-transport.test.ts',minAssertions:183,requiredCases:[
 'OAuth consent transport freezes exact display uses same origin and blocks duplicate decisions',
 'OAuth consent transport denies malformed scope context and display without disclosure or recovery',
 'OAuth consent transport bounds malformed oversized denied and lost responses with no retry',
 'OAuth consent transport aborts late display and decision responses after closure',
 'OAuth consent callback validation rejects arbitrary ambiguous and malformed destinations',
 'OAuth consent navigation accepts only one exact transaction and no fragment or extra field',
 'OAuth consent transport bounds verification and rejects late context after close',
 'OAuth consent transport bounds stalled streams and never retries a consumed display',
]},{requiredFile:'./tests/recovery-diagnostics.test.ts',minAssertions:23,requiredCases:[
 'recovery diagnostic bounds retained stderr and exposes only allowlisted hints',
 'recovery process diagnostics distinguish exit signal and stream failure without guessing cause',
]},{requiredFile:'./tests/memory-experiment.test.ts',minAssertions:130,requiredCases:[
 'experiment disposable lifecycle preserves base through checkpoints forks tombstones and rollback',
 'experiment exports only exact review required candidates and denies tamper stale bases and replay',
 'experiment rejects forged identities foreign owners and revoked current access',
 'experiment operation keys survive rollback and disposal and checkpoints cannot cross branches',
 'experiment expiry clips fork lifetime and idle expiry prevents resurrection',
 'experiment rejects malformed payloads without invoking accessors or changing revision',
 'experiment quarantines poisoned descendants and cleanup survives exhausted operation quota',
 'experiment caps branches checkpoints payload bytes and lifetime without partial effects',
 'experiment rechecks after async reads rejects concurrent admission and snapshots caller commands',
 'experiment quarantine reaches descendants through a disposed intermediate fork',
 'experiment views label hypothetical content without claiming a canonical version',
 'experiment compares fixed RAM Durham fixtures deterministically without self reward or promotion',
 'experiment fails closed on source failures late teardown and candidate shape poisoning',
 'experiment snapshot binds immutable scoped bytes and rejects authority injection',
]},{requiredFile:'./tests/memory-experiment-contract.test.ts',minAssertions:26,requiredCases:[
 'experiment contract preserves exact immutable scope version text and digest',
 'experiment contract rejects foreign duplicate malformed and authority bearing data',
 'experiment contract rejects accessors sparse arrays and finite budget excess',
]},{requiredFile:'./tests/bumblebee-wire.test.ts',minAssertions:77,requiredCases:[
 'Bumblebee wire validates the pinned upstream package golden identity',
 'Bumblebee wire accepts observed finding and summary shapes with exact identity parity',
 'Bumblebee wire rejects malformed unknown and malicious record data without echoes',
 'Bumblebee wire enforces bytes lines records nesting and duplicate JSON keys',
 'Bumblebee wire accepts exact total byte ceiling and rejects Unicode byte overflow',
 'Bumblebee wire uses Go UTF8 ordering for lifecycle identity fields',
]},{requiredFile:'./tests/bumblebee-ingestion.test.ts',minAssertions:235,requiredCases:[
 'Bumblebee ingestion prepares an empty complete population without claiming durable acceptance',
 'Bumblebee ingestion checks gateway authority and lease bindings before reading body',
 'Bumblebee ingestion rejects mixed runs duplicate IDs wrong population and incomplete streams',
 'Bumblebee ingestion preserves partial error late and stale evidence without retiring inventory',
 'Bumblebee ingestion computes scoped verified exposure and fixed simulated proposals from packages',
 'Bumblebee ingestion rejects unbound expired invalidated or foreign catalogs and fabricated findings',
 'Bumblebee ingestion distinguishes exact and conflicting replay and deduplicates across runs',
 'Bumblebee ingestion rechecks revocation and expiry and keeps transport uncertainty unknown',
 'Bumblebee ingestion preserves safe partial summary detail and rejects oversized correlation work',
 'Bumblebee ingestion defends snapshot drift replay revocation and key ownership',
 'Bumblebee ingestion uses server generation not scanner clocks for freshness ordering',
]},{requiredFile:'./tests/projection-contract.test.ts',minAssertions:88,requiredCases:[
 'projection destination parsing rejects authority injection and implicit remote targets',
 'projection digest binds exact scoped source destination revision and content without normalization',
 'projection read back verifies actual content and exact target rather than remote acknowledgement',
 'projection claim policy never rewrites ambiguous work or bypasses due authority and attempt ceilings',
]},{requiredFile:'./tests/bumblebee-contract.test.ts',minAssertions:140,requiredCases:[
 'Bumblebee source canonicalization preserves immutable bounded populations',
 'Bumblebee source rejects scope command schema drift and malformed inputs without disclosure',
 'Bumblebee lease commands and credential routes never cross audiences',
 'Bumblebee routine eligibility never retires inventory from incomplete or foreign populations',
 'Bumblebee data only modules fail independently without expanding capability',
]},{requiredFile:'./tests/dashboard-graph.test.ts',minAssertions:30,requiredCases:[
 'graph presentation rejects malformed duplicate dangling and unbounded source shapes',
 'graph filters and deterministic layout preserve visible endpoints and finite work',
]},{ requiredFile: './tests/transform-text.test.ts', minAssertions: 19, requiredCases: [
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
  'gateway strictly decodes raw UTF8 and preserves split multibyte replacement characters',
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
] }, {requiredFile:'./tests/consumer-client.test.ts',minAssertions:40,requiredCases:[
  'consumer keeps empty success structured errors and unknown tool transport distinct',
  'consumer advertised guidance identifies preview limits and exact typed readback without new tools',
  'consumer rejects insecure redirected credential-bearing and malformed endpoint configuration',
  'consumer bounds stalled credentials and oversized replies with redacted errors',
  'consumer never follows redirects or retries an ambiguous request',
  'consumer abort cancels actual stalled HTTP response without retry or credential output',
] }, {requiredFile:'./tests/ci-contract.test.ts',minAssertions:63,requiredCases:[
 'CI database aggregation ignores preflights and batch diagnostics and requires one final native aggregate',
  'CI rejects malformed or mismatched source and dirty checkouts',
  'CI accepts only complete same-source same-attempt successful nonzero lanes',
  'CI schedules model preparation before offline inference lanes',
  'CI strict runner includes embedding and agent drain suites with named cases and assertion floors',
  'CI test summaries require exact unit discovery and reject failure skip duplicates and empty assertions',
] }, {requiredFile:'./tests/core-config.test.ts',minAssertions:73,requiredCases:[
  'OAuth configuration explicitly binds a separate loopback issuer fixed public client and human consent origin',
  'OAuth configuration rejects ambiguous registration unsafe URLs and privilege fields without weakening human mode',
  'core configuration binds loopback restricted login explicit origin and public RSA keys',
  'core configuration rejects missing secrets owner credentials remote databases and silent defaults',
 ] }, {requiredFile:'./tests/machine-only.test.ts',minAssertions:60,requiredCases:[
 'explicit machine-only configuration needs no human credentials and permits only canonical numeric loopback origins',
 'machine-only transport matches its declared local origin and rejects explicit null mode',
 'assembled local runtime denies human API dashboard assets and MCP without touching database',
 'machine-only denies human routes before inspecting credentials or content',
 'real loopback machine-only HTTP preserves opaque token scope grant and revocation checks',
] }, {requiredFile:'./tests/openai-embedding.test.ts',minAssertions:60,requiredCases:[
 'model validation allows only the two complete distinct identities',
 'OpenAI rejects wrong model dimensions norm malformed numeric data and hostile HTTP without echoes',
 'OpenAI cancels actual stalled HTTP bodies and its own deadline with sanitized failures',
 'OpenAI has no credential or network fallback and the default factory keeps exact local MiniLM',
 'OpenAI uses the native pinned request and validates the response on real loopback HTTP',
 'OpenAI configuration is explicit strict and requires only the Allura key',
] }, {requiredFile:'./tests/embedding-identity.test.ts',minAssertions:57,requiredCases:[
 'index publishing and all retrieval paths bind the selected identity without default reinterpretation',
 'aborted embedding work never publishes a successful vector after late settlement',
 'append only migration widens only complete model contracts and preserves old function identities',
 'core startup selects the configured factory and advertises sanitized model identity',
] }, {requiredFile:'./tests/agent-index-drain.test.ts',minAssertions:88,requiredCases:[
 'agent drain accepts only one scoped candidate with current machine authority',
 'agent drain requires both credential actions and current grants before candidate work',
 'agent drain rejects invalid expired revoked mixed and foreign credentials',
 'agent drain rejects body overrides and leaves human routes disabled',
 'agent drain preserves empty and denied claims without embedding or promotion',
 'agent drain rechecks read authority before disclosing completed work',
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
]},{requiredFile:'./tests/dashboard-contract.test.ts',minAssertions:70,requiredCases:[
 'dashboard contract pins retained visual sources without granting preview authority',
 'dashboard navigation rejects malformed identifiers ambiguous targets and preview role injection',
 'dashboard outcomes never infer success from transport failure or pending work',
]},{requiredFile:'./tests/dashboard-transport.test.ts',minAssertions:36,requiredCases:[
 'dashboard transport never redirects retries or accepts secret-bearing foreign targets',
 'dashboard transport clears denied state aborts old scope and discards late replies',
 'dashboard transport bounds content timeout and request cardinality without leaking response bodies',
]},{requiredFile:'./tests/dashboard-view.test.ts',minAssertions:28,requiredCases:[
 'dashboard presentation binds current context and rejects malformed scope or response shapes',
 'dashboard search matches federated fields and honestly labels partial failed truncated responses',
]},{requiredFile:'./tests/test-runner.test.ts',minAssertions:1142,requiredCases:[
 'DB orchestration consolidates OAuth only after exact native coverage with nine unchanged preflights',
 'DB orchestration rejects each missing OAuth file and case including the deferred fault negative witness',
 'DB orchestration rejects OAuth native skips failures zero assertions exits and signals',
 'DB orchestration rejects malformed and misowned OAuth native reports and forged console coverage',
 'DB runner executes sequential native multisuite batches and emits one exact aggregate',
 'DB runner rejects unexpected and cross owned native cases despite complete required passes',
 'DB runner rejects omitted duplicate reordered batches files and manifest cases before execution',
 'DB runner rejects native case omission duplication skip failure zero assertions and nonzero exit',
 'DB runner refuses forged console passes and aggregate diagnostics without native ownership',
 'DB runner rejects missing truncated duplicate and misowned native reports and cleans scratch',
 'DB runner bounds real child timeout reaps it and prevents later batches with cleanup',
 'required runner accepts real Bun passes with optional timing at every exact floor',
 'required runner ignores captured timed and untimed console identities',
 'required runner rejects a positive below floor second suite despite surplus first suite assertions',
 'required runner accepts above floor assertions in every suite',
 'required runner rejects missing renamed and colliding required case names',
 'required runner rejects a missing file before launching that suite',
 'required runner rejects skipped cases even when all required names pass',
 'required runner rejects failed cases even when all required names pass',
 'required runner rejects nonzero child exit after all required cases pass',
 'required runner rejects empty files and zero assertion passes',
 'required runner preserves numeric suffixes and XML special names through native reports',
 'required runner rejects missing malformed ambiguous and unexpected native report structure',
 'required runner rejects malformed XML encoding and external declarations',
 'required runner bounds native report bytes before parsing and accepts the exact ceiling',
 'required runner counts only passed native cases and rejects duplicate identities',
 'required runner rejects non XML whitespace instead of normalizing malformed reports',
 'required runner refuses caller selection overrides before executing fixtures',
]}];
if (process.argv.length !== 2) {
  throw new Error('The required test lane does not accept selection overrides');
}
for (const { requiredFile, requiredCases, minAssertions } of suites) {
if (!(await Bun.file(requiredFile).exists())) {
  throw new Error(`Required test file missing: ${requiredFile}`);
}
const reportDirectory = await mkdtemp(join(tmpdir(), 'allura-bun-report-'));
const reportPath = join(reportDirectory, 'results.xml');
try {
const result = Bun.spawnSync([process.execPath, 'test', '--only-failures', '--reporter=junit', `--reporter-outfile=${reportPath}`, requiredFile], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
});
const stdout = result.stdout.toString();
const stderr = result.stderr.toString();
process.stdout.write(stdout);
process.stderr.write(stderr);
let report;
let invalidReport = false;
try { report = await readBunReport(reportPath, requiredFile); }
catch {
  invalidReport = true;
  report = { pass: 0, fail: 0, skip: 0, assertions: 0, passedCases: new Set<string>() };
}
const { pass, fail, skip, assertions, passedCases } = report;
const missingCases = requiredCases.filter((name) => !passedCases.has(name));
console.log(JSON.stringify({ requiredFile, requiredCases, missingCases, pass, fail, skip, assertions, runnerExit: result.exitCode }));
if (invalidReport) { throw new Error(`Required test lane failed: ${requiredFile}; invalid native report`); }
if (result.exitCode !== 0 || pass < requiredCases.length || fail !== 0 || skip !== 0 || assertions < minAssertions || missingCases.length > 0) {
  throw new Error(`Required test lane failed: ${requiredFile}; require all cases, assertion floor, no failures or skips`);
}
} finally { await rm(reportDirectory, { recursive: true, force: true }); }
}
