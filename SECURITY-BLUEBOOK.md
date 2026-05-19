# Allura Platform Security Blue Book

**Version:** 1.0.0  
**Date:** 2026-05-16  
**Classification:** CONFIDENTIAL — Internal Use Only  
**Owner:** Brooks (System Architect)  
**Review Cadence:** Quarterly  
**SOC 2 Target:** Type I within 6 months, Type II within 12 months

---

## 1. Scope & Assumptions

### 1.1 Application Purpose

Allura is an **AI agent memory and workflow orchestration platform**. It provides:
- **Governed memory** — PostgreSQL + Neo4j dual-layer storage for agent memories, with HITL curation
- **MCP server** — Standardized tool interface for AI agents (OpenCode, Codex, OpenClaw) to read/write memories
- **Dashboard** — Next.js web application for memory management, curation, and workflow orchestration
- **RuVix Kernel** — L1 governance kernel enforcing proof-gated mutations, tenant isolation, and audit trails

### 1.2 Data Sensitivity Level: **HIGH**

Allura stores:
- Agent conversation traces (may contain PII, API keys, business secrets)
- Memory content (user-provided, potentially sensitive)
- Embedding vectors (derived from memory content)
- Audit logs (who did what, when)
- Agent credentials and session tokens

### 1.3 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  EXTERNAL (Untrusted)                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ OpenCode │  │  Codex   │  │ OpenClaw │  ← Agent Runtimes│
│  │  Agent   │  │  Agent   │  │ Gateway  │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │              │              │                       │
│       └──────────────┼──────────────┘                       │
│                      │ HTTP/MCP                             │
│               ┌──────▼──────┐                               │
│               │ HTTP Gateway│  ← Trust Boundary #1          │
│               │  (:5888)    │     (auth, rate limit, validate)
│               └──────┬──────┘                               │
├──────────────────────┼──────────────────────────────────────┤
│  DMZ (Partially Trusted)                                   │
│               ┌──────▼──────┐                               │
│               │  MCP Server │  ← Trust Boundary #2          │
│               │  (stdio)    │     (policy, kernel, audit)   │
│               └──────┬──────┘                               │
│                      │                                      │
│               ┌──────▼──────┐                               │
│               │ RuVix Kernel│  ← Trust Boundary #3          │
│               │  (L1)       │     (proof, isolate, sandbox) │
│               └──────┬──────┘                               │
├──────────────────────┼──────────────────────────────────────┤
│  INTERNAL (Trusted)                                         │
│        ┌─────────────┴─────────────┐                        │
│   ┌────▼────┐              ┌───────▼──────┐                 │
│   │PostgreSQL│              │   Neo4j      │                 │
│   │  :5432   │              │   :7687      │                 │
│   │(events,  │              │ (semantic    │                 │
│   │ vectors) │              │  graph)      │                 │
│   └──────────┘              └──────────────┘                 │
│                                                              │
│   ┌──────────────┐              ┌──────────────┐             │
│   │ Next.js Web  │              │   Dozzle     │             │
│   │   :3100      │              │   :8088      │             │
│   │ (dashboard)  │              │ (log viewer) │             │
│   └──────────────┘              └──────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

### 1.4 Out of Scope (For Now)

- OpenClaw internal gateway security (separate system)
- Codex runtime security (separate system)
- Notion integration security (covered by Notion's SOC 2)
- Ollama embedding service (local, not exposed)
- RuVector research components (not yet integrated)

---

## 2. Threat Model

### 2.1 Threat Actors

| Actor | Capability | Motivation | Likelihood |
|-------|-----------|------------|------------|
| **Curious developer** | Has local access, can read .env files | Accidental data exposure | HIGH |
| **Compromised agent** | Can call MCP tools, write memories | Data poisoning, privilege escalation | MEDIUM |
| **External attacker** | Network access to exposed ports | Data theft, service disruption | LOW (currently localhost-only) |
| **Malicious insider** | Has admin access to dashboard | Data exfiltration, sabotage | LOW |
| **Supply chain** | Compromised npm/Docker dependency | Backdoor injection | MEDIUM |

### 2.2 Attack Surfaces & Mitigations

| Surface | Threat | Mitigation | Status |
|---------|--------|------------|--------|
| **HTTP Gateway (:5888)** | Unauthorized MCP access | Bearer token auth, rate limiting | ✅ Implemented |
| **Dashboard (:3100)** | Unauthorized web access | Clerk SSO, RBAC middleware | ✅ Implemented |
| **PostgreSQL (:5432)** | Direct database access | Network isolation (Docker bridge), credential management | ⚠️ Partial — exposed on localhost |
| **Neo4j (:7687)** | Direct graph access | Network isolation, credential management | ⚠️ Partial — exposed on localhost |
| **Docker socket** | Container escape | Dozzle read-only mount | ✅ Implemented |
| **Environment files** | Secret exposure | .env.local in .gitignore, chmod 700 | ✅ Implemented |
| **npm dependencies** | Supply chain attack | TODO: Automated dependency scanning | 🔴 TODO |
| **Agent memory writes** | Data poisoning | RuVix kernel policy enforcement, content scoring | ✅ Implemented |
| **Cross-tenant access** | Data leakage | group_id isolation, RuVix isolate primitive | ✅ Implemented |

---

## 3. Data Classification & Handling

### 3.1 Data Classes

| Class | Examples | Storage | Transit | Retention |
|-------|----------|---------|---------|-----------|
| **SECRET** | PostgreSQL password, Neo4j auth, Clerk secret key, RUVIX_KERNEL_SECRET, API keys | .env.local (chmod 700), Varlock | TLS 1.2+ | Until rotated |
| **CONFIDENTIAL** | Memory content, agent conversation traces, embedding vectors | PostgreSQL (encrypted at rest TODO), Neo4j | TLS 1.2+ | 30 days soft-delete, then permanent |
| **INTERNAL** | Audit logs, event traces, system metrics | PostgreSQL | TLS 1.2+ | 90 days minimum |
| **PUBLIC** | Health check responses, API documentation | N/A | TLS 1.2+ | N/A |

### 3.2 Handling Rules

| Rule | Requirement | Status |
|------|-------------|--------|
| **DCH-001** | SECRET data MUST NOT be logged, committed to git, or exposed in error messages | ✅ Enforced |
| **DCH-002** | CONFIDENTIAL data MUST be encrypted at rest | 🔴 TODO — PostgreSQL TDE |
| **DCH-003** | All data in transit MUST use TLS 1.2+ | ⚠️ Partial — localhost only, no TLS |
| **DCH-004** | CONFIDENTIAL data MUST be soft-deleted within 30 days of deletion request | ✅ POL-005 |
| **DCH-005** | Audit logs MUST be immutable (append-only) | ✅ RuVix audit primitive |
| **DCH-006** | Cross-tenant data MUST NOT be accessible without explicit authorization | ✅ RuVix isolate primitive |

### 3.3 Encryption Requirements

| Component | At Rest | In Transit | Status |
|-----------|---------|------------|--------|
| PostgreSQL | TODO: pgcrypto or TDE | TODO: TLS | 🔴 Not implemented |
| Neo4j | TODO: Encrypted volumes | TODO: Bolt TLS | 🔴 Not implemented |
| Docker volumes | TODO: Encrypted volumes | N/A | 🔴 Not implemented |
| .env.local | Filesystem permissions (chmod 700) | N/A | ✅ Implemented |
| Backup files | TODO: Encrypted backups | TODO: TLS for transfer | 🔴 Not implemented |

---

## 4. Authentication & Session Policy

### 4.1 Auth Mechanisms

| Component | Mechanism | Status |
|-----------|-----------|--------|
| **Dashboard** | Clerk SSO (production) / DevAuthProvider (development) | ✅ Implemented |
| **MCP Gateway** | Bearer token (ALLURA_MCP_AUTH_TOKEN) | ✅ Implemented |
| **MCP Server (stdio)** | Process-level isolation (no network exposure) | ✅ Implemented |
| **PostgreSQL** | Username/password (POSTGRES_USER/POSTGRES_PASSWORD) | ✅ Implemented |
| **Neo4j** | Username/password (NEO4J_AUTH) | ✅ Implemented |
| **RuVix Kernel** | Cryptographic proof (RUVIX_KERNEL_SECRET) | ✅ Implemented |

### 4.2 Session Policy

| Rule | Requirement | Status |
|------|-------------|--------|
| **SP-001** | Dashboard sessions MUST use Clerk's session management | ✅ Implemented |
| **SP-002** | MCP gateway tokens SHOULD be rotated quarterly | 🔴 TODO — no rotation mechanism |
| **SP-003** | Database credentials SHOULD be rotated quarterly | 🔴 TODO — no rotation mechanism |
| **SP-004** | RuVix kernel secret MUST be rotated if compromised | ✅ Manual rotation supported |
| **SP-005** | DevAuthProvider MUST NOT be active in production | ✅ Enforced by isDevAuthActive() |

### 4.3 MFA Requirements

| Component | MFA Required | Status |
|-----------|-------------|--------|
| Dashboard (Clerk) | TODO: Enforce MFA for admin/curator roles | 🔴 TODO |
| MCP Gateway | N/A (service-to-service) | N/A |
| Database | N/A (internal network) | N/A |

### 4.4 Token Handling

| Rule | Requirement | Status |
|------|-------------|--------|
| **TH-001** | Tokens MUST be stored in environment variables, never in code | ✅ Enforced |
| **TH-002** | Tokens MUST NOT be logged | ✅ Enforced by security patterns |
| **TH-003** | Tokens MUST be scoped to minimum required permissions | ⚠️ Partial — MCP token is all-or-nothing |
| **TH-004** | Expired tokens MUST be rejected immediately | ✅ Clerk handles this |

---

## 5. Authorization & Access Control

### 5.1 RBAC Model

| Role | Permissions | Scope |
|------|-------------|-------|
| **admin** | Full access: user management, system config, all CRUD | Tenant (group_id) |
| **curator** | Memory approval/rejection, knowledge promotion, curator API | Tenant (group_id) |
| **viewer** | Memory read, search, traces/insights read | Tenant (group_id) |
| **service_actor** | MCP tool access, memory read/write via gateway | Tenant (group_id) |
| **auditor** | Audit log read/export, compliance reports | Cross-tenant (TODO) |

### 5.2 Role Hierarchy

```
admin (level 2)
  └── curator (level 1)
        └── viewer (level 0)
```

Permission check: `roleLevel(userRole) >= roleLevel(requiredRole)`

### 5.3 Principle of Least Privilege

| Rule | Requirement | Status |
|------|-------------|--------|
| **PLP-001** | New users MUST default to viewer role | ✅ Enforced by parseRole() fallback |
| **PLP-002** | MCP gateway token MUST be scoped to minimum required tools | 🔴 TODO — currently all tools |
| **PLP-003** | Database users MUST have minimum required privileges | ⚠️ Partial — single admin user |
| **PLP-004** | Agents MUST NOT have admin access | ✅ Enforced by POL-004 (canonical agent IDs) |

### 5.4 Tenant Isolation

| Rule | Requirement | Status |
|------|-------------|--------|
| **TI-001** | All data access MUST be scoped to group_id | ✅ Enforced by MCP tools |
| **TI-002** | Cross-tenant access MUST be explicitly authorized | ✅ RuVix isolate primitive |
| **TI-003** | group_id format MUST be `allura-*` | ✅ Enforced by schema |
| **TI-004** | Tenant isolation MUST be enforced at database level | 🔴 TODO — currently application-layer only |

---

## 6. Logging & Audit

### 6.1 What to Log

| Event | Log Level | Destination | Retention |
|-------|-----------|-------------|-----------|
| Authentication success/failure | INFO | PostgreSQL events table | 90 days |
| Memory read/write/delete | INFO | PostgreSQL events table | 90 days |
| Memory promotion/rejection | INFO | PostgreSQL events table | 90 days |
| Role change | INFO | PostgreSQL events table | 1 year |
| Policy violation | WARN | PostgreSQL events table + console | 1 year |
| Kernel proof failure | ERROR | PostgreSQL events table + console | 1 year |
| System errors | ERROR | PostgreSQL events table + console + TODO: Sentry | 1 year |
| Health check results | DEBUG | Dozzle (container logs) | 7 days |

### 6.2 What NOT to Log

| Prohibited | Reason |
|------------|--------|
| Passwords, tokens, API keys | SECRET data exposure |
| PII in clear text | Privacy violation |
| Full request/response bodies | May contain CONFIDENTIAL data |
| Stack traces in production | Internal implementation exposure |
| RuVix kernel secret | Cryptographic compromise |

### 6.3 Log Protection

| Rule | Requirement | Status |
|------|-------------|--------|
| **LP-001** | Audit logs MUST be append-only | ✅ RuVix audit primitive |
| **LP-002** | Audit logs MUST NOT be editable or deletable | ✅ Soft-delete only, 30-day window |
| **LP-003** | Log access MUST be restricted to admin/auditor roles | ✅ Enforced by RBAC |
| **LP-004** | Logs MUST be exported for compliance review | 🔴 TODO — export functionality |
| **LP-005** | Log integrity MUST be verifiable | ⚠️ Partial — RuVix attest primitive exists |

### 6.4 Audit Trail Requirements

| Requirement | Status |
|-------------|--------|
| Every memory write is traced with agent_id, timestamp, group_id | ✅ Implemented |
| Every promotion decision is recorded with curator_id, rationale | ✅ Implemented |
| Every policy evaluation is logged with result | ✅ POLICY_AUDIT_TRAIL |
| Every kernel mutation has cryptographic proof | ✅ RuVix proof engine |
| Audit trail is queryable by time range, actor, intent | ✅ syscall_audit |

---

## 7. Retention & Deletion

### 7.1 Default Retention Periods

| Data Class | Retention | Deletion Method |
|------------|-----------|-----------------|
| Memory content | 30 days after soft-delete | Permanent deletion (POL-005) |
| Event traces | 90 days | Automated cleanup (TODO) |
| Audit logs | 1 year minimum | Manual review before deletion |
| Embedding vectors | Same as source memory | Cascade delete |
| Neo4j graph nodes | Same as source memory | SUPERSEDES relation (soft) |
| User sessions | Per Clerk configuration | Clerk handles |
| Container logs | 7 days (Dozzle) | Log rotation |

### 7.2 User-Initiated Deletion Flow

| Step | Action | Status |
|------|--------|--------|
| 1 | User requests memory deletion via API/UI | ✅ Implemented |
| 2 | Memory is soft-deleted (marked deprecated) | ✅ Implemented |
| 3 | 30-day grace period (restore possible) | ✅ POL-005 |
| 4 | Permanent deletion after 30 days | 🔴 TODO — automated cleanup |
| 5 | Audit log entry records deletion | ✅ Implemented |
| 6 | Neo4j node marked deprecated | ✅ Implemented |
| 7 | Embedding vector deleted | 🔴 TODO — cascade delete |

### 7.3 Compliance Requirements

| Regulation | Applicability | Status |
|------------|---------------|--------|
| **GDPR** | If EU user data is stored | 🔴 TODO — data subject rights flow |
| **CCPA** | If California user data is stored | 🔴 TODO — right to delete flow |
| **HIPAA** | If PHI is stored | 🔴 NOT READY — requires significant controls |
| **SOC 2** | Target compliance | 🟡 In progress (this document) |

---

## 8. Incident Response

### 8.1 Detection Triggers

| Trigger | Severity | Response Time |
|---------|----------|---------------|
| Unauthorized access attempt (auth failure spike) | HIGH | 1 hour |
| Data exfiltration suspected (unusual query volume) | CRITICAL | 15 minutes |
| RuVix kernel proof failure | HIGH | 1 hour |
| Policy violation (POL-001, POL-004) | MEDIUM | 4 hours |
| Service outage (health check failure) | HIGH | 30 minutes |
| Secret exposure (credential in logs/git) | CRITICAL | 15 minutes |

### 8.2 Escalation Path

```
Detection → On-call engineer (you) → Brooks (architect) → Legal (if data breach)
```

### 8.3 Containment Steps

| Step | Action | Owner |
|------|--------|-------|
| 1 | Isolate affected component (stop container) | On-call |
| 2 | Revoke compromised credentials | On-call |
| 3 | Preserve audit logs (do NOT delete) | On-call |
| 4 | Assess scope of impact | Brooks |
| 5 | Notify affected users (if data breach) | Legal |
| 6 | Root cause analysis | Brooks + Team |
| 7 | Remediation and verification | Team |
| 8 | Post-mortem and documentation | Brooks |

### 8.4 Post-Mortem Template

```markdown
# Incident Post-Mortem: [Date] - [Title]

## Summary
- What happened
- Impact (users, data, duration)
- Root cause

## Timeline
- [Time] Detection
- [Time] Containment
- [Time] Resolution

## Root Cause Analysis
- Five Whys drill-down

## Remediation
- Immediate fix
- Long-term prevention

## Lessons Learned
- What went well
- What could improve
- Action items (with owners and deadlines)
```

---

## 9. Security Gates (Go/No-Go)

### 9.1 Pre-Deployment Checklist

| Check | Requirement | Status |
|-------|-------------|--------|
| **G-001** | All secrets in environment variables, not code | ✅ Pass |
| **G-002** | .env.local is in .gitignore | ✅ Pass |
| **G-003** | CREDENTIALS_DIR is chmod 700 | ✅ Pass |
| **G-004** | Zod validation at all API boundaries | ✅ Pass |
| **G-005** | Rate limiting on all public endpoints | ✅ Pass |
| **G-006** | RBAC middleware on all protected routes | ✅ Pass |
| **G-007** | RuVix kernel initialized and healthy | ✅ Pass |
| **G-008** | All containers healthy | ✅ Pass |
| **G-009** | Encryption at rest enabled | 🔴 Fail — TODO |
| **G-010** | TLS enabled for all external communication | 🔴 Fail — TODO |
| **G-011** | Dependency vulnerability scan passes | 🔴 Fail — TODO |
| **G-012** | Backup and restore tested | 🔴 Fail — TODO |
| **G-013** | Incident response plan documented | ✅ Pass (this document) |
| **G-014** | MFA enforced for admin users | 🔴 Fail — TODO |

### 9.2 Runtime Monitoring Requirements

| Metric | Threshold | Alert | Status |
|--------|-----------|-------|--------|
| Auth failure rate | > 10/min | HIGH | 🔴 TODO |
| Memory write rate | > 100/min | MEDIUM | ✅ Budget enforcement |
| Policy violation rate | > 5/hour | HIGH | 🔴 TODO |
| Health check failures | > 3 consecutive | CRITICAL | ✅ Docker healthchecks |
| Disk usage | > 80% | HIGH | 🔴 TODO |
| Response latency (p95) | > 2s | MEDIUM | 🔴 TODO |

### 9.3 Periodic Review Cadence

| Review | Frequency | Owner |
|--------|-----------|-------|
| Secret rotation | Quarterly | On-call |
| Access review (who has what role) | Quarterly | Admin |
| Dependency vulnerability scan | Weekly (automated) | TODO: CI pipeline |
| Audit log review | Monthly | Curator |
| Policy effectiveness review | Quarterly | Brooks |
| Incident response drill | Semi-annually | Team |
| SOC 2 control assessment | Annually | External auditor |
| Penetration test | Annually | External firm |

---

## 10. SOC 2 Readiness Roadmap

### Phase 1: Foundation (Weeks 1-4) — ✅ In Progress

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| Security Blue Book | This document | Brooks | Week 1 |
| Encryption at rest | PostgreSQL pgcrypto, Neo4j encrypted volumes | Knuth | Week 2-3 |
| TLS everywhere | Reverse proxy with TLS, database TLS | Hightower | Week 2-3 |
| Backup & restore | Automated backups, tested restore | Hightower | Week 3-4 |
| Dependency scanning | Automated npm audit in CI | Woz | Week 2 |

### Phase 2: Operational Controls (Weeks 5-8)

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| MFA enforcement | Clerk MFA for admin/curator | Woz | Week 5 |
| Access review process | Quarterly review workflow | Brooks | Week 5 |
| Incident response drill | Tabletop exercise | Team | Week 6 |
| Monitoring & alerting | Prometheus/Grafana or equivalent | Hightower | Week 6-7 |
| Change management | Code review requirements, deployment approvals | Brooks | Week 7 |
| Vendor risk assessment | Assess Clerk, PostgreSQL, Neo4j, Docker | Brooks | Week 8 |

### Phase 3: Evidence Collection (Weeks 9-12)

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| Evidence repository | Structured evidence collection system | Woz | Week 9 |
| Control testing | Documented tests for each SOC 2 control | Brooks | Week 9-10 |
| Policy documentation | All policies written and approved | Brooks | Week 10 |
| Training records | Security training completion tracking | You | Week 11 |
| Gap analysis | Self-assessment against SOC 2 criteria | Brooks | Week 12 |

### Phase 4: Readiness Assessment (Weeks 13-16)

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| External readiness consultant | Hire and engage | You | Week 13 |
| Remediation plan | Address gaps from readiness assessment | Team | Week 14-15 |
| Mock audit | Simulated SOC 2 audit | Consultant | Week 16 |

### Phase 5: Type I Audit (Weeks 17-20)

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| Select auditor | Engage SOC 2 audit firm | You | Week 17 |
| Evidence submission | Provide evidence package | Brooks | Week 18 |
| Audit fieldwork | Auditor review | Auditor | Week 18-19 |
| Type I report | Receive SOC 2 Type I report | Auditor | Week 20 |

### Phase 6: Type II Audit (Months 6-12)

| Control | Action | Owner | Target |
|---------|--------|-------|--------|
| Observational period | Operate controls consistently for 3-6 months | Team | Months 6-9 |
| Type II audit | Auditor observes controls over time | Auditor | Month 10 |
| Type II report | Receive SOC 2 Type II report | Auditor | Month 12 |

---

## Appendix A: Current Security Controls Inventory

| Control | Type | Status | Evidence Location |
|---------|------|--------|-------------------|
| Clerk SSO | Authentication | ✅ Active | `src/lib/auth/` |
| RBAC (viewer/curator/admin) | Authorization | ✅ Active | `src/lib/auth/roles.ts` |
| DevAuthProvider (dev only) | Authentication | ✅ Active | `src/lib/auth/dev-auth.ts` |
| RuVix Kernel (6 primitives) | Governance | ✅ Active | `src/kernel/` |
| Policy enforcement (6 policies) | Authorization | ✅ Active | `src/kernel/policy.ts` |
| Proof-gated mutations | Integrity | ✅ Active | `src/kernel/proof.ts` |
| Tenant isolation (group_id) | Confidentiality | ✅ Active | MCP tools, RuVix |
| Audit trail (append-only) | Audit | ✅ Active | PostgreSQL events |
| Zod validation | Input validation | ✅ Active | API routes |
| Rate limiting | Availability | ✅ Active | API routes |
| Budget enforcement | Availability | ✅ Active | HTTP gateway |
| Docker healthchecks | Availability | ✅ Active | docker-compose.yml |
| .env.local separation | Secret management | ✅ Active | .gitignore |
| CREDENTIALS_DIR chmod 700 | Secret management | ✅ Active | security.md |
| Soft-delete (30-day window) | Retention | ✅ Active | POL-005 |
| Neo4j direct write blocking | Integrity | ✅ Active | POL-001 |
| Canonical agent ID enforcement | Integrity | ✅ Active | POL-004 |

## Appendix B: TODO Summary

| ID | Action | Priority | Owner | Target |
|----|--------|----------|-------|--------|
| TODO-001 | Encryption at rest (PostgreSQL, Neo4j) | P0 | Knuth | Week 3 |
| TODO-002 | TLS for all external communication | P0 | Hightower | Week 3 |
| TODO-003 | Automated backup & restore testing | P0 | Hightower | Week 4 |
| TODO-004 | Dependency vulnerability scanning (CI) | P1 | Woz | Week 2 |
| TODO-005 | MFA enforcement for admin/curator | P1 | Woz | Week 5 |
| TODO-006 | Database-level tenant isolation (RLS) | P1 | Knuth | Week 6 |
| TODO-007 | Monitoring & alerting (Prometheus) | P1 | Hightower | Week 7 |
| TODO-008 | MCP token scoping (least privilege) | P1 | Knuth | Week 5 |
| TODO-009 | Automated credential rotation | P2 | Hightower | Week 8 |
| TODO-010 | GDPR/CCPA data subject rights flow | P2 | Woz | Week 10 |
| TODO-011 | Audit log export functionality | P2 | Woz | Week 6 |
| TODO-012 | Penetration test | P2 | External | Month 4 |
| TODO-013 | SOC 2 readiness assessment | P2 | External | Week 13 |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Allura Brain** | The governed memory system (PostgreSQL + Neo4j + MCP) |
| **RuVix Kernel** | L1 governance kernel with 6 primitives (mutate, attest, verify, isolate, sandbox, audit) |
| **group_id** | Tenant identifier (format: `allura-*`) |
| **HITL** | Human-in-the-loop (curator review pipeline) |
| **MCP** | Model Context Protocol (standardized agent tool interface) |
| **POL-XXX** | RuVix kernel policy identifier |
| **SOC 2** | System and Organization Controls 2 (AICPA trust services criteria) |
| **Type I** | Point-in-time assessment of control design |
| **Type II** | Observational assessment of control effectiveness over time |

---

*This document is a living artifact. Review quarterly. Update when controls change. Mark all TODOs with owners and deadlines.*
