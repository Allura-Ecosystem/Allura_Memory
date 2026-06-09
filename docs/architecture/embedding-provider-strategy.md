# Embedding Provider Strategy

## Summary

Allura Memory should support embeddings through a provider interface instead of depending on Ollama.

The cheapest and easiest default is FastEmbed running locally. This keeps embeddings private, low cost, and simple on the current Ubuntu and Docker system.

OpenAI embeddings should be available as an optional hosted fallback. Hugging Face Text Embeddings Inference should be reserved for a later production service mode.

## Why

Allura needs embeddings for memory search, semantic matching, promotion checks, and long-term recall. Embeddings should not be locked to one runtime.

Ollama can still be useful for local LLMs, but embeddings should have their own adapter. That makes the system lighter, cheaper, and easier to deploy across nonprofit, Faith Meats, freelance, personal, and coding tenants.

## Provider order

1. FastEmbed as the default local provider.
2. OpenAI text-embedding-3-small as an optional hosted fallback.
3. Hugging Face TEI as a later production service provider.

## Required behavior

All embedding calls should go through one provider interface.

The provider must declare its name, model, dimensions, and embedTexts behavior.

Embedding writes must include tenant and group metadata.

No tenant ID means no embedding write.

## Storage rule

Do not mix vector dimensions in the same vector table or collection.

If Allura starts with 384-dimensional FastEmbed vectors and later moves to 1536-dimensional OpenAI vectors, the system must create a new vector namespace or run a controlled re-embedding migration.

## Acceptance criteria

- Add one embedding provider interface.
- Add FastEmbed as the default local provider.
- Add config keys for provider, model, dimensions, and optional base URL.
- Add OpenAI embeddings as an optional fallback provider.
- Keep Ollama optional and not required for embeddings.
- Enforce tenant and group metadata before embedding writes.
- Prevent incompatible vector dimensions from sharing the same collection or table.
- Add smoke test for embedding three sample memory strings.
- Add documentation explaining FastEmbed, OpenAI fallback, and future TEI mode.

## Non-goals

- Do not require Ollama for embeddings.
- Do not require GPU acceleration for the first version.
- Do not introduce a paid managed vector database as the default.
- Do not merge nonprofit, Faith Meats, freelance, personal, and coding memories into one shared vector namespace.
- Do not rewrite the full memory stack in this PR.

## Suggested files

- src/embeddings/provider.ts
- src/embeddings/config.ts
- src/embeddings/providers/fastembed.ts
- src/embeddings/providers/openai.ts
- docs/architecture/embedding-provider-strategy.md

## Test plan

- bun test
- bun run typecheck
- FastEmbed smoke test confirms input count 3, dimension 384, provider fastembed, and model BAAI/bge-small-en-v1.5.
