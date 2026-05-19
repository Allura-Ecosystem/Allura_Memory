# SOC 2 Readiness Checklist

**Version:** 1.0.0  
**Date:** 2026-05-16  
**Reference:** SECURITY-BLUEBOOK.md  
**Target:** SOC 2 Type I within 6 months, Type II within 12 months

---

## How to Use This Checklist

Each control maps to a SOC 2 Trust Services Criteria (TSC). Status indicators:

- ✅ **Implemented** — Control exists and is operational
- ⚠️ **Partial** — Control exists but has gaps
- 🔴 **Missing** — Control does not exist
- 🟡 **Planned** — Control is in the roadmap

Evidence column links to where the auditor will find proof.

---

## CC: Common Criteria (Security)

### CC1: Control Environment

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC1.1 | Organization has written security policies | ✅ | SECURITY-BLUEBOOK.md | Brooks | Done |
| CC1.2 | Security policies are reviewed quarterly | 🔴 | TODO: Review schedule | Brooks | Week 4 |
| CC1.3 | Security roles and responsibilities defined | ✅ | Blue Book §5, AGENTS.md | Brooks | Done |
| CC1.4 | Security awareness training for team | 🔴 | TODO: Training records | You | Week 8 |
| CC1.5 | Code of conduct / ethics policy | 🔴 | TODO: Document | You | Week 8 |

### CC2: Communication & Information

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC2.1 | Security incidents communicated to stakeholders | ✅ | Blue Book §8 (escalation path) | Brooks | Done |
| CC2.2 | Security policies accessible to team | ✅ | SECURITY-BLUEBOOK.md in repo | Brooks | Done |
| CC2.3 | Changes to security controls communicated | 🔴 | TODO: Change notification process | Brooks | Week 7 |

### CC3: Risk Assessment

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC3.1 | Formal risk assessment process | ✅ | Blue Book §2 (threat model) | Brooks | Done |
| CC3.2 | Risk assessments performed annually | 🔴 | TODO: Schedule annual assessment | Brooks | Week 12 |
| CC3.3 | Risks are prioritized and remediated | ⚠️ | Pre-mortem session, TODO tracking | Brooks | Ongoing |
| CC3.4 | Vendor risk assessments | 🔴 | TODO: Assess Clerk, PostgreSQL, Neo4j | Brooks | Week 8 |

### CC4: Monitoring Activities

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC4.1 | Continuous monitoring of systems | ⚠️ | Docker healthchecks, TODO: Prometheus | Hightower | Week 7 |
| CC4.2 | Monitoring detects anomalies | 🔴 | TODO: Anomaly detection | Hightower | Week 7 |
| CC4.3 | Monitoring alerts are actionable | ⚠️ | Healthcheck alerts, TODO: alerting rules | Hightower | Week 7 |
| CC4.4 | Monitoring covers all trust boundaries | 🔴 | TODO: Full coverage | Hightower | Week 8 |

### CC5: Control Activities

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC5.1 | Access controls enforce least privilege | ⚠️ | RBAC implemented, TODO: MCP token scoping | Woz | Week 5 |
| CC5.2 | Change management process | 🔴 | TODO: Code review requirements, deployment approvals | Brooks | Week 7 |
| CC5.3 | Segregation of duties | ⚠️ | Role hierarchy exists, TODO: formal SoD policy | Brooks | Week 6 |
| CC5.4 | Physical/logical access controls | ⚠️ | Docker network isolation, TODO: database-level RLS | Knuth | Week 6 |
| CC5.5 | Backup and recovery procedures | 🔴 | TODO: Automated backups, tested restore | Hightower | Week 4 |

### CC6: Logical & Physical Access Controls

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC6.1 | Authentication mechanisms | ✅ | Clerk SSO, DevAuthProvider (dev only) | Woz | Done |
| CC6.2 | Multi-factor authentication | 🔴 | TODO: Enforce MFA for admin/curator | Woz | Week 5 |
| CC6.3 | Access provisioning/deprovisioning | 🔴 | TODO: User lifecycle management | Woz | Week 6 |
| CC6.4 | Access reviews performed quarterly | 🔴 | TODO: Quarterly review process | Brooks | Week 5 |
| CC6.5 | Remote access controls | ⚠️ | Localhost-only currently, TODO: production access controls | Hightower | Week 8 |
| CC6.6 | Mobile device security | 🔴 | N/A (no mobile app) | N/A | N/A |

### CC7: System Operations

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC7.1 | Incident detection and response | ✅ | Blue Book §8 (incident response plan) | Brooks | Done |
| CC7.2 | Incident response tested | 🔴 | TODO: Tabletop exercise | Team | Week 6 |
| CC7.3 | System recovery procedures | 🔴 | TODO: DR runbook | Hightower | Week 4 |
| CC7.4 | Capacity planning | 🔴 | TODO: Capacity monitoring | Hightower | Week 7 |
| CC7.5 | Environmental controls (datacenter) | N/A | Self-hosted, TODO: document hosting environment | Hightower | Week 8 |

### CC8: Change Management

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC8.1 | Changes are authorized before implementation | 🔴 | TODO: Code review requirements | Brooks | Week 7 |
| CC8.2 | Changes are tested before deployment | ⚠️ | Vitest tests exist, TODO: test coverage requirements | Woz | Week 5 |
| CC8.3 | Changes are documented | ⚠️ | Git commits, TODO: change log | Woz | Week 5 |
| CC8.4 | Emergency change process | 🔴 | TODO: Emergency change procedure | Brooks | Week 7 |
| CC8.5 | Rollback procedures | 🔴 | TODO: Documented rollback process | Hightower | Week 4 |

### CC9: Risk Mitigation

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| CC9.1 | Vulnerability management process | 🔴 | TODO: Automated scanning, patch management | Woz | Week 2 |
| CC9.2 | Security testing (penetration tests) | 🔴 | TODO: Annual pen test | External | Month 4 |
| CC9.3 | Business continuity plan | 🔴 | TODO: BCP document | Brooks | Week 10 |
| CC9.4 | Disaster recovery plan | 🔴 | TODO: DR runbook | Hightower | Week 4 |

---

## A: Availability

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| A1.1 | Uptime monitoring | ⚠️ | Docker healthchecks, TODO: external monitoring | Hightower | Week 7 |
| A1.2 | Uptime SLA defined | 🔴 | TODO: Define SLA | You | Week 8 |
| A1.3 | Capacity management | 🔴 | TODO: Capacity planning | Hightower | Week 7 |
| A1.4 | Environmental protections | N/A | Self-hosted | Hightower | Week 8 |
| A1.5 | Backup and recovery | 🔴 | TODO: Automated backups | Hightower | Week 4 |
| A1.6 | Disaster recovery testing | 🔴 | TODO: Annual DR test | Hightower | Week 12 |

---

## C: Confidentiality

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| C1.1 | Data classification policy | ✅ | Blue Book §3 | Brooks | Done |
| C1.2 | Encryption at rest | 🔴 | TODO: PostgreSQL TDE, Neo4j encrypted volumes | Knuth | Week 3 |
| C1.3 | Encryption in transit | 🔴 | TODO: TLS everywhere | Hightower | Week 3 |
| C1.4 | Access controls for confidential data | ✅ | RBAC + RuVix isolate | Brooks | Done |
| C1.5 | Data retention and disposal | ⚠️ | POL-005 soft-delete, TODO: automated cleanup | Knuth | Week 6 |
| C1.6 | NDA/confidentiality agreements | 🔴 | TODO: Team agreements | You | Week 8 |

---

## P: Privacy

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| P1.1 | Privacy policy | 🔴 | TODO: Write privacy policy | You | Week 10 |
| P1.2 | Notice of data collection | 🔴 | TODO: Implement notice | Woz | Week 10 |
| P1.3 | Consent management | 🔴 | TODO: Consent mechanism | Woz | Week 10 |
| P1.4 | Data subject access requests | 🔴 | TODO: DSAR process | Woz | Week 10 |
| P1.5 | Data subject deletion requests | ⚠️ | Soft-delete exists, TODO: permanent deletion flow | Knuth | Week 6 |
| P1.6 | Privacy impact assessments | 🔴 | TODO: PIA process | Brooks | Week 10 |

---

## PI: Processing Integrity

| ID | Control | Status | Evidence | Owner | Target |
|----|---------|--------|----------|-------|--------|
| PI1.1 | Data validation at input | ✅ | Zod validation at API boundaries | Woz | Done |
| PI1.2 | Data validation at output | 🔴 | TODO: Output validation | Woz | Week 5 |
| PI1.3 | Error handling | ✅ | Structured error responses | Woz | Done |
| PI1.4 | Data reconciliation | 🔴 | TODO: Reconciliation process | Knuth | Week 8 |
| PI1.5 | Quality assurance processes | ⚠️ | Vitest tests, TODO: QA process | Woz | Week 5 |

---

## Progress Summary

| Trust Service | Implemented | Partial | Missing | Planned | Progress |
|---------------|-------------|---------|---------|---------|----------|
| **Security (CC)** | 8 | 6 | 20 | 0 | 24% |
| **Availability (A)** | 0 | 1 | 5 | 0 | 3% |
| **Confidentiality (C)** | 2 | 1 | 3 | 0 | 33% |
| **Privacy (P)** | 0 | 1 | 5 | 0 | 3% |
| **Processing Integrity (PI)** | 2 | 1 | 2 | 0 | 40% |
| **TOTAL** | **12** | **10** | **35** | **0** | **21%** |

---

## Critical Path to Type I Readiness

These controls MUST be implemented before the Type I audit:

### Month 1: Foundation
- [ ] TODO-001: Encryption at rest (PostgreSQL, Neo4j)
- [ ] TODO-002: TLS for all external communication
- [ ] TODO-003: Automated backup & restore testing
- [ ] TODO-004: Dependency vulnerability scanning

### Month 2: Access Controls
- [ ] TODO-005: MFA enforcement for admin/curator
- [ ] TODO-006: Database-level tenant isolation (RLS)
- [ ] CC6.4: Quarterly access review process
- [ ] CC5.3: Segregation of duties policy

### Month 3: Operations
- [ ] TODO-007: Monitoring & alerting (Prometheus)
- [ ] CC7.3: System recovery procedures (DR runbook)
- [ ] CC8.1: Change management process
- [ ] CC8.5: Rollback procedures

### Month 4: Testing
- [ ] TODO-012: Penetration test
- [ ] CC7.2: Incident response tabletop exercise
- [ ] CC3.4: Vendor risk assessments
- [ ] CC9.3: Business continuity plan

### Month 5: Evidence
- [ ] CC1.2: Quarterly security policy review
- [ ] CC1.4: Security awareness training
- [ ] CC3.2: Annual risk assessment
- [ ] Evidence collection for all implemented controls

### Month 6: Readiness Assessment
- [ ] TODO-013: External readiness assessment
- [ ] Remediation of gaps
- [ ] Mock audit
- [ ] Type I audit engagement

---

## Evidence Collection Guide

For each control, the auditor will need:

| Evidence Type | Examples | Collection Method |
|---------------|----------|-------------------|
| **Policy documents** | SECURITY-BLUEBOOK.md, AGENTS.md | Git repository |
| **Configuration files** | docker-compose.yml, .env (redacted) | Git repository |
| **System screenshots** | Dashboard RBAC, health checks | Manual capture |
| **Log extracts** | Audit logs, auth logs | PostgreSQL queries |
| **Test results** | Vitest output, pen test report | CI/CD, external firm |
| **Training records** | Completion certificates | Manual tracking |
| **Meeting minutes** | Security review meetings | Notion or manual |
| **Incident reports** | Post-mortems | Git repository |

### Evidence Naming Convention

```
evidence/{control-id}/{date}-{description}.{ext}

Examples:
evidence/CC6.1/2026-05-16-clerk-sso-config.png
evidence/CC5.1/2026-05-16-rbac-roles-ts.png
evidence/CC7.1/2026-05-16-incident-response-plan.md
evidence/TODO-001/2026-05-20-postgresql-encryption-config.sql
```
