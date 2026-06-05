# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest main | Yes |
| older commits | No (upgrade recommended) |

## Reporting a Vulnerability

Please report security issues privately:

1. **DO NOT** open a public issue
2. Open a [private security advisory](https://github.com/Charitablebusinessronin/Allura_Memory/security/advisories/new) if available
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- Acknowledgment within 48 hours
- Initial assessment within 7 days
- Fix and disclosure timeline communicated after assessment

## Security Practices

- Allura uses tenant isolation (`group_id`) at the schema level
- PostgreSQL events are append-only for audit integrity
- Neo4j semantic layer requires promotion gating
- JWT secrets and encryption keys must be rotated regularly
- Self-hosted deployment keeps data under your control

## Known Limitations

- Not currently SOC 2 certified
- Not a zero-trust system out of the box
- Review your own `.env` and Docker security posture
