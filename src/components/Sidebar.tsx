import { groupSessionsByTime } from '~/utils/groupSessions'
import { formatRelativeTime } from '~/utils/relativeTime'
import { SpikeMark } from './SpikeMark'

export interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface SidebarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  isOpen: boolean
  onToggle: () => void
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onToggle,
}: SidebarProps) {
  const grouped = groupSessionsByTime(sessions)

  const groups: Array<{ label: string; items: Session[] }> = [
    { label: 'Hari ini', items: grouped.today },
    { label: 'Kemarin', items: grouped.yesterday },
    { label: 'Minggu ini', items: grouped.thisWeek },
    { label: 'Lebih lama', items: grouped.older },
  ].filter((g) => g.items.length > 0)

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <SpikeMark size={16} />
            <span className="sidebar-brand-name">IIR Agent</span>
          </div>

          <button className="sidebar-new-btn tactile-press" onClick={onNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        <div className="sidebar-list">
          {sessions.length === 0 && (
            <div className="sidebar-empty">
              <p>Belum ada chat</p>
              <span className="sidebar-empty-hint">Mulai percakapan baru untuk melihat history di sini.</span>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map((session) => (
                <div
                  key={session.id}
                  className={`sidebar-item ${session.id === activeSessionId ? 'sidebar-item--active' : ''}`}
                  onClick={() => onSelect(session.id)}
                >
                  <div className="sidebar-item-content">
                    <span className="sidebar-item-title" title={session.title}>
                      {session.title}
                    </span>
                    <span className="sidebar-item-time">
                      {formatRelativeTime(session.updated_at)}
                    </span>
                  </div>
                  <button
                    className="sidebar-item-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(session.id)
                    }}
                    title="Hapus chat"
                    aria-label="Hapus chat"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
