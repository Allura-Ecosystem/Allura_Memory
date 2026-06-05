# Contributing to Allura

Thank you for your interest in Allura. This project welcomes contributions that align with its core mission: **governed memory and evidence-backed AI workflows**.

## Before You Start

1. Read [README.md](README.md) and [docs/allura/BLUEPRINT.md](docs/allura/BLUEPRINT.md)
2. Search existing [issues](https://github.com/Charitablebusinessronin/Allura_Memory/issues) to avoid duplicates
3. For significant changes, open an issue first to discuss direction

## How to Contribute

### Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Docker, Bun version)
- Relevant logs or screenshots

### Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Describe:
- The problem you're solving
- Who benefits
- How it fits Allura's governance model

### Pull Requests

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Make changes with tests
4. Run validation: `bun run typecheck && bun test`
5. Commit with [conventional commits](https://www.conventionalcommits.org/)
6. Push and open a PR using the template

## Development Setup

```bash
git clone https://github.com/Charitablebusinessronin/Allura_Memory.git
cd Allura_Memory
bun install
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
bun test
```

## Standards

- **TypeScript**: strict mode enabled
- **Tests**: required for new features
- **Docs**: update canonical docs if you change architecture
- **Governance**: all memory operations must include `group_id`

## Questions?

- [GitHub Discussions](https://github.com/Charitablebusinessronin/Allura_Memory/discussions)
- [Issues](https://github.com/Charitablebusinessronin/Allura_Memory/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
