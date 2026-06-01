import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '~/components/ChatBox'
import type { Source } from '~/components/SourceList'
import type { IndexedUrl } from '~/components/SourcesPanel'
import type { FetchUrlResponse, WebSearchResponse } from '~/lib/api-types'

function generateId() {
  return crypto.randomUUID().slice(0, 8)
}

interface UseChatActionsDeps {
  /** From useSessions. Ensures an active session exists before any user action. */
  ensureActiveSession: () => Promise<string | null>
  /** Persist a message to the active session. */
  saveMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    sources?: Source[],
    sessionId?: string,
  ) => Promise<void>
  /** Update the session title (used for auto-titling). */
  updateActiveSessionTitle: (title: string, sessionId?: string) => Promise<void>
  /** Current active session ID — used for ref-based auto-title tracking. */
  activeSessionId: string | null
  /** Append a message to the chat list. */
  addMessage: (msg: Message) => void
  /** Update the most recent assistant message in place (for streaming). */
  updateLastAssistant: (updater: (msg: Message) => Message) => void
  /** Abort ref shared with useSessions for stream cancellation on session switch. */
  streamAbortRef: React.MutableRefObject<AbortController | null>
}

interface UseChatActionsResult {
  indexedUrls: IndexedUrl[]
  setIndexedUrls: React.Dispatch<React.SetStateAction<IndexedUrl[]>>
  isStreaming: boolean
  fetchUrl: (url: string) => Promise<void>
  webSearch: (query: string) => Promise<void>
  sendChat: (message: string) => Promise<void>
  /** Abort any active SSE stream (called on session switch). */
  abortStream: () => void
}

/**
 * Encapsulates all user-initiated actions that interact with the RAG pipeline:
 *  - fetchUrl: index a single URL via /api/fetch-url
 *  - webSearch: search → auto-index top results → auto-chat via /api/web-search
 *  - sendChat: streaming RAG answer via /api/chat (SSE)
 *
 * State owned: indexedUrls (badge panel) and isStreaming.
 */
export function useChatActions({
  ensureActiveSession,
  saveMessage,
  updateActiveSessionTitle,
  activeSessionId,
  addMessage,
  updateLastAssistant,
  streamAbortRef,
}: UseChatActionsDeps): UseChatActionsResult {
  const [indexedUrls, setIndexedUrls] = useState<IndexedUrl[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Track which session has been auto-titled to avoid stale-closure issues.
  // Unlike isDefaultTitle (a boolean captured at render time), this ref is
  // always read at call time — so it works even when ensureActiveSession
  // creates a new session in the same tick.
  const autoTitledSessionRef = useRef<string | null>(null)

  // Reset auto-title flag when session changes (switch or new chat)
  useEffect(() => {
    autoTitledSessionRef.current = null
  }, [activeSessionId])

  const maybeAutoTitle = useCallback(
    (preview: string, sessionId?: string) => {
      const sid = sessionId || activeSessionId
      console.log('[maybeAutoTitle]', { sessionId, activeSessionId, sid, alreadyAutoTitled: autoTitledSessionRef.current === sid })
      if (!sid) return
      if (autoTitledSessionRef.current === sid) return
      autoTitledSessionRef.current = sid
      void updateActiveSessionTitle(preview.slice(0, 40), sid)
    },
    [activeSessionId, updateActiveSessionTitle],
  )

  const fetchUrl = useCallback(
    async (url: string) => {
      const sessionId = await ensureActiveSession()
      if (!sessionId) return

      setIndexedUrls((prev) => [
        ...prev.filter((u) => u.url !== url),
        { url, title: '', chunks: 0, status: 'fetching' },
      ])

      addMessage({ id: generateId(), role: 'user', content: url })
      await saveMessage('user', url, undefined, sessionId)

      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        const data = (await res.json()) as FetchUrlResponse

        if (data.success) {
          setIndexedUrls((prev) =>
            prev.map((u) =>
              u.url === url
                ? { url, title: data.title || url, chunks: data.chunks_count, status: 'indexed' }
                : u,
            ),
          )
          const content = `URL berhasil di-index: **${data.title || url}** — ${data.chunks_count} chunks. Tanyakan sesuatu tentang halaman ini.`
          addMessage({ id: generateId(), role: 'assistant', content })
          await saveMessage('assistant', content, undefined, sessionId)
          console.log('[fetchUrl] calling maybeAutoTitle', { sessionId })
          maybeAutoTitle(url.replace(/^https?:\/\/(www\.)?/, ''), sessionId)
        } else {
          setIndexedUrls((prev) =>
            prev.map((u) =>
              u.url === url
                ? { url, title: '', chunks: 0, status: 'error', error: data.error }
                : u,
            ),
          )
          const content = `Gagal meng-index URL: ${data.error}`
          addMessage({ id: generateId(), role: 'assistant', content })
          await saveMessage('assistant', content, undefined, sessionId)
        }
      } catch (err: any) {
        setIndexedUrls((prev) =>
          prev.map((u) =>
            u.url === url
              ? { url, title: '', chunks: 0, status: 'error', error: 'Network error' }
              : u,
          ),
        )
        const content = `Error: ${err.message}`
        addMessage({ id: generateId(), role: 'assistant', content })
        await saveMessage('assistant', content, undefined, sessionId)
      }
    },
    [addMessage, ensureActiveSession, maybeAutoTitle, saveMessage],
  )

  const sendChat = useCallback(
    async (message: string) => {
      // Ensure a session exists
      const sessionId = await ensureActiveSession()
      if (!sessionId) return

      // Add user message to chat + persist
      addMessage({ id: generateId(), role: 'user', content: message })
      await saveMessage('user', message, undefined, sessionId)
      console.log('[sendChat] calling maybeAutoTitle', { sessionId, activeSessionId })
      maybeAutoTitle(message, sessionId)

      // Cancel any existing stream before starting a new one
      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
      }
      const abortController = new AbortController()
      streamAbortRef.current = abortController

      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        isStreaming: true,
      })
      setIsStreaming(true)

      // Track content locally to avoid stale-closure issues during streaming
      let accumulatedContent = ''
      let finalSources: Source[] = []

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: abortController.signal,
        })

        if (!res.ok) {
          const errorData = await res.json()
          const content = errorData.error || 'Terjadi kesalahan'
          updateLastAssistant((msg) => ({ ...msg, content, isStreaming: false }))
          await saveMessage('assistant', content, undefined, sessionId)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          const content = 'Gagal membaca response stream'
          updateLastAssistant((msg) => ({ ...msg, content, isStreaming: false }))
          await saveMessage('assistant', content, undefined, sessionId)
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
              continue
            }
            if (!line.startsWith('data: ')) continue

            const dataStr = line.slice(6).trim()
            try {
              const data = JSON.parse(dataStr)
              switch (currentEvent) {
                case 'token':
                  accumulatedContent += data.content || ''
                  updateLastAssistant((msg) => ({ ...msg, content: accumulatedContent }))
                  break
                case 'sources':
                  finalSources = data.sources || []
                  updateLastAssistant((msg) => ({ ...msg, sources: finalSources }))
                  break
                case 'done':
                  updateLastAssistant((msg) => ({ ...msg, isStreaming: false }))
                  break
                case 'error': {
                  const errContent = data.error || 'Terjadi kesalahan'
                  accumulatedContent = accumulatedContent || errContent
                  updateLastAssistant((msg) => ({
                    ...msg,
                    content: accumulatedContent,
                    isStreaming: false,
                  }))
                  break
                }
              }
            } catch {
              // ignore malformed SSE chunk
            }
          }
        }

        updateLastAssistant((msg) => ({ ...msg, isStreaming: false }))
        if (accumulatedContent) {
          await saveMessage('assistant', accumulatedContent, finalSources, sessionId)
        }
      } catch (err: any) {
        const content = `Error: ${err.message}`
        updateLastAssistant((msg) => ({
          ...msg,
          content: msg.content || content,
          isStreaming: false,
        }))
        await saveMessage('assistant', content, undefined, sessionId)
      } finally {
        setIsStreaming(false)
      }
    },
    [addMessage, ensureActiveSession, maybeAutoTitle, saveMessage, updateLastAssistant],
  )

  const webSearch = useCallback(
    async (query: string) => {
      const sessionId = await ensureActiveSession()
      if (!sessionId) return

      addMessage({ id: generateId(), role: 'user', content: query })
      await saveMessage('user', query, undefined, sessionId)

      const searchBadgeId = `search-${generateId()}`
      setIndexedUrls((prev) => [
        ...prev,
        {
          url: searchBadgeId,
          title: `Searching: "${query.slice(0, 30)}"`,
          chunks: 0,
          status: 'fetching',
        },
      ])

      try {
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
        const data = (await res.json()) as WebSearchResponse

        setIndexedUrls((prev) => prev.filter((u) => u.url !== searchBadgeId))

        if (data.success) {
          for (const urlInfo of data.urls) {
            setIndexedUrls((prev) => [
              ...prev.filter((u) => u.url !== urlInfo.url),
              {
                url: urlInfo.url,
                title: urlInfo.title || urlInfo.url,
                chunks: urlInfo.chunks_count,
                status: 'indexed' as const,
              },
            ])
          }

          const content = `Web search: **${data.urls.length} URL** berhasil di-index (**${data.total_chunks} chunks** total). Menjawab pertanyaan...`
          addMessage({ id: generateId(), role: 'assistant', content })
          await saveMessage('assistant', content, undefined, sessionId)
          console.log('[webSearch] calling maybeAutoTitle', { sessionId })
          maybeAutoTitle(query, sessionId)

          await sendChat(query)
        } else {
          const content = `Web search gagal: ${data.error}`
          addMessage({ id: generateId(), role: 'assistant', content })
          await saveMessage('assistant', content, undefined, sessionId)
        }
      } catch (err: any) {
        setIndexedUrls((prev) => prev.filter((u) => u.url !== searchBadgeId))
        const content = `Error: ${err.message}`
        addMessage({ id: generateId(), role: 'assistant', content })
        await saveMessage('assistant', content, undefined, sessionId)
      }
    },
    [addMessage, ensureActiveSession, maybeAutoTitle, saveMessage, sendChat],
  )

  const abortStream = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }
  }, [streamAbortRef])

  return {
    indexedUrls,
    setIndexedUrls,
    isStreaming,
    fetchUrl,
    webSearch,
    sendChat,
    abortStream,
  }
}
