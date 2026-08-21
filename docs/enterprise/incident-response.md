# Allura Incident Response

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Data breach, tenant isolation failure | Immediate |
| P1 | Service down, auth bypass | < 1 hour |
| P2 | Performance degradation, partial failure | < 4 hours |
| P3 | Non-critical bug, documentation issue | Next business day |

## Response Steps

### 1. Detect
- Monitor CI evidence manifest for failed lanes
- Monitor MCP `/ready` endpoint for health
- Monitor PostgreSQL for RLS violations

### 2. Assess
- Determine severity level
- Identify affected tenants
- Check audit trail for scope

### 3. Contain
- Disable affected MCP tokens
- Pause promotion pipeline
- Enable maintenance mode if needed

### 4. Eradicate
- Fix root cause
- Rotate compromised credentials
- Apply security patches

### 5. Recover
- Verify fix with evaluation suite
- Restore service
- Monitor for 24 hours

### 6. Post-Mortem
- Document timeline
- Update threat model
- Add regression test
- Update security controls matrix