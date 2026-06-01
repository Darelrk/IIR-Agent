# Handover: Session Switching + Auto-Title Bug Fix

## Problem Statement

Two bugs persist despite multiple fix attempts:

1. **Session name stays "New Chat"** — After user sends first message, session title in sidebar should auto-update to first 40 chars of the message. It doesn't.

2. **Cannot switch sessions** — Clicking an old session in sidebar doesn't load that session's messages.

---

## Architecture

- **Framework**: TanStack Start (React SSR + Vite)
- **Frontend**: `src/routes/index.tsx` (main page), `src/components/Sidebar.tsx`
- **Hooks**: `src/hooks/useSessions.ts` (session state), `src/hooks/useChatActions.ts` (chat actions + auto-title)
- **API**: `src/routes/api/sessions.ts` (list/create), `src/routes/api/sessions.$id.ts` (get/patch/delete)
- **Dev server**: http://localhost:3001

---

## Current Code State (Key Files)

### `src/hooks/useSessions.ts`

- `isDefaultTitle` (line 72): derived value — `!activeSession || activeSession.title === 'New Chat'`
- `selectSession` (line 223): clears messages, aborts SSE stream, sets `activeSessionId`
- `loadMessages` (line 119): fetches `GET /api/sessions/${sessionId}`, race-safe via `loadMessagesReqRef`
- `updateActiveSessionTitle` (line 272): PATCHes server, accepts optional `sessionId` param
- `streamAbortRef` (line 63): shared ref for SSE stream abort

### `src/hooks/useChatActions.ts`

- `maybeAutoTitle` (line 74): uses `autoTitledSessionRef` to track which session was auto-titled
- `sendChat` (line 148): calls `ensureActiveSession()` then `maybeAutoTitle(message, sessionId)`
- `fetchUrl` (line 85): calls `maybeAutoTitle(url, sessionId)`
- `webSearch` (line 272): calls `maybeAutoTitle(query, sessionId)`

### `src/routes/index.tsx`

- `useChatActions` deps (line 23-31): passes `activeSessionId`, `streamAbortRef`
- `handleSelectSession` (line 51): calls `sessions.selectSession(id)`, clears indexed URLs

---

## Root Cause Analysis

### Bug 1: Auto-title stale closure

**The core issue**: When `sendChat()` calls `ensureActiveSession()`, it creates a new session and sets `activeSessionId` via React state. But React batches state updates — the new `activeSessionId` isn't available in the closure until the NEXT render. So `maybeAutoTitle` runs with `activeSessionId = null` from the previous render.

**What we tried**:
- Pass `sessionId` explicitly from `sendChat` → `maybeAutoTitle` → `updateActiveSessionTitle`
- Use `autoTitledSessionRef` (a ref) instead of `isDefaultTitle` (a boolean) to track auto-title state

**Current code passes `sessionId` explicitly** — this should work. Verify with console.log:
```js
// In useChatActions.ts line 77:
console.log('[maybeAutoTitle]', { sessionId, activeSessionId, sid, alreadyAutoTitled: ... })
```

### Bug 2: Session switching

**What should happen**: Click session → `selectSession(id)` → `setMessages([])` + `setActiveSessionId(id)` → useEffect fires → `loadMessages(id)` → API returns messages → UI updates.

**What we don't know**: Does the API return correct messages? Does `loadMessages` actually get called? Does the UI update?

**Console.log added**:
```js
// useSessions.ts line 224:
console.log('[selectSession]', { id, currentActive: activeSessionId })

// useSessions.ts line 84:
console.log('[activeSessionId effect]', { activeSessionId, justCreated: justCreatedSessionIdRef.current })
```

---

## What to Debug with Chrome DevTools

1. **Open** http://localhost:3001, press F12 → Console tab

2. **Test auto-title**:
   - Type a message and submit
   - Look for `[sendChat] calling maybeAutoTitle` log → check `sessionId` value
   - Look for `[maybeAutoTitle]` log → check `sid` value (should NOT be null)
   - If `sid` is null → the `sessionId` parameter isn't reaching `maybeAutoTitle`

3. **Test session switching**:
   - Click a different session in sidebar
   - Look for `[selectSession]` log → check `id` is the clicked session
   - Look for `[activeSessionId effect]` log → check it fires with correct ID
   - Look for `[activeSessionId effect] loading messages for` log → check it actually loads
   - Check Network tab → look for `GET /api/sessions/{id}` request → check response has messages

4. **Check API directly**:
   - `GET /api/sessions` → returns list of sessions with titles
   - `GET /api/sessions/{id}` → returns `{ session, messages }`
   - `PATCH /api/sessions/{id}` with `{ title: "test" }` → should update title

---

## Files to Check

| File | Why |
|------|-----|
| `src/hooks/useChatActions.ts` | Auto-title logic, `maybeAutoTitle`, `sendChat` |
| `src/hooks/useSessions.ts` | `selectSession`, `loadMessages`, `updateActiveSessionTitle` |
| `src/routes/index.tsx` | Wiring between hooks, `handleSelectSession` |
| `src/components/Sidebar.tsx` | `onSelect` callback, session click handler |
| `src/components/ChatBox.tsx` | How messages are rendered |
| `src/routes/api/sessions.$id.ts` | GET (messages), PATCH (title) endpoints |

---

## Console.log Locations (Currently Active)

All in `src/hooks/useChatActions.ts`:
- Line 77: `[maybeAutoTitle]` — logs sessionId, activeSessionId, sid
- Line 118: `[fetchUrl] calling maybeAutoTitle` — logs sessionId
- Line 157: `[sendChat] calling maybeAutoTitle` — logs sessionId, activeSessionId
- Line 318: `[webSearch] calling maybeAutoTitle` — logs sessionId

All in `src/hooks/useSessions.ts`:
- Line 84: `[activeSessionId effect]` — logs activeSessionId, justCreated ref
- Line 224: `[selectSession]` — logs id, currentActive

---

## API Endpoints

```
GET  /api/sessions              → { sessions: Session[] }
POST /api/sessions              → { id, title, created_at, updated_at }
GET  /api/sessions/:id          → { session, messages: PersistedMessage[] }
PATCH /api/sessions/:id         → { success: true }  (body: { title })
DELETE /api/sessions/:id        → { success: true }
POST /api/sessions/:id/messages → { success: true }  (body: { role, content, sources? })
```

---

## Last Actions Taken

1. Added `sessionId` parameter to `updateActiveSessionTitle` in `useSessions`
2. Added `autoTitledSessionRef` in `useChatActions` to track auto-titled sessions
3. Changed `selectSession` to clear messages + abort stream before switching
4. Added `streamAbortRef` shared between hooks
5. Passed `activeSessionId` (instead of `isDefaultTitle`) to `useChatActions`
6. Added console.log at 6 key points for debugging
7. Fixed TypeScript compile errors:
   - **Masalah**: Fungsi `saveMessage` dipanggil dengan 4 parameter (termasuk `sessionId` optional) di `useChatActions.ts` untuk menghindari stale closure, tetapi interface `UseSessionsResult` (di `useSessions.ts`) dan `UseChatActionsDeps` (di `useChatActions.ts`) hanya mendeklarasikan 3 parameter.
   - **Solusi**: Update tipe `saveMessage` pada kedua interface agar menerima parameter opsional `sessionId?: string`.
8. TypeScript kompilasi bersih (`npx tsc --noEmit` — sukses tanpa error).
9. Build produksi sukses (`npm run build`).
