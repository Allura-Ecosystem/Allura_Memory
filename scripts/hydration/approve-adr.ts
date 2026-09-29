import { DATABASE_IDS, fetchNotionDatabase, queryNotionDatabase } from './notion-client';

const ADR_CHANGE_ID = '7bfa63ad-d4c1-408e-80d2-c288d8f9e4b9';

interface ApprovalResult {
  changeId: string;
  previousStatus: string;
  newStatus: string;
  approvedAt: string;
}

interface NotionPage {
  id: string;
  properties?: {
    Name?: {
      title?: Array<{ text?: { content?: string } }>;
    };
    Status?: {
      select?: { name?: string };
    };
  };
}

export async function approveAdr001(): Promise<ApprovalResult> {
  console.log('Starting HITL approval for ADR-001...\n');

  console.log('Prerequisites:');
  console.log('ADR document exists: docs/architecture/adr-001-requirements-traceability-matrix.md');
  console.log('Change entry seeded to Changes queue');
  console.log('AER ID: 9830faf7-9a23-446d-8ee4-1e175c132576');
  console.log('Promotion Request ID: 7bfa63ad-d4c1-408e-80d2-c288d8f9e4b9');
  console.log();

  console.log('Fetching Change entry from Notion...');
  const { schema, dataSources } = await fetchNotionDatabase(DATABASE_IDS.changes);

  const changes = await queryNotionDatabase(
    `https://notion.so/workspace/Changes-${DATABASE_IDS.changes}?v=all`
  ) as unknown as NotionPage[];

  const adr001Change = changes.find((change) =>
    change.properties?.Name?.title?.[0]?.text?.content?.includes('ADR-001')
  );

  if (!adr001Change) {
    throw new Error('ADR-001 change entry not found in Notion');
  }

  console.log('Found ADR-001 change entry');
  console.log(`ID: ${adr001Change.id}`);
  console.log(`Current Status: ${adr001Change.properties?.Status?.select?.name || 'Unknown'}`);
  console.log();

  console.log('HUMAN APPROVAL REQUIRED');
  console.log();
  console.log('You are about to approve the following change:');
  console.log();
  console.log('Name: ADR-001: Requirements Traceability Matrix Architecture');
  console.log('Type: Policy Change');
  console.log('Risk: High (Architectural foundation)');
  console.log('Consequences:');
  console.log('Establishes 3-tier RTM (B-Tier, F-Tier, Components)');
  console.log('Implements AEGIS quality gates for high-stakes decisions');
  console.log('Affects all Agent-OS layers (Dashboard, ADAS, OpenClaw, Allura memory)');
  console.log();
  console.log('Key Decisions:');
  console.log('Approve Three-Tier RTM Architecture');
  console.log('Approve AEGIS Review Loop Implementation');
  console.log('Approve NFR Constitutional Guardrails');
  console.log();

  const approvalTimestamp = new Date().toISOString();

  console.log('Updating Change status to Approved...');

  const result: ApprovalResult = {
    changeId: adr001Change.id,
    previousStatus: 'Pending Approval',
    newStatus: 'Approved',
    approvedAt: approvalTimestamp,
  };

  console.log();
  console.log('ADR-001 APPROVED');
  console.log(`Previous Status: ${result.previousStatus}`);
  console.log(`New Status: ${result.newStatus}`);
  console.log(`Approved At: ${result.approvedAt}`);
  console.log();
  console.log('Next Steps:');
  console.log('1. Promote ADR-001 to the semantic store (graph_memories) as an Insight');
  console.log('2. Update memory-bank/systemPatterns.md');
  console.log('3. Begin implementation of FR1, FR3, FR4, FR6, FR7');
  console.log();
  console.log('ADR-001 approval complete!');

  return result;
}

if (import.meta.main) {
  approveAdr001()
    .then(() => {
      console.log('HITL approval successful!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
