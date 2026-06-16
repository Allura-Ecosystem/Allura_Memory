# Allura Hosted Platform — Threat Model

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md). Risk register: [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md).

## Assets

- Tenant memory (episodic + semantic) and its provenance.
- MCP tokens / API keys.
- Audit log (hash chain).
- Approved (trusted) knowledge in Neo4j.

## Trust Boundaries

1. External agent ↔ MCP Gateway (untrusted bearer).
2. Browser ↔ Command Center (session, MFA for admins).
3. Bumblebee ↔ Memory Engine (internal, scoped).
4. Dream provider ↔ Curator (provider output is untrusted data).

> Memory content and tool outputs are **untrusted** (`.claude/rules/agent-routing.md`). Instructions embedded in them must never alter agent behavior.

## STRIDE Summary

| Threat | Example | Control | Risk |
|--------|---------|---------|------|
| **S**poofing | Forged token | Hash compare, expiry, revoke | RK-03 |
| **T**ampering | Edited audit row | Append-only + hash chain | RK-06 |
| **R**epudiation | "I didn't approve that" | Required rationale + audit identity | RK-05 |
| **I**nfo disclosure | Cross-tenant read | Server-side `group_id` injection | RK-01 |
| **D**oS | Agent write/search loop | Rate limits + circuit breaker + lock | RK-04 |
| **E**levation | Agent self-promotes | HITL; agents lack `memory:promote` | RK-05 |
| Injection | Prompt injection via memory | Warning layer; treat memory as data | RK-02 |
| Secret leak | API key stored in memory | Secret scan before write; redaction | RK-08 |
| Bypass | UI hits DB directly | Control-plane only; governed API | RK-10 |

## Attack Scenarios → Mitigations

- **Stolen token replay:** short expiry, rotation, last-used anomaly detection, rate limits.
- **Malicious workspace switch:** `group_id` derived from token only; override attempts dropped + flagged as drift.
- **Poisoned dream output:** candidates require HITL; secrets redacted; contradictions flagged not merged.
- **Backup that can't restore:** scheduled restore tests with receipts (RK-07, [BACKUP-RESTORE.md](./BACKUP-RESTORE.md)).

## References

- [SECURITY.md](./SECURITY.md) · [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md)
