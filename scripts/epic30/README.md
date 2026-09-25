# Epic30 owned local synthetic demo

Provisional local testing only. No interactive account, identity switcher, production approval, or Epic completion is implied.

## Prerequisites

Use the already-authorized isolated PostgreSQL test endpoint at **127.0.0.1:5444**, with owner/provisioner and restricted `allura_app` settings injected by the approved launcher environment. Required names: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD`. Do not paste credentials into documentation or command output. There is no privileged application-role fallback and no credential-file discovery.

The legacy connection validator requires `POSTGRES_PASSWORD` even for app connections. The Next child receives the restricted app credentials explicitly in both legacy and app slots; it does not receive the provisioner password in those slots.

## Launch and stop

From the worktree, in a shell with those settings already injected:

```sh
bun run demo:epic30-local launch
```

This command forces the loopback database endpoint, refuses an occupied web port before provisioning, creates a fresh uniquely owned `allura_epic30_read_<run-id>` database, applies sorted existing migrations and guarded synthetic fixtures, checks the actual restricted session/RLS/dataset, and starts Next on **127.0.0.1:4100**. It verifies exact owner document IDs/content before printing `http://127.0.0.1:4100/dashboard` and a nonsecret receipt path. Keep the launcher alive. Under Hermes, prefer a properly configured `terminal(background=true)` process.

The receipt contains the precise stop command:

```sh
bun scripts/epic30/demo.ts stop <receipt.json>
```

The stop command checks supervisor PID/start time/command/worktree before signalling it. The supervisor stops only its owned child group and verifies the port is free. Normal demo stop **retains its newly created synthetic database**. Relaunch creates a new database, not an implicit reseed/reuse of old state. There is intentionally no arbitrary database deletion command. Never reseed or repair `allura_epic30_local` through this launcher.

For disposable lifecycle testing only:

```sh
bun run demo:epic30-local launch --discard-on-stop
```

This drops only the database successfully created by that invocation and checks its absence after shutdown.

## Maintained verification lanes

`bun run ci:live-db` maintains the generic PostgreSQL 5432 inventory. Epic30 is registered separately in `vitest.config.epic30-live.ts`; run `bun run test:epic30-live` with the explicit injected prerequisites above. The dedicated command requires loopback 5444 and enables both HTTP proof cases. Missing prerequisites fail visibly. Use an isolated checkout with no owned-process lock and a free 4100 port; never stop the retained demo to free either. The routine CI Epic30 job provides a disposable 5444 PostgreSQL service. Local checks do not constitute hosted CI evidence.

## Fixture semantics

The department constraint repair applies to newly provisioned synthetic databases only. It does not upgrade or repair existing databases; the retained demo database remains untouched.

## Existing-demo browser regression

Run `bun run validate:epic30-reader --url=http://127.0.0.1:4100/dashboard --output=<evidence-directory>` against an already-running explicit synthetic demo. Optionally pass `--browser-executable=<chromium-path>` when the Playwright browser is installed outside its default cache. This uses the existing Playwright dependency, measures comparison reflow at 320/640/1440px, checks tree navigation, ARIA memory-tab keyboard behavior, authorized-snapshot search with hidden-sentinel denial, comparison focus, and honest Ask unavailability, then writes screenshots plus hashes. It does not launch, restart or reseed the demo. Search proof is limited to the already authorized client snapshot; production search remains quarantined.

Fixture replay is authority-resetting, not a general idempotent repair. It restores fixture roles, memberships and removal/revocation state. The SQL requires a matching private ownership receipt and fresh synthetic database identity. It is no longer copied into the general Docker initialization path. Conflicting document authority aborts the transaction; tests verify full rollback of documents and memberships.

## Known delivery blocker, 2026-09-17

Foreground launch/HTTP/stop and the live suite passed. Hermes background-shell diagnostics lacked explicit provisioner/app identity and the app credential, despite the foreground harness having working injected settings. No credential files or values were read into evidence, no broker was invented, and no privileged fallback was used. **No retained listener was delivered in remediation pass 1.** A correctly configured background launch is still required; do not treat the temporary HTTP proof as a running demo.
