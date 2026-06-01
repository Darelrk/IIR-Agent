import { getHostname } from '~/utils/favicon'

export interface IndexedUrl {
  url: string
  title: string
  chunks: number
  status: 'fetching' | 'indexed' | 'error'
  error?: string
}

interface SourcesPanelProps {
  urls: IndexedUrl[]
}

export function SourcesPanel({ urls }: SourcesPanelProps) {
  if (urls.length === 0) return null

  return (
    <div className="sources-panel" role="region" aria-label="Indexed sources">
      {urls.map((u) => {
        const isSearching = u.url.startsWith('search-')
        const displayTitle =
          u.status === 'error'
            ? u.error || 'Error'
            : u.title || (isSearching ? 'Searching' : getHostname(u.url))

        return (
          <a
            key={u.url}
            href={isSearching || u.status === 'error' ? undefined : u.url}
            target={isSearching || u.status === 'error' ? undefined : '_blank'}
            rel={isSearching || u.status === 'error' ? undefined : 'noopener noreferrer'}
            className={`source-pill source-pill--${u.status}`}
            onClick={
              isSearching || u.status === 'error' ? (e) => e.preventDefault() : undefined
            }
            title={
              u.status === 'error'
                ? u.error
                : `${u.title || u.url}${u.status === 'indexed' ? ` — ${u.chunks} chunks` : ''}`
            }
          >
            <span className={`source-pill-dot source-pill-dot--${u.status}`} />
            <span className="source-pill-title">{displayTitle}</span>
            {u.status === 'indexed' && (
              <span className="source-pill-count">{u.chunks}</span>
            )}
          </a>
        )
      })}
    </div>
  )
}
