import {test,expect} from 'bun:test';
import {waitForRecoveryReady} from '../src/recovery-readiness.ts';

test('recovery readiness permits more than sixty fast refusals inside its wall-clock budget',async()=>{
 let attempts=0;await waitForRecoveryReady(async()=>{if(++attempts<=61){throw new Error('connection_refused');}});expect(attempts).toBe(62);
},10000);
test('recovery readiness expires with sanitized failure and stops retrying',async()=>{
 let attempts=0;const started=performance.now();await expect(waitForRecoveryReady(async()=>{attempts++;throw new Error('private connection detail');},30)).rejects.toThrow('recovery_startup_failed');const finished=attempts;await Bun.sleep(150);expect(attempts).toBe(finished);expect(performance.now()-started).toBeLessThan(1000);
});
test('recovery readiness aborts a hung probe and never accepts its late success',async()=>{
 let release!:()=>void,aborted=false,attempts=0;const result=waitForRecoveryReady(async signal=>{attempts++;signal.addEventListener('abort',()=>{aborted=true;},{once:true});await new Promise<void>(resolve=>{release=resolve;});},30);
 await expect(result).rejects.toThrow('recovery_startup_failed');expect(aborted).toBe(true);release();await Bun.sleep(150);expect(attempts).toBe(1);
});
test('recovery readiness rejects invalid budgets before invoking a probe',async()=>{
 let calls=0;for(const budget of [0,-1,30001,NaN,Infinity,1.5]){await expect(waitForRecoveryReady(async()=>{calls++;},budget)).rejects.toThrow('recovery_invalid');}expect(calls).toBe(0);
});
