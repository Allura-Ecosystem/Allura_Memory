# Story 25.2a — Reviewed record-family migration plan

**State:** final evidence; independent Knuth/Pike/Fowler **APPROVE**.
**Authority:** Migration 39 defines fresh workspace foundations; numbered Migration 40 owns every forward upgrade listed below for databases where shipped Migration 39 already ran. No default workspace is inferred.

| Record family | Owning sequence | New-write contract | Legacy handling | Recovery boundary |
| --- | --- | --- | --- | --- |
| Proposals (`canonical_proposals`) | 39 adds workspace scope; 40 adds baseline `proposal_version=1` and material-change trigger | Exact server-derived `(group_id, workspace_id)`; version increments on material changes | NULL-workspace rows stay invisible | 40 recovery refuses if any version differs from baseline 1 |
| Events / trace evidence (`events`) | 39 adds composite workspace integrity; 40 composes a restrictive exact-workspace policy | Approval, promotion, and evidence events carry workspace | NULL-workspace rows stay invisible | Recovery removes only Migration-40 restrictive policy |
| Canonical promoted knowledge (`graph_memories`) | **40 owns the workspace upgrade** by adding `workspace_id`, `workspace_scope_state`, composite authority, workspace FK, and restrictive policy | Approval and controlled retrieval require exact `(group_id, workspace_id)` and `workspace_scoped` | Existing NULL-workspace rows are explicitly `legacy_quarantined` and excluded | Recovery refuses scoped rows; safe recovery removes current-only columns/policy/check/FK |
| Legacy retained knowledge (`allura_memories`) | 40 scopes new app writes for compatibility | Exact workspace for new app rows | NULL rows quarantined | Safe recovery removes Migration-40 additions |
| Evidence requests (`evidence_requests`) | 39 creates lifecycle; 40 adds scoped identity key for shipped-39 upgrade | Workspace-scoped durable request before receipt | No event-metadata conversion | Recovery drops only 40 identity key |
| Governance receipts (`governance_receipts`, `governance_receipt_evidence_requests`) | 39 creates the shipped subject table; 40 maps same-scope proposal/evidence subjects before archiving only incomplete/unmappable rows and adds complete relational evidence membership | Database-issued occurrence time, proposal/version, source event, canonical full-set hash, and one immutable FK-backed join row per evidence request | Valid mappable Migration-39 rows remain current; only truly incomplete/unmappable rows enter the no-app-grant archive | Lossless recovery restores archived legacy rows and the shipped subject columns/triggers/policies, then removes current-only columns/table |
| Semantic projections (`semantic_projections`) | 39 fresh staged contract; 40 renames shipped columns, hashes Markdown, and repairs false-ready rows | Markdown/redaction persists as `pending_embedding`; `ready` requires actual vector plus exact model/version | Shipped rows with no vector are corrected from false `ready` to pending | Recovery refuses post-040 projections; safe rollback restores shipped names/state |
| Promotion outbox (`promotion_outbox`) | 38 creates tenant outbox; **40 owns workspace upgrade** and scoped unique proposal key | Approval writes canonical pending outbox with `(group_id, workspace_id)` and `workspace_scoped` | Existing NULL-workspace rows are `legacy_quarantined` and excluded by RLS | Recovery refuses scoped rows; otherwise restores Migration-38 key/shape |
| Promotion idempotency (`promotion_idempotency`) | 38 creates tenant replay table; **40 owns workspace upgrade**, surrogate PK, and scoped replay key | New workspace-aware writers use `(group_id, workspace_id, idempotency_key)` | Existing NULL-workspace rows are `legacy_quarantined` and cannot satisfy scoped replay | Recovery refuses scoped rows; otherwise restores Migration-38 PK/shape |
| Migration ledger (`schema_versions`) | 39 records `039`; 40 idempotently records `040` | One row per version | No fabricated history | Safe recovery deletes `040`; reapply recreates exactly one row |

## Concrete upgrade sequence

1. Backup database and capture schema/policy/version snapshots.
2. Apply Migration 40 exactly once after shipped Migration 39.
3. Verify: current receipts contain no incomplete legacy row; archived envelopes are unavailable to `allura_app`; every current receipt check/FK is validated; schema version `040` count is one; legacy retained/outbox/idempotency rows are `legacy_quarantined`.
4. Exercise pending projection persistence, then inject an actual embedding result and verify the same idempotent row becomes ready with exact model/version.
5. Execute approval through the managed app pool and verify scoped promotion event, `canonical_proposals.approved_memory_id`, scoped canonical outbox, and exact receipt/response `queued` agreement.
6. Before writes, recovery may run the numbered recovery SQL and then reapply 40. Recovery refuses when proposal versions, current receipts, post-040 projections, or scoped retained/promotion rows would be lost.
7. After any refused preflight or production writes, restore the backup and migrate forward; never force destructive column rollback.

## Machine checks

- `TENANT_TABLE_INVENTORY` classifies every named family and gives retained/promotion families `workspace-scoped-new-writes` ownership under Migration 40.
- Restrictive app-role policies expose only exact `(group_id, workspace_id)` plus `workspace_scoped` rows for retained/outbox/idempotency families.
- Receipt replay identity is `(group, workspace, proposal, proposal_version, evidence-set hash, action)` and `proposal_version` is NOT NULL.
- Projection readiness is impossible without vector, model, and model version.
