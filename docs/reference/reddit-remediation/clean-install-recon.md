# Clean-install boundary recon

> AI-Assisted Documentation: read-only deployment reconnaissance, 2026-10-20. Only this report is written. Source analysis and offline parsing are not a clean-install receipt. The configured connected-agent path remains primary and is separate from a future self-hosted installation.

## Context and boundaries

Loaded the Scout role, `.opencode/context/index.md`, documentation-authority map, `.opencode/manifest.json`, development readiness, technical-domain context, current first-use guide/evidence and Context7 skill. Several readiness/manifest entries are historical, including retired Neo4j references; current source establishes the inspected contracts.

Brain search: `clean installation bootstrap decisions blockers outcomes`, status all, include_global false, group_id allura-system, limit 3. It returned three historical semantic records dated 2026-05-28/2026-06-08, not current clean-install proof. Their unrelated content is excluded. Search trajectory: `0f6e0c7f-b161-4289-9d9f-91215dfaf622`.

No deployment `.env` or `.env.local` contents were read; only committed example templates and source were inspected. No container was started/stopped, image pulled/built, database queried, credential sought/created, or remote endpoint changed. The configured `mcp.faithmeats.org` connection is not a new-install test target.

## Observed tools and offline validation

- Bun: 1.3.14.
- Docker client: 29.6.0. Server version is unavailable: read-only docker version failed with permission denied on the Desktop socket. This is a local sandbox/daemon-access boundary, not evidence that the existing connected Brain is unavailable.
- Docker Compose: v5.1.0. Local help exposes the selected no-secret validation flags.
- Both models pass the following offline parse/consistency commands, exit 0. Explicit empty interpolation input and disabled service-env resolution prevent the check from reading deployment env-file contents; output is suppressed. Images and runtime are not exercised.

```bash
docker compose --env-file /dev/null -f docker-compose.yml config --no-env-resolution --no-interpolate --quiet
docker compose --env-file /dev/null -f docker-compose.portfolio.yml config --no-env-resolution --no-interpolate --quiet
bash -n scripts/brain-stack.sh scripts/first-run.sh scripts/first-run-setup.sh scripts/validate-env.sh
```

The shell syntax check passed, exit 0. It does not validate operational assumptions.

Context7 receipt: required yes; library `/docker/compose`, resolved from Docker Compose. Topic: project isolation with external resources/fixed names and validation without env-file resolution. Finding: config validates without starting services; project naming alone does not isolate explicit shared names/external storage. Sources: [config implementation](https://github.com/docker/compose/blob/main/cmd/compose/config.go), [project option implementation](https://github.com/docker/compose/blob/main/cmd/compose/compose.go). Local CLI help independently confirms available flags.

## Candidate recipes and actual holes

| Candidate | What exists | Why it is not a complete isolated memory-service installation |
|---|---|---|
| Primary docker-compose.yml | PostgreSQL/pgvector, source-built MCP service, schema init directory, external networks/volume | Fixed container names and shared memory_postgres_data bind the primary stack. Host bindings 5432 and 6477 can collide. Project name alone does not isolate those names. No embedding service or first scoped credential/workspace provisioning is included. |
| bun run brain:up / brain-stack.sh | Bootstraps both current external networks and shared storage before Compose up | Intentionally touches primary-stack resources; unsuitable for a side-by-side isolated trial. Readiness checks port 5888 although Compose publishes 6477. Service list/restart still names retired Neo4j. |
| first-run.sh / first-run-setup.sh | Older resource bootstrap entry points | Bootstrap only knowledge-network, omitting declared open-webui-stack_default; still create retired Neo4j volumes. first-run.sh treats .env.local as optional while MCP env_file declares it. The validator requires retired Neo4j password and an Ollama API key even for a local provider. |
| docker-compose.portfolio.yml | Disposable loopback PostgreSQL, tmpfs, configurable port, Compose-managed names; builds current init scripts into image | Useful existing isolation pattern, but database only. It does not run the MCP gateway, credential bootstrap or embedding provider. The synthetic workspace fixture establishes dashboard DevAuth scope, not a complete MCP credential or independent reviewer. |
| Existing connected-agent guide | Uses the already provisioned integration in authorized scope | Correctly avoids installation for that reader. It cannot establish fresh image/schema bootstrap, credential provisioning, persistence/recovery or clean-machine success. |

## Contracts to settle before a runnable recipe

1. **Isolation/lifecycle:** preserve the primary stack. A standalone evaluation file can use project-owned resource names and loopback high ports without inheriting primary names, networks or storage. Decide whether trial data is disposable or persistent; tmpfs cannot prove restart durability. Cleanup must identify only evaluation-owned resources.
2. **Environment:** primary PostgreSQL loads only .env while MCP loads .env plus .env.local. Interpolated health settings and runtime settings can diverge; actual secret values were not inspected. The example lacks the restricted app-role variables required by getAppPool and explicit stdio service workspace variable.
3. **App-role credentials:** connection.ts requires POSTGRES_APP_USER and POSTGRES_APP_PASSWORD for workspace-governed services. Migration 35 creates roles with an example password. The recipe must safely provision/validate authorized credentials without substituting owner access. No credential was altered.
4. **Initialization:** migration 00 supplies vector/pg_trgm, 27 workspaces, 28 hashed workspace-bound MCP credentials, and 35–40 restricted-role/workspace policies. Valid YAML and mounted/copied scripts do not prove successful empty-database initialization, partial-volume handling or recovery.
5. **First principal:** a production token signing secret is not itself a usable client credential. Tables are created without a generic first operational workspace/token. Per-caller records carry workspace; shared/dev HTTP branches omit it while current boundaries require it. Do not invent identities or broaden grants to bypass this gap.
6. **Provisioning:** authenticated Next.js admin routes for workspaces/tokens exist, but primary MCP does not run Next.js. Low-level repositories do not constitute a reviewed operator bootstrap. A recipe must name the authorized provisioning mechanism and accountable owner; no direct repository/database writes occur here.
7. **Embedding:** primary Compose references a host/provider, without provisioning its service/model. RuVector code requests 1024 dimensions through /v1/embeddings and permits null vectors on provider failure. Check model/schema compatibility and retrieval separately; template/provider model strings differ. No model/provider request was made.
8. **Build/readiness:** Dockerfile.mcp uses floating Bun major tag and dependency install without a frozen flag. Compose overrides the idle image command with the HTTP gateway. Readiness checks PostgreSQL/MCP state; it does not prove authenticated app-role save/search, embedding readiness, migration completeness or human review.
9. **Ports/recovery:** reconcile profile ports and scripts explicitly. Primary internal 3201 conflicts with current project port policy; an isolated trial must resolve that contract without silently changing the configured service. Backup/restore and independent human-review demonstrations remain separate acceptance work.

## Smallest honest next deliverable

No inspected file supplies a verified, complete, isolated fresh memory-service installation. The next concrete step is an operator handoff, not executing the shared-stack bootstrap. The operator must identify a dedicated disposable evaluation host/daemon, confirm permission to create its resources, and identify the approved mechanism for the initial workspace-bound principal and secure delivery. Existing mcp.faithmeats.org credentials and tenant are not substitutes for this missing bootstrap authority. An offline correction specification for the port/environment/bootstrap gaps can be prepared now; it cannot be represented as a supported install recipe.

The handoff should contain the table above, source hashes, observed daemon-access error, two passing offline parser checks, required app-role variables, and the first-principal gap. Hightower should select a supported deployment route with the operator; Knuth/Pike should review isolation and authority. Only after that selection should a bounded implementation brief assign configuration/preflight changes and an installation guide. Suggested owners are not execution receipts.

A later authorized run needs a reachable evaluation daemon; build/pull/resource authority; resource ownership and secret delivery; initialized schema; scoped principal/workspace; provider readiness; two distinct authenticated sessions; exact saved-content discovery; source/review state; and bounded retry/recovery results. Human promotion requires an independent authorized person. This report grants no runtime authority.

## Offline choices for the future slice

- Compose static validation with empty env input and service-env resolution disabled; assert no production names/volumes, loopback bindings and explicit dependencies.
- Shell syntax and focused preflight unit tests with mocked process output, without Docker/database contact.
- Existing portfolio-demo-tools, PostgreSQL connection and MCP-authenticator tests can inform focused checks after inspection. They were not run by this recon and do not substitute for fresh installation.
- Actual initialization/first-use checks require explicitly authorized disposable infrastructure and permitted database/tool surfaces. The direct-database CI runner was not executed.

## Source fingerprints

Fingerprints bind inspected working contents, not deployed remote state.

Inspected HEAD: `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9`.

| File | SHA-256 |
|---|---|
| `docker-compose.yml` | `76132a03fa5011d356dd55e1e6d75f0ff03b05bad15c792eaeda4d3c289a611a` |
| `Dockerfile.mcp` | `d20a9471bb6ac111f6e6b7918b3ab473c91c5395109ca6344e8529ef5ce39280` |
| `docker-compose.portfolio.yml` | `1a977c4509510f70a90d6493bde43af31bddd82c465c79c38d1829c83269ca85` |
| `docker/portfolio-postgres/Dockerfile` | `c6c103c46eac9637fba52b306934a7e031bcaeca66aced53467f1a299bfa4db0` |
| `scripts/brain-stack.sh` | `d3878985474a06789ba568e17de3eb7b0deeefe925fa1d5ea592bc4bdd167538` |
| `scripts/first-run.sh` | `b74a1d5727bd3b0830d03f03951141892e03b2f8fabc72bbba41de0a98649d32` |
| `scripts/first-run-setup.sh` | `64536723eb551ce6febf4f2ecfab32120732583c9fbacaa6d8da1e8222a3f2c7` |
| `scripts/validate-env.sh` | `351bfcca06353bfe93c7fc58372a1f0e2e14ea51fa0b4ff9c3f06676afe6bd0e` |
| `.env.example` | `4a256adc1f2540ebc8cf02bed1f2a8160fa600c220093b956f1b44995194f4ef` |
| `src/mcp/canonical-tools/connection.ts` | `93d3dee9b08f3138ff4f68c26b826610c899df40b4cf9f3bc3e113df3ac4d240` |
| `src/lib/postgres/connection.ts` | `f3f53b83a39cc66001684da495f6a4ce37b0627315b7e70484f28963288c46c3` |
| `src/lib/auth/mcp-authenticator.ts` | `559dc3b021bb8b7c786cbb560566b4bdd856a46df30f86b0066c4b6c8521afdd` |
| `src/lib/ruvector/embedding-service.ts` | `8e8ea06beb1c3f9495bcadd7cf1a764e43dcfd0f5d447e170a3c1a0579870db3` |
| `src/lib/health/probes.ts` | `5b655e5ac703f9d93b0f938e6a93587820658a9bf8098f511babde54a30f8aa0` |
| `src/app/api/workspaces/route.ts` | `f61dc3f44a451783e563b3e64a271b4d03f2cfa697799b17d7a9ba1b0376a32d` |
| `src/app/api/tokens/route.ts` | `d96ec572b8045986372f6c36de272a2408822886fd146b810c74fcd10c9e0a1d` |


## Result

Recon and offline syntax checks are complete. Clean installation is unverified, with concrete source gaps and an observed Docker-access boundary. Connected-agent evidence remains separate. Only this report changed; no implementation/configuration/runtime changes or semantic promotion occurred.

## Parent follow-through — read access revalidated

Brooks repeated the read-only server-version check through the execution tool's approved elevated path: `docker version --format '{{.Server.Version}}'` returned `29.2.1`, exit 0. The earlier sandbox socket denial therefore does not establish that the daemon is unavailable. No Docker write was attempted or authorized by this read check.

Present architecture judgment: a separate physical host is not intrinsically required. A reviewed standalone Compose project on an authorized daemon can be an evaluation target if every volume/network belongs to that project, bindings are loopback-only, no primary-stack names or external resources are inherited, and cleanup is limited to its resources. That profile has not been implemented or run. Initial scoped-principal provisioning, secret delivery and explicit permission to create the evaluation runtime remain unresolved. Do not repurpose the connected production integration as the trial's bootstrap.
