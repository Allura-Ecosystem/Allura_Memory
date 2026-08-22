# Regulated Document-Quality Workflow — Reference Integration

## Scenario
A regulated document-quality workflow uses synthetic documents, tenant isolation,
human approval, canonical promotion, audit export, and final human authority.

## Principal/Tenant Fixture
- Principal: `compliance-curator` (role: curator)
- Tenant: `allura-regulated-docs`

## Tools
- `memory_search` — retrieve approved document standards
- `memory_add` — store document quality findings
- `memory_promote` — request promotion to canonical
- `governance_proposal_approve` — human-governed approval

## Expected Evidence
- One success case: document quality finding promoted with human approval
- One policy failure: cross-tenant access attempt (denied by RLS)
- One recovery case: checkpoint resume after tool failure during audit export

## Human Final Authority
This workflow explicitly preserves human final authority. Generated output is
presented as evidence for human review, not as an autonomous decision.

## Cleanup
All test data is cleaned after the scenario completes.