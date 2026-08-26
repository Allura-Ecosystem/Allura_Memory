#!/usr/bin/env bun
import { runProposalSemanticProjectionJob } from "../src/lib/memory/proposal-semantic-projection";
import { closePool } from "../src/lib/postgres/connection";

function value(name:string){ const prefix=`--${name}=`; return process.argv.slice(2).find((arg)=>arg.startsWith(prefix))?.slice(prefix.length); }
const tenantId=value("group-id"), workspaceId=value("workspace-id"), proposalId=value("proposal-id");
const principalId=value("principal-id") ?? "semantic-projection-worker";
if(!tenantId||!workspaceId||!proposalId) throw new Error("--group-id, --workspace-id, and --proposal-id are required");
try {
  const result=await runProposalSemanticProjectionJob({tenantId,workspaceId,principalId},proposalId);
  console.log(JSON.stringify({source_id:result.sourceId,build_state:result.buildState,content_hash:result.contentHash}));
} finally { await closePool(); }
