import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '~/components/ChatBox'
import type { Source } from '~/components/SourceList'
import type { Session } from '~/components/Sidebar'
import type {
  PersistedMessage,
  SessionDetailResponse,
  SessionsListResponse,
} from '~/lib/api-types'

interface UseSessionsResult {
  // State
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  isLoadingSession: boolean
  /** Whether the active session still has the default title (for auto-titling). */
  isDefaultTitle: boolean
  // Local message mutation (used by streaming hook)
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  addMessage: (msg: Message) => void
  updateLastAssistant: (updater: (msg: Message) => Message) => void
  /** Abort ref shared with useChatActions for stream cancellation on session switch. */
  streamAbortRef: React.MutableRefObject<AbortController | null>
  // Session lifecycle
  selectSession: (id: string) => void
  createSession: (title?: string) => Promise<string | null>
  deleteSession: (id: string) => Promise<void>
  ensureActiveSession: () => Promise<string | null>
  /**
   * Reset to a "fresh" state without touching the server: clear messages and
   * unset the active session. The next user input will lazily create a session
   * via `ensureActiveSession()`. Use this for the "New Chat" button so the
   * sidebar does not get polluted with empty sessions.
   */
  clearActiveSession: () => void
  // Persistence helpers
  saveMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    sources?: Source[],
    sessionId?: string,
  ) => Promise<void>
  updateActiveSessionTitle: (title: string, sessionId?: string) => Promise<void>
}

/**
 * Owns the sessions list, the active session, and the messages displayed for it.
 *
 * Key invariants:
 *  - `loadMessages` is race-safe: a stale response from an old session can't
 *    overwrite the messages of a newly-active session (request id check).
 *  - `createSession` invalidates any in-flight loadMessages before clearing UI.
 *  - `ensureActiveSession` is concurrency-safe: simultaneous callers share the
 *    same in-flight create promise instead of creating multiple sessions.
 */
export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingSession, setIsLoadingSession] = useState(false)

  const loadMessagesReqRef = useRef(0)
  const streamAbortRef = useRef<AbortController | null>(null)
  const creatingSessionPromiseRef = useRef<Promise<string | null> | null>(null)
  // Tracks a session ID we just created locally. The auto-load effect skips
  // fetching for this id so the locally-added first user message isn't wiped
  // by a DB read that hasn't seen saveMessage()'s POST yet.
  const justCreatedSessionIdRef = useRef<string | null>(null)

  // Derived: does the active session still have the default title?
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const isDefaultTitle = !activeSession || activeSession.title === 'New Chat'

  // Load all sessions on mount; auto-select latest if any.
  useEffect(() => {
    void loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When active session changes, fetch its messages — except when we just
  // created the session locally (it's empty in DB anyway, and a fetch could
  // race with saveMessage() and wipe the freshly-added user message).
  useEffect(() => {
    console.log('[activeSessionId effect]', { activeSessionId, justCreated: justCreatedSessionIdRef.current })
    if (!activeSessionId) return
    if (activeSessionId === justCreatedSessionIdRef.current) {
      justCreatedSessionIdRef.current = null
      return
    }
    console.log('[activeSessionId effect] loading messages for', activeSessionId)
    void loadMessages(activeSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) {
        console.error('loadSessions failed:', res.status, res.statusText)
        return
      }
      const data = (await res.json()) as SessionsListResponse
      if (!data.sessions) return

      // Drop any items missing a usable id — they would later break delete /
      // select operations that template the id into a URL.
      const valid = data.sessions.filter(
        (s): s is Session => !!s && typeof s.id === 'string',
      )

      setSessions(valid)
      setActiveSessionId((current) => {
        if (current) return current
        return valid.length > 0 ? valid[0].id : null
      })
    } catch (err) {
      console.error('Gagal load sessions:', err)
    }
  }

  async function loadMessages(sessionId: string) {
    const reqId = ++loadMessagesReqRef.current
    setIsLoadingSession(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (reqId !== loadMessagesReqRef.current) return // stale, drop
      if (!res.ok) {
        console.error('loadMessages failed:', res.status, res.statusText)
        setMessages([])
        return
      }
      const data = (await res.json()) as SessionDetailResponse
      if (reqId !== loadMessagesReqRef.current) return // stale, drop
      setMessages(data.messages ? data.messages.map(toClientMessage) : [])
    } catch (err) {
      console.error('Gagal load messages:', err)
      if (reqId === loadMessagesReqRef.current) {
        setMessages([])
      }
    } finally {
      if (reqId === loadMessagesReqRef.current) {
        setIsLoadingSession(false)
      }
    }
  }

  function toClientMessage(m: PersistedMessage): Message {
    let sources: Source[] = []
    if (typeof m.sources === 'string') {
      try {
        sources = JSON.parse(m.sources)
      } catch {
        sources = []
      }
    } else if (Array.isArray(m.sources)) {
      sources = m.sources
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      sources,
    }
  }

  const createSession = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New Chat' }),
      })
      if (!res.ok) {
        console.error('createSession failed:', res.status, res.statusText)
        return null
      }
      const session = await res.json()
      // Guard against malformed responses — without a valid id we'd later
      // produce DELETE /api/sessions/undefined and similar broken requests.
      if (!session || typeof session.id !== 'string') {
        console.error('createSession returned malformed payload:', session)
        return null
      }
      // Invalidate any in-flight loadMessages from previous session before
      // clearing UI state. Otherwise, a slow response could overwrite the
      // empty state of the new session.
      loadMessagesReqRef.current += 1
      // Mark this id so the auto-load effect skips fetching for it (the DB
      // is empty at this point and a fetch races with the first saveMessage).
      justCreatedSessionIdRef.current = session.id
      setSessions((prev) => [session, ...prev])
      setActiveSessionId(session.id)
      setMessages([])
      return session.id
    } catch (err) {
      console.error('Gagal buat session:', err)
      return null
    }
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      console.error('deleteSession called with invalid id:', sessionId)
      return
    }
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId)
        if (activeSessionId === sessionId) {
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id)
          } else {
            setActiveSessionId(null)
            setMessages([])
          }
        }
        return remaining
      })
    } catch (err) {
      console.error('Gagal hapus session:', err)
    }
  }, [activeSessionId])

  const selectSession = useCallback((id: string) => {
    console.log('[selectSession]', { id, currentActive: activeSessionId })
    // Abort any active SSE stream before switching
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }
    setMessages([])
    setActiveSessionId(id)
  }, [])

  const clearActiveSession = useCallback(() => {
    // Invalidate any in-flight loadMessages so its response cannot land into
    // the now-empty UI.
    loadMessagesReqRef.current += 1
    setActiveSessionId(null)
    setMessages([])
  }, [])

  /**
   * Returns the active session id, creating one if needed. Concurrent callers
   * share the same in-flight create promise to prevent duplicate sessions.
   */
  const ensureActiveSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId
    if (creatingSessionPromiseRef.current) return creatingSessionPromiseRef.current

    const promise = createSession().finally(() => {
      creatingSessionPromiseRef.current = null
    })
    creatingSessionPromiseRef.current = promise
    return promise
  }, [activeSessionId, createSession])

  const saveMessage = useCallback(
    async (role: 'user' | 'assistant' | 'system', content: string, sources?: Source[], sessionId?: string) => {
      const sid = sessionId || activeSessionId
      if (!sid) return
      try {
        await fetch(`/api/sessions/${sid}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content, sources }),
        })
      } catch (err) {
        console.error('Gagal save message:', err)
      }
    },
    [activeSessionId],
  )

  const updateActiveSessionTitle = useCallback(
    async (title: string, sessionId?: string) => {
      console.log('[updateActiveSessionTitle]', { title, sessionId, activeSessionId });
      const sid = sessionId || activeSessionId
      if (!sid) return
      try {
        await fetch(`/api/sessions/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
        setSessions((prev) =>
          prev.map((s) => (s.id === sid ? { ...s, title } : s)),
        )
      } catch (err) {
        console.error('Gagal update title:', err)
      }
    },
    [activeSessionId],
  )

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const updateLastAssistant = useCallback(
    (updater: (msg: Message) => Message) => {
      setMessages((prev) => {
        const copy = [...prev]
        const lastIdx = copy.length - 1
        if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
          copy[lastIdx] = updater(copy[lastIdx])
        }
        return copy
      })
    },
    [],
  )

  return {
    sessions,
    activeSessionId,
    messages,
    isLoadingSession,
    isDefaultTitle,
    streamAbortRef,
    setMessages,
    addMessage,
    updateLastAssistant,
    selectSession,
    createSession,
    deleteSession,
    ensureActiveSession,
    clearActiveSession,
    saveMessage,
    updateActiveSessionTitle,
  }
}
