# Story 10-4 — Chat Runtime

**Epic:** Epic 10 — Orchestration & Runtime  
**Status:** ready-for-dev  
**Priority:** P2-Medium | **Complexity:** Medium  
**Agent:** Woz  
**Roadmap Step:** 7a–7c  
**Traceability:** Epic 10 → FR34

**Description:**  
Build conversational chat interface with Anthropic API streaming, persistent history, and polish. This story integrates 3 substories:
1. **10.4a** — Chat proxy with Anthropic SDK streaming and multi-turn
2. **10.4b** — Persistent conversation history via Brain + context injection
3. **10.4c** — Chat polish: model selection, file attachments, @-mentions, conversation management

## Acceptance Criteria

### 10.4a — Chat Proxy & Streaming

- [ ] `/api/chat` route handler accepts messages array and returns SSE stream
- [ ] Multi-turn conversation with streaming responses (tokens appear incrementally)
- [ ] Brain memory search runs per turn for context augmentation
- [ ] Source attribution preserved on Brain-sourced responses
- [ ] Error states: honest retry messaging, rate limit display
- [ ] Unit and integration tests cover proxy endpoint

### 10.4b — Chat History & Context

- [ ] Every turn persisted as Brain episodic trace with `group_id: 'allura-system'`, `event_type: 'chat_turn'`
- [ ] Conversation list loads from Brain history on app open
- [ ] Search across past conversations by content
- [ ] Brain memory search still runs per turn for context augmentation
- [ ] Passes all 7 DoD checks

### 10.4c — Chat Polish

- [ ] Model switcher: Claude Opus, Sonnet, Haiku — switchable mid-conversation, persists to localStorage
- [ ] File attachments: upload button, display file list, include in message context
- [ ] @-mention autocomplete: @-memory, @-user, @-document shortcuts
- [ ] Conversation sidebar: pin/delete/export, search, new conversation button
- [ ] Copy response to clipboard, show token count
- [ ] Keyboard shortcuts: Shift+Enter for new line, Cmd/Ctrl+Enter to send

## Implementation Files

- `src/api/chat.ts` — `/api/chat` route handler
- `src/integrations/chat/proxy.ts` — Anthropic SDK wrapper with streaming
- `src/integrations/chat/history.ts` — Brain persistence + conversation loading
- `src/integrations/chat/context.ts` — per-turn context injection, memory search
- `src/components/chat/chat-page.tsx` — main chat UI
- `src/components/chat/model-switcher.tsx` — model selection
- `src/components/chat/file-upload.tsx` — file attachment input
- `src/components/chat/mention-autocomplete.tsx` — @-mention dropdown
- `src/components/chat/conversation-sidebar.tsx` — history + management

## Dev Notes

**Reference Implementation:** `src/integrations/symphony/notion-task-source.ts` (API integration pattern)  
**Shared Helpers:** Allura Brain MCP (`memory_add`, `memory_search`), Anthropic SDK, `croner` for future scheduled messages  
**Test Pattern:** Mirror `src/__tests__/canonical-http-gateway.test.ts` for API route testing  
**Previous Learnings:** SSE requires proper headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`); Anthropic streaming produces partial JSON fragments — must buffer until complete token; file attachments require multipart form data; localStorage persists model choice across sessions.

## Dependencies

- Anthropic API key in environment
- Brain MCP `memory_add`, `memory_search`, `memory_list` available
- React file input + file reader API

## Architecture Decision

**AD-1 (2026-06-06):** Embedded Claude via Anthropic API. Direct `/api/chat` proxy endpoint, not MCP-routed. (Open question: whether to integrate AionUi engine — resolve at epic start.)

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Define types: `ChatMessage`, `ChatTurn`, `ConversationMetadata`
- [ ] 2. Implement proxy.ts: Anthropic SDK wrapper with `stream: true`, token buffering, error handling
- [ ] 3. Implement `/api/chat` route: accept messages, call proxy, stream SSE response
- [ ] 4. Implement history.ts: persist turn to Brain as episodic trace, load conversation list
- [ ] 5. Implement context.ts: Brain memory search per turn, source attribution
- [ ] 6. Implement ChatPage: input/output, message list, status indicators
- [ ] 7. Implement model-switcher: Opus/Sonnet/Haiku selection, localStorage persistence
- [ ] 8. Implement file-upload: drag-drop + button, display file list, include in context
- [ ] 9. Implement mention-autocomplete: @-memory, @-user, @-document shortcuts
- [ ] 10. Implement conversation-sidebar: history list, pin/delete/export, search
- [ ] 11. Add keyboard shortcuts: Shift+Enter (new line), Cmd/Ctrl+Enter (send)
- [ ] 12. Unit tests: proxy streaming, history persistence, context injection
- [ ] 13. Integration test: chat flow → verify streaming → verify history saved to Brain

### Implementation Plan

(To be filled by Woz)

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Change Log

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
