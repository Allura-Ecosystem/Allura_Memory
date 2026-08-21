# Compatibility Matrix

| Component | Version | Status |
|-----------|---------|--------|
| @allura/cli | 1.0.0 | Stable |
| @allura/sdk | 1.0.0 | Stable |
| API Schema | v1 | Stable |
| Scenario Schema | v1 | Stable |
| Evaluation Result Schema | v1 | Stable |

## Deprecation Policy

- Minor version bumps are backward-compatible
- Major version bumps may break API contracts
- Deprecated features are documented for at least one minor release before removal
- Scenario and evaluation schemas are versioned independently

## Semantic Versioning

All Allura packages follow [SemVer 2.0.0](https://semver.org/).
- **MAJOR**: breaking API changes
- **MINOR**: new features, backward-compatible
- **PATCH**: bug fixes, backward-compatible