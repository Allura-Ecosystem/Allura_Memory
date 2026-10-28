import {test,expect} from 'bun:test';
import {collectRecoveryDiagnostic,RecoveryProcessError} from '../src/recovery-diagnostics.ts';
const stream=(parts:string[])=>new ReadableStream<Uint8Array>({start(c){for(const part of parts){c.enqueue(new TextEncoder().encode(part));}c.close();}});
test('recovery diagnostic bounds retained stderr and exposes only allowlisted hints',async()=>{
 const secret='synthetic-private-payload-never-log',text='pg_restore: error: could not read from input file: end of file\n'+secret;
 const d=await collectRecoveryDiagnostic(stream([text,'x'.repeat(1000000)]));expect(d.hint).toBe('archive');expect(d.bytes).toBe(new TextEncoder().encode(text).length+1000000);expect(d.retainedBytes).toBe(8192);expect(d.readFailed).toBe(false);expect(JSON.stringify(d)).not.toContain(secret);
 for(const [input,hint] of [['permission denied','permission'],['No space left on device','resource'],['connection to server failed','connection'],['unknown SQL private value','unknown']] as const){const row=await collectRecoveryDiagnostic(stream([input]));expect(row.hint).toBe(hint);expect(JSON.stringify(row)).not.toContain(input);}
});
test('recovery process diagnostics distinguish exit signal and stream failure without guessing cause',async()=>{
 const d=await collectRecoveryDiagnostic(stream(['synthetic secret']));
 const timeout=new RecoveryProcessError('restore',124,null,60001,d);expect(timeout.message).toBe('recovery_restore_failed');expect(timeout.diagnostic.termination).toBe('timeout_exit');expect(timeout.diagnostic.stderr.hint).toBe('unknown');
 const killed=new RecoveryProcessError('dump',137,'SIGKILL',20,d);expect(killed.message).toBe('recovery_dump_failed');expect(killed.diagnostic.termination).toBe('signal');expect(killed.diagnostic.signal).toBe('SIGKILL');expect(JSON.stringify(killed)).not.toContain('synthetic secret');
 const broken=await collectRecoveryDiagnostic(new ReadableStream({start(c){c.error(new Error('private connection credentials'));}}));expect(broken.readFailed).toBe(true);expect(broken.hint).toBe('unknown');expect(JSON.stringify(broken)).not.toContain('private');expect(Object.isFrozen(killed.diagnostic)).toBe(true);
 expect(new RecoveryProcessError('restore',0,null,1,broken).diagnostic.termination).toBe('stream_failure');expect(new RecoveryProcessError('dump',0,null,1,d).diagnostic.termination).toBe('empty_output');
});
