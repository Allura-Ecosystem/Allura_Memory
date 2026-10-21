# First-use evaluation cases

These cases test evidence decisions, not wording. They do not supply a live service or participant observations.

| Case | Supplied evidence | Decision that must be preserved |
|---|---|---|
| Stale installation | Guide requires retired Neo4j; current source selects PostgreSQL/RuVector | Setup is not verified; reconcile source/guide before presenting it as current |
| Synthetic substitution | A portfolio review screen works with specimen data | Specimen behavior is separate from authenticated memory persistence and later-session retrieval |
| Unrun validation | A command exists; no output or source revision is supplied | Mark untested and run the authorized scoped check, or name its dependency |
| Saved versus approved | Save response says episodic, score 0.7; review state absent | Saved evidence; human approval unknown, not approved |
| Near-match search | Save ID A/content X; later search returns ID B/content Y | Exact-record retrieval fails even if the endpoint reports healthy |
| Partial connector proof | Save and exact get succeed; status-all search returns only older graph records | Capture/read verified; search not achieved; no separate-session claim |
| Human study missing | Five people can be recruited; zero session observations | Participant availability only; comprehension/task outcomes untested |
| Provisioned service | Round trip passes against an existing workspace and gateway | Bounded provisioned-endpoint success; clean installation remains unverified |

Current artifacts, relative to repository root:

- `docs/user-guide/getting-started.md`: maintained evaluation route and recovery.
- `scripts/first-use-memory.ts`: explicit two-session exact-record runner.
- `tests/scripts/first-use-memory.test.ts`: offline protocol/recovery checks, not live persistence.
- `docs/reference/reddit-remediation/connector-evidence.json`: observed partial connector result.
- `docs/reference/reddit-remediation/usability-study.md`: human protocol; observations remain separate.
- `docs/reference/reddit-remediation/execution-checklist.md`: current project coverage and dependencies.
