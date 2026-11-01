import { SQL } from 'bun';
import { createPublicKey, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { unlink } from 'node:fs/promises';

// Owned test-only child. Receives synthetic identity/target over stdin; never
// emits credentials. No new production executor or authority is introduced.
const input = await Bun.stdin.json();
if (process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container' || new URL(input.url).hostname !== '127.0.0.1') { throw new Error('Requires owned disposable runner'); }
const root = input.sourceRoot ?? new URL('../src/', import.meta.url).pathname;
const auth = await import(pathToFileURL(root + '/authentication.ts').href) as typeof import('../src/authentication.ts');
const runs = await import(pathToFileURL(root + '/runs.ts').href) as typeof import('../src/runs.ts');
const persistence = await import(pathToFileURL(root + '/persistence.ts').href) as typeof import('../src/persistence.ts');
const contract = await import(pathToFileURL(root + '/run-contract.ts').href) as typeof import('../src/run-contract.ts');
const execution = await import(pathToFileURL(root + '/run-execution.ts').href) as typeof import('../src/run-execution.ts');
if (input.removeExecutor === true) {
  if (!input.sourceRoot || !root.startsWith(process.env.TMPDIR + '/allura-prepare-drift-')) { throw new Error('Owned drift export required'); }
  await unlink(root + '/run-execution.ts');
}
const identity = auth.authenticateHuman({ assertion: input.assertion }, { issuer: input.issuer, audience: 'fixture', keys: new Map([['key', createPublicKey(input.publicKey)]]) });
const sql = new SQL(input.url, { max: 1 });
try {
  if (input.mode === 'cancel') {
    const receipt = await runs.cancelRun(sql, identity, input.scope, input.command);
    console.log(JSON.stringify({ receipt }));
  } else if (input.mode === 'resume') {
    const receipt = await runs.resumeRun(sql, identity, input.scope, input.command);
    console.log(JSON.stringify({ receipt }));
    if (input.hold) { await Bun.sleep(30000); }
  } else if (input.mode === 'resume-admit' || input.mode === 'handoff-claim') {
    const receipt = await persistence.scopedTransaction(sql, identity, input.scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.resume_run(${input.scope.groupId},${input.scope.workspaceId}::uuid,${input.command}::jsonb,${await contract.runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
    let claim = null;
    if (input.mode === 'handoff-claim') {
      const op = JSON.parse(receipt);
      claim = await persistence.scopedTransaction(sql, identity, input.scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_handoff(${input.scope.groupId},${input.scope.workspaceId}::uuid,${op.runId}::uuid,${op.id}::uuid,${await contract.runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim);
    }
    console.log(JSON.stringify({ receipt, claim }));
    if (input.hold) { await Bun.sleep(30000); }
  } else if (input.mode === 'handoff-finish') {
    await execution.finishHandoff(sql, identity, input.scope, input.claim);
    console.log(JSON.stringify({ finished: true }));
  } else if (input.mode === 'decide') {
    const receipt = await runs.decideRun(sql, identity, input.scope, input.command);
    console.log(JSON.stringify({ receipt }));
    if (input.hold) { await Bun.sleep(30000); }
  } else if (input.mode === 'advance') {
    const receipt = await runs.advanceRun(sql, identity, input.scope, input.command);
    console.log(JSON.stringify({ receipt }));
    if (input.hold) { await Bun.sleep(30000); }
  } else if (input.mode === 'claim') {
    const result = await persistence.scopedTransaction(sql, identity, input.scope, 'workspace:grants:manage', async tx => {
      const definition = await contract.runDefinition();
      return (await tx`SELECT allura.claim_run_prepare(${input.scope.groupId},${input.scope.workspaceId}::uuid,${input.command}::jsonb,${definition}::jsonb,${randomUUID()}::uuid) AS result`)[0].result;
    });
    console.log(JSON.stringify(result));
    if (input.hold) { await Bun.sleep(30000); }
  } else if (input.mode === 'finish') {
    await execution.finishPreparation(sql, identity, input.scope, input.claim);
    console.log(JSON.stringify({ finished: true }));
  } else { throw new Error('invalid test mode'); }
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof contract.RunError ? error.code : 'unknown' }));
  process.exitCode = 1;
} finally { await sql.close(); }
