# Allura load-test sources

For performance engineers evaluating a provisioned, authorized disposable environment. This directory contains a k6 workload and a shell runner. **Start with the source review below before executing either file.** A load test writes data and can consume substantial resources; it is not the first-memory setup task.

The p95 latency and concurrency figures in these files are targets, not current measurements or product guarantees. No load run was performed in this documentation revision.

## Current source limitations

- [The workload](k6-load-test.js) defaults to an old port and hardcodes `allura-system-loadtest`; choosing that string does not grant a credential access to that scope.
- [The shell runner](run-load-test.sh) prints its constructed command, including an authentication argument when supplied. Review and repair secret handling before using a real token.
- The workload includes health/metrics assumptions that must be compared with the selected current gateway. A reachable health endpoint does not establish workspace authorization or a successful memory round trip.

These limitations make the existing runner unsuitable as a ready-to-copy production recipe. Do not work around a denied tenant by changing the credential, endpoint or group.

## Evaluation prerequisites and evidence

Use the shared [first-use guide](../../docs/user-guide/getting-started.md) to establish the endpoint and authenticated memory contract. Separately obtain an authorized load-test environment, resource limits, disposable-data policy and current k6 documentation before changing or running the workload.

A valid performance report identifies workload source revision, gateway revision, environment, principal/scope setup without secrets, concurrency, duration, error rate, metric definitions and retained output. Separate connection errors and authorization failures from memory latency. Record observed percentiles rather than repeating a target as a result.

The [benchmark harness reference](../../src/__benchmarks__/BENCHMARK-README.md) covers other quality measurements. Neither suite substitutes for the [five-person first-use study](../../docs/reference/reddit-remediation/usability-study.md).

*AI-assisted editorial revision, 2026-10-20. Runtime repairs and a fresh load-test result remain open.*
