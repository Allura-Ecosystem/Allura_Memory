# Allura Hosted Platform — Backup & Restore

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md) (B7, F29). Risk: [RK-07](./RISKS-AND-DECISIONS.md).

## Principle

A backup is only real if it can restore. Restore must be tested on a cadence and produce a **restore receipt**.

## Checkpoint Cadence

```
Every action       → audit event
Every memory write → append-only record
Every 10 minutes   → governance checkpoint
Every hour         → stronger snapshot
Every day          → full backup
```

The 10-minute checkpoint captures: workspace state, latest memory IDs, latest audit event hash, latest approved knowledge version, agent run status, curator queue state, methodology run state.

## Backup Scope

| Store | Method |
|-------|--------|
| PostgreSQL (episodic + vector) | `pg_dump` / volume snapshot |
| Neo4j (semantic) | online backup / dump |
| Audit chain | included in PG; chain head checkpointed |

## Restore Test (must pass)

1. Restore PostgreSQL into a scratch instance.
2. Restore Neo4j into a scratch instance.
3. Restore from latest checkpoint.
4. Verify audit hash chain is intact end-to-end.
5. Verify latest approved knowledge version matches checkpoint.
6. Write a restore receipt; report any failed step.

The `backup-restore-tester` skill (P0) automates this; the CI `checkpoint-restore-test` job runs a reduced version.

## Acceptance

- [ ] Daily full backup exists for PG + Neo4j.
- [ ] Restore test passes and produces a receipt.
- [ ] Audit hash chain verifies after restore.
- [ ] Failed restore steps are reported, not silent.

## References

- [DEPLOYMENT.md](./DEPLOYMENT.md) · [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md)
