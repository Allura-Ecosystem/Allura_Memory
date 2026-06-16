# Allura Hosted Platform — Requirements Traceability Matrix

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Coverage map for [BLUEPRINT.md](./BLUEPRINT.md). Traces Business → Functional → Use Cases / API / Design.

---

## B → F Mapping

| Business Req | Functional Reqs | Use Cases |
|--------------|-----------------|-----------|
| B1 Multi-tenant w/ isolation | F1, F2, F6, F15 | AUTH-UC1, BB-UC1, MCP-UC3 |
| B2 Humans manage agent memory | F16, F19, F20, F31 | CC-UC1, CUR-UC1 |
| B3 Agents via scoped MCP tokens | F7, F13, F14, F15 | MCP-UC1, BB-UC2 |
| B4 Only humans promote | F20, F21, F22 | CUR-UC1, CUR-UC2, MCP-UC2 |
| B5 Evidence/approval/audit visible | F19, F23, F24, F25 | CC-UC1, AUD-UC1, AUD-UC3 |
| B6 Revoke/rotate/lock/offboard | F3, F5, F8, F9, F11 | BB-UC2, BB-UC4, CC-UC2 |
| B7 Backups + provable restore | F29, F25 | AUD-UC2 |
| B8 Developer integration | F26, F27, F28 | CC-UC3 (SDK/MCP) |

---

## Functional Requirements Detail

### Auth & Tenancy

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F1 | Create organization | `POST /orgs` · [DESIGN-AUTH.md](./DESIGN-AUTH.md) |
| F2 | Create workspace + group_id | `POST /workspaces` · [DESIGN-AUTH.md](./DESIGN-AUTH.md) · [AD-01](./RISKS-AND-DECISIONS.md) |
| F3 | Invite + role assignment | `POST /invites` · [DESIGN-AUTH.md](./DESIGN-AUTH.md) |
| F4 | Scope access to assigned workspaces | session resolution · [DESIGN-AUTH.md](./DESIGN-AUTH.md) |
| F5 | MFA for admins | `POST /sessions` · [DESIGN-AUTH.md](./DESIGN-AUTH.md) |

### Bumblebee

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F6 | Server-side group_id injection | [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [AD-01](./RISKS-AND-DECISIONS.md) |
| F7 | Token/API-key validation | `POST /tokens*` · [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [AD-03](./RISKS-AND-DECISIONS.md) |
| F8 | Scope checks | [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) |
| F9 | Rate limits | [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [RK-04](./RISKS-AND-DECISIONS.md) |
| F10 | Secret scanning | [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [RK-08](./RISKS-AND-DECISIONS.md) |
| F11 | Workspace lock modes | `POST /workspaces/:id/lock` · [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) |
| F12 | Audit permit/deny | [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) · [AD-05](./RISKS-AND-DECISIONS.md) |

### MCP Gateway

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F13 | Bearer-token connect | `POST /mcp` · [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md) |
| F14 | Inject workspace + scope check | [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md) |
| F15 | Cannot override group_id | [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md) · [RK-01](./RISKS-AND-DECISIONS.md) |

### Memory Engine

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F16 | add/search/get/list/delete scoped | `memory_*` · [DESIGN-MEMORY-COMMAND-CENTER.md](./DESIGN-MEMORY-COMMAND-CENTER.md) |
| F17 | Append-only episodic | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory) |
| F18 | Versioned semantic (SUPERSEDES) | [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) · [AD-06](./RISKS-AND-DECISIONS.md) |
| F19 | Provenance preserved | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory) |

### Curator

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F20 | Review queue | `GET /curator/pending` · [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) |
| F21 | Approve/reject + rationale | `POST /curator/:id/*` · [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) |
| F22 | No agent self-approval | [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) · [AD-04](./RISKS-AND-DECISIONS.md) |
| F23 | Promotion history | [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) |

### Audit

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F24 | Log every decision | `GET /audit` · [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) |
| F25 | CSV / receipt export | `GET /audit/export` · [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) |

### Developer Platform

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F26 | SDK/CLI/OpenAPI/templates | `packages/sdk`, `apps/cli` · [BLUEPRINT.md](./BLUEPRINT.md) |
| F27 | SDK/MCP setup page | [DESIGN-MEMORY-COMMAND-CENTER.md](./DESIGN-MEMORY-COMMAND-CENTER.md) |
| F28 | `allura doctor` | [DEPLOYMENT.md](./DEPLOYMENT.md) |

### Ops

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F29 | Compose + backups + restore | [DEPLOYMENT.md](./DEPLOYMENT.md) · [BACKUP-RESTORE.md](./BACKUP-RESTORE.md) |
| F30 | Observability + quotas | [DEPLOYMENT.md](./DEPLOYMENT.md) |

### Dream Engine

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| F31 | Platform-agnostic candidates | [BLUEPRINT.md](./BLUEPRINT.md) · [AD-10](./RISKS-AND-DECISIONS.md) |
| F32 | No direct trusted writes; redaction | [SECURITY.md](./SECURITY.md) · [RK-02](./RISKS-AND-DECISIONS.md) |

---

## Use Case Index

| Area | Use Cases |
|------|-----------|
| Auth | AUTH-UC1, AUTH-UC2, AUTH-UC3 |
| Bumblebee | BB-UC1, BB-UC2, BB-UC3, BB-UC4 |
| MCP Gateway | MCP-UC1, MCP-UC2, MCP-UC3 |
| Command Center | CC-UC1, CC-UC2, CC-UC3 |
| Curator | CUR-UC1, CUR-UC2, CUR-UC3 |
| Audit | AUD-UC1, AUD-UC2, AUD-UC3 |

---

## References

- [BLUEPRINT.md](./BLUEPRINT.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) · all `DESIGN-*.md`
