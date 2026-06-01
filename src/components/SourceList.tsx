import { getFaviconUrl, getHostname } from '~/utils/favicon'

export interface Source {
  source_name: string
  similarity: number
  title?: string
}

interface SourceListProps {
  sources: Source[]
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) return null

  return (
    <div className="sources-section">
      <div className="sources-label">Sumber</div>
      <div className="source-cards">
        {sources.map((s, i) => {
          const hostname = getHostname(s.source_name)
          const title = s.title?.trim() || hostname

          return (
            <a
              key={i}
              href={s.source_name}
              target="_blank"
              rel="noopener noreferrer"
              className="source-card tactile-lift"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <img
                src={getFaviconUrl(s.source_name, 32)}
                alt=""
                className="source-card-favicon"
                width={16}
                height={16}
                loading="lazy"
              />

              <div className="source-card-content">
                <div className="source-card-title" title={title}>
                  {title}
                </div>
                <div className="source-card-host">{hostname}</div>
              </div>

              <svg
                className="source-card-arrow"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          )
        })}
      </div>
    </div>
  )
}
