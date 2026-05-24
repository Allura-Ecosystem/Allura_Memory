# Incident Response Runbook

**Version:** 1.0.0  
**Date:** 2026-05-16  
**Reference:** docs/archive/allura/security/SECURITY-BLUEBOOK.md §8  
**Classification:** CONFIDENTIAL

---

## Quick Reference

| Severity | Response Time | Escalation | Examples |
|----------|---------------|------------|----------|
| **CRITICAL** | 15 minutes | You → Brooks → Legal | Data exfiltration, secret exposure |
| **HIGH** | 1 hour | You → Brooks | Unauthorized access, kernel failure |
| **MEDIUM** | 4 hours | You | Policy violations, service degradation |
| **LOW** | 24 hours | You | Minor anomalies, cosmetic issues |

---

## Runbook 1: Secret Exposure

**Trigger:** Credentials found in logs, git history, or error messages.

### Immediate Actions (15 minutes)

1. **Identify the exposed secret**
   ```bash
   # Check git history for accidental commits
   git log --all --full-history -- '**/*.env*'
   git log --all --full-history -p | grep -i 'password\|secret\|key\|token'
   ```

2. **Revoke the compromised credential immediately**
   - PostgreSQL: `ALTER USER <user> WITH PASSWORD '<new-password>'`
   - Neo4j: Change NEO4J_AUTH in .env.local and restart
   - Clerk: Rotate CLERK_SECRET_KEY in Clerk dashboard
   - RUVIX_KERNEL_SECRET: Generate new secret, update .env.local, restart MCP

3. **Rotate ALL secrets that may be related**
   - Don't just rotate the exposed one — rotate everything it could access

4. **Remove the secret from logs/git**
   ```bash
   # If in git history (DANGEROUS — coordinate with team)
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch <file>' \
     --prune-empty --tag-name-filter cat -- --all
   ```

### Containment (1 hour)

5. **Assess what the secret could access**
   - Database? All memory content
   - Neo4j? Full knowledge graph
   - Clerk? All user accounts
   - Kernel? All governance proofs

6. **Check for unauthorized access**
   ```sql
   -- Check for unusual database access patterns
   SELECT event_type, agent_id, created_at
   FROM events
   WHERE created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC
   LIMIT 100;
   ```

7. **Preserve audit logs** — do NOT delete any evidence

### Resolution (4 hours)

8. **Root cause analysis** — How did the secret get exposed?
9. **Remediation** — Fix the root cause
10. **Post-mortem** — Document and share lessons learned

---

## Runbook 2: Unauthorized Access

**Trigger:** Authentication failure spike, unusual query patterns, or reports of unauthorized access.

### Immediate Actions (1 hour)

1. **Confirm the breach**
   ```sql
   -- Check for auth failures
   SELECT COUNT(*), agent_id, created_at
   FROM events
   WHERE event_type LIKE '%auth%'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY agent_id, created_at
   ORDER BY created_at DESC;
   ```

2. **Isolate the affected component**
   ```bash
   # Stop the affected container
   docker stop allura-http-gateway
   # Or stop all containers if scope is unknown
   docker compose down
   ```

3. **Revoke compromised credentials**
   - Follow Runbook 1 steps 2-3

### Containment (2 hours)

4. **Assess scope**
   - What data was accessed?
   - What actions were taken?
   - How long was the access active?

5. **Check for data exfiltration**
   ```sql
   -- Check for unusual memory read patterns
   SELECT user_id, COUNT(*) as read_count
   FROM events
   WHERE event_type = 'MEMORY_READ'
     AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY user_id
   ORDER BY read_count DESC
   LIMIT 20;
   ```

### Resolution (4 hours)

6. **Restore from backup if needed**
7. **Notify affected users** (if data breach)
8. **Root cause analysis**
9. **Post-mortem**

---

## Runbook 3: Service Outage

**Trigger:** Health check failures, service unresponsive, or user reports.

### Immediate Actions (30 minutes)

1. **Check container health**
   ```bash
   docker compose ps
   docker compose logs --tail=100
   ```

2. **Check individual service health**
   ```bash
   # PostgreSQL
   docker exec knowledge-postgres pg_isready -U $POSTGRES_USER

   # Neo4j
   docker exec knowledge-neo4j wget -q --spider http://localhost:7474

   # MCP
   docker exec allura-memory-mcp bun run scripts/mcp-container-healthcheck.ts

   # HTTP Gateway
   curl -f http://localhost:5888/ready
   ```

3. **Restart affected services**
   ```bash
   docker compose restart <service-name>
   ```

### Containment (1 hour)

4. **Check logs for root cause**
   ```bash
   docker compose logs --tail=500 <service-name>
   ```

5. **Check disk space**
   ```bash
   df -h
   docker system df
   ```

6. **Check resource usage**
   ```bash
   docker stats --no-stream
   ```

### Resolution (2 hours)

7. **Fix the root cause**
8. **Verify all services healthy**
9. **Monitor for recurrence**

---

## Runbook 4: Data Corruption

**Trigger:** Inconsistent data, failed integrity checks, or user reports of missing/corrupted memories.

### Immediate Actions (1 hour)

1. **Stop writes to affected system**
   ```bash
   # Stop MCP to prevent further writes
   docker stop allura-memory-mcp
   docker stop allura-http-gateway
   ```

2. **Assess scope of corruption**
   ```sql
   -- Check for anomalies in events table
   SELECT event_type, COUNT(*)
   FROM events
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY event_type
   ORDER BY COUNT(*) DESC;

   -- Check for orphaned records
   SELECT COUNT(*) FROM memories WHERE group_id NOT IN (SELECT DISTINCT group_id FROM events);
   ```

3. **Verify backups are intact**
   ```bash
   # Check backup files exist and are recent
   ls -la /path/to/backups/
   ```

### Containment (2 hours)

4. **Restore from backup if needed**
   ```bash
   # PostgreSQL restore
   docker exec -i knowledge-postgres pg_restore -U $POSTGRES_USER -d $POSTGRES_DB < backup.sql

   # Neo4j restore
   docker exec knowledge-neo4j neo4j-admin restore --from=/data/backups
   ```

5. **Verify data integrity after restore**
   ```sql
   -- Run integrity checks
   SELECT COUNT(*) FROM memories;
   SELECT COUNT(*) FROM events;
   SELECT COUNT(*) FROM users;
   ```

### Resolution (4 hours)

6. **Root cause analysis**
7. **Implement prevention measures**
8. **Post-mortem**

---

## Post-Mortem Template

```markdown
# Incident Post-Mortem: [Date] - [Title]

## Summary
- **Date:** [Date and time of incident]
- **Duration:** [Start time to end time]
- **Severity:** [CRITICAL/HIGH/MEDIUM/LOW]
- **Impact:** [What was affected, how many users, data loss]

## Timeline
| Time | Event |
|------|-------|
| [Time] | Detection |
| [Time] | Containment |
| [Time] | Resolution |
| [Time] | Verification |

## Root Cause Analysis
### Five Whys
1. Why did this happen? [Answer]
2. Why? [Answer]
3. Why? [Answer]
4. Why? [Answer]
5. Why? [Root cause]

## Remediation
### Immediate Fix
- [What was done to resolve the incident]

### Long-Term Prevention
- [What will prevent this from happening again]

## Lessons Learned
### What went well
- [Positive observations]

### What could improve
- [Areas for improvement]

## Action Items
| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [Action] | [Owner] | [Date] | [Status] |
```

---

## Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| On-call | You | First responder |
| Architect | Brooks | Technical decisions |
| Legal | TODO | Data breach notification |
| External auditor | TODO | SOC 2 questions |

---

*This runbook is a living document. Update after every incident. Test quarterly.*
