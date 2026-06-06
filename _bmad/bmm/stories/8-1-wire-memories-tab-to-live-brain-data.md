# Story 8.1 — Wire Memories Tab to Live Brain Data

## Story

As a user viewing the Memories tab in the Allura dashboard, I want to see real memories from Allura Brain via MCP Streamable HTTP so I can search and browse actual stored memories instead of hardcoded placeholder data.

## Status
done

## Completion Notes
Implemented MCP Streamable HTTP handshake (initialize + tools/call with session header), CORS expose-headers fix for mcp-session-id, parseMcpToolPayload for SSE data frames, fetchBrainMemories with loading/error/ready states. Verified end-to-end in browser: 3 real memories render, zero console errors. Reference implementation for stories 8-2 through 8-6.
