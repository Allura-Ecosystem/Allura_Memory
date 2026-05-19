# Development Readiness Checklist

Use this before starting development or dispatching a `Ralph Loop`.

## Five Green Lights

1. Brain is running.
   - Check: `bun run brain:status`
2. MCP is reachable.
   - Check: `curl http://localhost:5888/health`
3. Scout context is loaded.
   - Read: `.opencode/context/index.md`
4. Skills are chosen.
    - Required for memory work: `allura-memory-skill`
    - Required for Docker/MCP work: `mcp-docker`
5. Validation and acceptance criteria are named before any `Ralph Loop` or build.
   - Confirm `Ralph Loop Eligible` by checking objective clarity and stop criteria.
    - Minimum namespace check: `bun test src/lib/validation/group-id.test.ts`
    - Memory search filter check: `bun test src/lib/graph-adapter/neo4j-adapter.test.ts`

6. `Ralph Loop` completion is machine-checkable.
   - Confirm required marker set: `<promise>DONE</promise>` or `<promise>COMPLETE</promise>`
   - Confirm required command has explicit `--max-iterations` or equivalent bounded stop.

## Simple Rule

If any green light is missing, stop and fix the runway before writing feature code.
