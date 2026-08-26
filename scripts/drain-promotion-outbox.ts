#!/usr/bin/env bun
import { drainPromotionOutbox } from "../src/lib/memory/promotion-outbox-worker";
import { closePool, getOwnerPool } from "../src/lib/postgres/connection";

const once=process.argv.includes("--once");
const intervalArg=process.argv.find((arg)=>arg.startsWith("--interval="));
const interval=Number(intervalArg?.split("=")[1] ?? 30000);
try {
  do {
    console.log(JSON.stringify(await drainPromotionOutbox(getOwnerPool())));
    if(once) break;
    await new Promise((resolve)=>setTimeout(resolve,interval));
  } while(true);
} finally { await closePool(); }
