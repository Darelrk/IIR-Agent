import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { ChatBox } from '~/components/ChatBox'
import { ChatInput, type ChatInputHandle } from '~/components/ChatInput'
import { MobileMenuButton } from '~/components/MobileMenuButton'
import { Sidebar } from '~/components/Sidebar'
import { SourcesPanel } from '~/components/SourcesPanel'
import { useChatActions } from '~/hooks/useChatActions'
import { useSessions } from '~/hooks/useSessions'

export const Route = createFileRoute('/')({
  component: HomePage,
})

const URL_REGEX = /https?:\/\/[^\s]+/

function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const chatInputRef = useRef<ChatInputHandle>(null)

  const sessions = useSessions()

  const chat = useChatActions({
    ensureActiveSession: sessions.ensureActiveSession,
    saveMessage: sessions.saveMessage,
    updateActiveSessionTitle: sessions.updateActiveSessionTitle,
    activeSessionId: sessions.activeSessionId,
    addMessage: sessions.addMessage,
    updateLastAssistant: sessions.updateLastAssistant,
    streamAbortRef: sessions.streamAbortRef,
  })

  const handleSubmit = useCallback(
    (text: string) => {
      const urlMatch = text.match(URL_REGEX)
      if (urlMatch) {
        void chat.fetchUrl(urlMatch[0])
        return
      }
      // All non-URL input goes to /api/chat — backend routes between
      // vector search, web search, and hybrid automatically.
      void chat.sendChat(text)
    },
    [chat],
  )

  const handlePromptSelect = useCallback((prompt: string) => {
    chatInputRef.current?.setValue(prompt)
  }, [])

  const handleSelectSession = useCallback(
    (id: string) => {
      sessions.selectSession(id)
      chat.setIndexedUrls([])
      setSidebarOpen(false)
    },
    [chat, sessions],
  )

  const handleNewChat = useCallback(() => {
    // Lazy: just reset UI state. The next user input will create a real
    // session via ensureActiveSession(), so empty "New Chat" entries don't
    // pollute the sidebar.
    sessions.clearActiveSession()
    chat.setIndexedUrls([])
    setSidebarOpen(false)
  }, [chat, sessions])

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions.sessions}
        activeSessionId={sessions.activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
        onDelete={sessions.deleteSession}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <div className="main-area">
        <MobileMenuButton
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />

        <div className="main-content">
          <SourcesPanel urls={chat.indexedUrls} />

          <ChatBox messages={sessions.messages} onPromptSelect={handlePromptSelect} />

          <ChatInput
            ref={chatInputRef}
            onSubmit={handleSubmit}
            disabled={chat.isStreaming}
          />
        </div>
      </div>
    </div>
  )
}
