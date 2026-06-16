# Allura Hosted Platform — Security

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md). Gate: [DESIGN-GUARD.md](./DESIGN-GUARD.md). Threats: [THREAT-MODEL.md](./THREAT-MODEL.md).

## Security Requirements (Allura Guard must enforce)

- Server-side `group_id` injection.
- Token hashing; expiry; revoke; rotation.
- MFA for admins.
- Backend permission checks (never client-trusted).
- Audit every permit and deny.
- Rate limits per token/user/workspace/agent.
- Secret scanning before memory storage.
- Prompt-injection warning layer for retrieved memory.
- Workspace lock modes.
- Export controls.
- Offboarding flow (revoke all user tokens).
- Backup and restore.
- Security event dashboard.

## Security Flow

```
Token valid? → not expired? → not revoked? → workspace allowed? →
scope allowed? → rate limit ok? → policy/lock allows? → audit written? → execute
```

Fail closed at any step → deny + audit.

## Roles & Permissions

See [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#role-values). Key rule:

> Employees and agents may create or submit memory. Only reviewers/admins may approve promotion. Agents never approve their own generated memories.

## Secrets & PII

- No secrets, credentials, or raw tokens are logged or stored (only token hash + prefix).
- Secret scanner runs before memory write (F10); a positive match denies the write (RK-08).
- Dream Engine redacts secrets before processing (F32).

## Workspace Lock Modes

`normal` · `read_only` · `no_agent_writes` · `no_promotions` · `full_lockdown`. See [DESIGN-AUTH.md](./DESIGN-AUTH.md#state-machine--workspace-lock).

## Offboarding

When a user is removed: revoke all memberships, revoke all tokens created by the user, and audit the offboarding (RK-09). The `mcp-token-auditor` skill flags any residual active tokens.

## RuVector Compliance

RuVector is MIT-licensed. If used:
- Keep the MIT license notice on any copied/modified source.
- Add `THIRD_PARTY_NOTICES.md` and `LICENSES/ruvector-MIT.txt` when vendoring.
- Track as a pinned dependency in the SBOM and dependency review.
- The adapter must enforce `group_id`, scopes, audit, and provenance (AD-09).

## Bumblebee — supply-chain exposure scanner (planned, not built)

A separate read-only security layer from Allura Guard. Where Allura Guard gates *live*
MCP/API requests, **Bumblebee** answers a supply-chain response question: when an advisory
names a compromised package/extension/version, which connected developer endpoints or
agents show a match in their on-disk metadata right now? It inventories lockfiles,
package-manager metadata, editor/browser extensions, and MCP host configs into structured
records and flags exact matches against an exposure catalog. Modeled on
[perplexityai/bumblebee](https://github.com/perplexityai/bumblebee). Not yet implemented —
tracked for a future phase.

## References

- [THREAT-MODEL.md](./THREAT-MODEL.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) · [BACKUP-RESTORE.md](./BACKUP-RESTORE.md)
