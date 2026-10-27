import {test,expect} from 'bun:test';
import {createWorkBudget,WorkBudgetError} from '../src/work-budget.ts';
test('work budget admits lazily and retains timed out slots until real settlement',async()=>{
 const budget=createWorkBudget({capacity:1,timeoutMs:20});let finish!:(value:number)=>void,calls=0;
 const first=budget.run(async()=>{calls++;return new Promise<number>(resolve=>{finish=resolve;});});
 await expect(first).rejects.toMatchObject({code:'timeout',outcome:'unknown',started:true});expect(budget.snapshot()).toMatchObject({active:1,unsettledAfterDeadline:1});
 await expect(budget.run(async()=>{calls++;return 2;})).rejects.toMatchObject({code:'busy',started:false});expect(calls).toBe(1);
 finish(1);await Bun.sleep(1);expect(budget.snapshot().active).toBe(0);expect(await budget.run(async()=>3)).toBe(3);expect(budget.snapshot().active).toBe(0);
});
test('work budget cancellation never starts pre-aborted work and signals admitted work',async()=>{
 const budget=createWorkBudget({capacity:1,timeoutMs:100}),before=new AbortController();before.abort();let calls=0;
 await expect(budget.run(async()=>{calls++;return 1;},before.signal)).rejects.toMatchObject({code:'cancelled',started:false});expect(calls).toBe(0);
 const controller=new AbortController();let observed=false;
 const result=budget.run(async signal=>new Promise<number>((_,reject)=>{signal.addEventListener('abort',()=>{observed=true;reject(signal.reason);},{once:true});}),controller.signal);
 controller.abort();await expect(result).rejects.toMatchObject({code:'cancelled',outcome:'unknown'});await Bun.sleep(1);expect(observed).toBe(true);expect(budget.snapshot().active).toBe(0);
});
test('work budget validates finite ceilings and accounts for synchronous rejection',async()=>{
 for(const limits of [{capacity:0,timeoutMs:20},{capacity:9,timeoutMs:20},{capacity:1,timeoutMs:2001},{capacity:1,timeoutMs:NaN}]){expect(()=>createWorkBudget(limits)).toThrow('invalid');}
 const budget=createWorkBudget({capacity:1,timeoutMs:20});await expect(budget.run(()=>{throw new Error('failure');})).rejects.toThrow('failure');expect(budget.snapshot().active).toBe(0);expect(new WorkBudgetError('busy',false).outcome).toBe('failed');
});
