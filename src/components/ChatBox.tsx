import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import { SourceList, type Source } from './SourceList'
import { PromptCards } from './PromptCards'
import remarkGfm from 'remark-gfm'

// Lazy-loaded: ~30kB gzipped only fetched after first assistant message renders.
const ReactMarkdown = lazy(() => import('react-markdown'))

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: Source[]
  isStreaming?: boolean
}

interface ChatBoxProps {
  messages: Message[]
  onPromptSelect?: (prompt: string) => void
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      className="message-action-btn tactile-press"
      onClick={handleCopy}
      title={copied ? 'Tersalin' : 'Salin'}
      aria-label="Salin pesan"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  )
}

interface MessageItemProps {
  msg: Message
  index: number
}

/**
 * Memoized so that the assistant's older messages don't re-parse their
 * markdown on every streaming token. Only the message whose `msg` ref
 * changed (the streaming one) re-renders.
 */
const MessageItem = memo(function MessageItem({ msg, index }: MessageItemProps) {
  return (
    <div
      className={`message-row message-row--${msg.role}`}
      style={{ animationDelay: `${Math.min(index * 50, 250)}ms` }}
    >
      <div className={`message-bubble message-bubble--${msg.role}`}>
        {msg.role === 'user' ? (
          msg.content
        ) : (
          <div className="markdown-body">
            <Suspense fallback={<>{msg.content}</>}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  text: ({ children }) => {
                    if (typeof children === 'string') {
                      const cleaned = children.replace(/【[^】]*】/g, '')
                      return <>{cleaned}</>
                    }
                    return <>{children}</>
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </Suspense>
          </div>
        )}

        {msg.isStreaming && msg.content.length === 0 && (
          <div className="loading-indicator">
            <div className="loading-dots">
              <span /><span /><span />
            </div>
            <span className="loading-text">AI sedang berpikir...</span>
          </div>
        )}

        {msg.isStreaming && msg.content.length > 0 && <span className="streaming-cursor" />}

        {msg.sources && msg.sources.length > 0 && <SourceList sources={msg.sources} />}

        {!msg.isStreaming && msg.content.length > 0 && (
          <div className="message-actions">
            <CopyButton content={msg.content} />
          </div>
        )}
      </div>
    </div>
  )
})

export function ChatBox({ messages, onPromptSelect }: ChatBoxProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <h2 className="empty-state-headline">Mau tanya soal apa hari ini?</h2>
        <p className="empty-state-sub">
          Paste URL untuk index sumber, atau ketik pertanyaan untuk mulai web search.
        </p>
        {onPromptSelect && <PromptCards onSelect={onPromptSelect} />}
      </div>
    )
  }

  return (
    <div className="chat-area">
      {messages.map((msg, index) => (
        <MessageItem key={msg.id} msg={msg} index={index} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
