import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent,
} from 'react'

interface ChatInputProps {
  onSubmit: (text: string) => void
  disabled?: boolean
}

export interface ChatInputHandle {
  setValue: (v: string) => void
  focus: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ onSubmit, disabled }, ref) {
    const [value, setValue] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(
      ref,
      () => ({
        setValue: (v: string) => {
          setValue(v)
          // Defer focus to next tick after re-render
          requestAnimationFrame(() => {
            const el = textareaRef.current
            if (el) {
              el.focus()
              el.setSelectionRange(v.length, v.length)
            }
          })
        },
        focus: () => textareaRef.current?.focus(),
      }),
      [],
    )

    // Auto-resize textarea
    useEffect(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }, [value])

    function handleSubmit() {
      const trimmed = value.trim()
      if (!trimmed || disabled) return
      onSubmit(trimmed)
      setValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      textareaRef.current?.focus()
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    }

    const canSend = !disabled && value.trim().length > 0

    return (
      <div className="chat-input-wrapper">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Paste URL atau tanyakan sesuatu..."
            rows={1}
            className="chat-textarea"
          />
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`chat-send-btn ${canSend ? 'chat-send-btn--active' : 'chat-send-btn--disabled'}`}
            aria-label="Kirim pesan"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
        <div className="chat-input-hint">
          <kbd>Enter</kbd> kirim · <kbd>Shift+Enter</kbd> baris baru
        </div>
      </div>
    )
  },
)
